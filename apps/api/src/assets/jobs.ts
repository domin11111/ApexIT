import { Queue, type ConnectionOptions } from 'bullmq';
import type { FastifyBaseLogger } from 'fastify';
import type { CatalogPublisher } from '../admin/publish';
import { audit } from '../admin/audit';
import type { Db } from '../db/prisma';
import type { Prisma } from '../generated/prisma/client';
import type { Storage } from '../storage/storage';
import { ModelError, processModel } from './process-model';

export const ASSET_QUEUE = 'assets';
export type ModelJob = { assetId: string };

/** BullMQ требует maxRetriesPerRequest: null — воркер держит блокирующие команды */
export function queueConnection(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    db: Number(url.pathname.slice(1) || 0),
    maxRetriesPerRequest: null,
  };
}

/** Очередь обработки моделей. API только ставит задачи, тяжёлую работу делает отдельный процесс (src/worker.ts). */
export interface ModelQueue {
  enqueue(assetId: string): Promise<void>;
  close(): Promise<void>;
}

export function createModelQueue(redisUrl: string): ModelQueue {
  const queue = new Queue<ModelJob>(ASSET_QUEUE, { connection: queueConnection(redisUrl) });
  return {
    async enqueue(assetId) {
      // jobId = assetId: повторное «complete» не создаёт вторую задачу
      await queue.add('process-model', { assetId }, { jobId: assetId, attempts: 2, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 100, removeOnFail: 500 });
    },
    close: () => queue.close(),
  };
}

export type ModelJobDeps = {
  prisma: Db;
  storage: Storage;
  publisher: CatalogPublisher;
  ktxDir: string | undefined;
  log: FastifyBaseLogger;
};

const asJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

/**
 * Задача воркера: обработать модель и записать результат в Asset.
 * Десктопный вариант — сама запись Asset (её id уже знает админка), мобильный — дочерний Asset.
 */
export async function runModelJob(deps: ModelJobDeps, assetId: string): Promise<void> {
  const { prisma, storage, log } = deps;
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) {
    log.warn({ assetId }, 'Задача для удалённого ассета — пропускаем');
    return;
  }
  const meta = (asset.meta ?? {}) as Record<string, unknown>;
  const sourceKey = typeof meta.sourceKey === 'string' ? meta.sourceKey : asset.storageKey;
  await prisma.asset.update({ where: { id: assetId }, data: { status: 'PROCESSING' } });

  try {
    const result = await processModel({ assetId, sourceKey, storage, ktxDir: deps.ktxDir });
    const oldVariants = await prisma.asset.findMany({ where: { sourceId: assetId } });
    const previousKey = asset.storageKey !== sourceKey ? asset.storageKey : null;

    await prisma.$transaction(async (tx) => {
      await tx.asset.deleteMany({ where: { sourceId: assetId } });
      await tx.asset.update({
        where: { id: assetId },
        data: {
          status: 'READY',
          storageKey: result.desktop.key,
          url: storage.publicUrl(result.desktop.key),
          sizeBytes: result.desktop.bytes,
          checksum: result.desktop.checksum,
          meta: asJson({
            ...meta,
            sourceKey,
            error: null,
            source: result.source,
            desktop: { bytes: result.desktop.bytes, triangles: result.desktop.triangles },
            mobile: { bytes: result.mobile.bytes, triangles: result.mobile.triangles },
            ktx2: result.ktx2,
            warnings: result.warnings,
            processedAt: new Date().toISOString(),
          }),
        },
      });
      await tx.asset.create({
        data: {
          type: 'GLB',
          variant: 'MOBILE',
          status: 'READY',
          storageKey: result.mobile.key,
          url: storage.publicUrl(result.mobile.key),
          mimeType: 'model/gltf-binary',
          sizeBytes: result.mobile.bytes,
          checksum: result.mobile.checksum,
          meta: asJson({ triangles: result.mobile.triangles }),
          sourceId: assetId,
        },
      });
      await audit(tx, {
        userId: null,
        action: 'asset.process',
        entity: 'Asset',
        entityId: assetId,
        diff: { status: { before: asset.status, after: 'READY' }, triangles: result.desktop.triangles, warnings: result.warnings },
      });
    });

    // Старые файлы прошлой обработки больше не нужны
    await storage.delete([...(previousKey ? [previousKey] : []), ...oldVariants.map((v) => v.storageKey)]).catch(() => undefined);

    const usedBy = await prisma.product.count({ where: { modelAssetId: assetId } });
    if (usedBy > 0) await deps.publisher(`asset:${assetId}`);
    log.info({ assetId, ...result.desktop, warnings: result.warnings }, 'Модель обработана');
  } catch (err) {
    const message = err instanceof ModelError ? err.message : `Сбой обработки: ${(err as Error).message}`;
    await prisma.asset.update({
      where: { id: assetId },
      data: { status: 'FAILED', meta: asJson({ ...meta, sourceKey, error: message }) },
    });
    log.error({ err, assetId }, 'Модель не обработана');
    // Ошибку содержимого повторять бессмысленно; сбой окружения BullMQ повторит сам
    if (!(err instanceof ModelError)) throw err;
  }
}
