import type { CatalogRecords } from '@apex/collection';
import { Prisma } from '../generated/prisma/client';
import type { Db } from './prisma';

export type SeedStats = { platforms: number; created: number; updated: number; skipped: number; motherboards: number };

/** JSON-поля записей (переводы, координаты) → вход Prisma. */
const json = (value: unknown) => value as Prisma.InputJsonValue;

/**
 * Синхронизирует БД с записями коллекции. Идемпотентен.
 *
 * Дочерние записи продукта (характеристики, хотспоты, совместимость) пересоздаются целиком,
 * поэтому при overwriteExisting = false уже существующие продукты не трогаются —
 * их могли поправить в админке. Id записей из коллекции в БД не переносятся: там свои uuid v7.
 */
export async function seedCatalog(
  prisma: Db,
  records: CatalogRecords,
  { overwriteExisting = true }: { overwriteExisting?: boolean } = {},
): Promise<SeedStats> {
  const stats: SeedStats = { platforms: 0, created: 0, updated: 0, skipped: 0, motherboards: 0 };

  // ── Платформы ─────────────────────────────────────────────────────────────
  const platformIds = new Map<string, string>();
  for (const { id: _id, socket, i18n, ...columns } of records.platforms) {
    const data = { ...columns, i18n: json(i18n) };
    const { id } = await prisma.platform.upsert({
      where: { socket },
      create: { socket, ...data },
      update: data,
      select: { id: true },
    });
    platformIds.set(socket, id);
    stats.platforms++;
  }
  const platformId = (socket: string) => {
    const id = platformIds.get(socket);
    if (!id) throw new Error(`Платформа ${socket} не найдена`);
    return id;
  };

  // ── Продукты ──────────────────────────────────────────────────────────────
  const publishedAt = new Date();
  for (const product of records.products) {
    const existing = await prisma.product.findUnique({ where: { slug: product.slug }, select: { id: true } });
    if (existing && !overwriteExisting) {
      stats.skipped++;
      continue;
    }

    const {
      id: _id,
      slug,
      publishedAt: _publishedAt,
      i18n,
      heroImage: _heroImage,
      modelAsset: _modelAsset,
      specGroups,
      hotspots,
      compatibility,
      ...columns
    } = product;
    const data = { ...columns, i18n: json(i18n) };

    await prisma.$transaction(
      async (tx) => {
        const { id: productId } = await tx.product.upsert({
          where: { slug },
          create: { slug, ...data, publishedAt },
          update: data,
          select: { id: true },
        });

        // Характеристики удаляются каскадом вместе с группами.
        await tx.specGroup.deleteMany({ where: { productId } });
        await tx.hotspot.deleteMany({ where: { productId } });
        await tx.compatibility.deleteMany({ where: { productId } });

        for (const { specs, i18n: groupI18n, ...group } of specGroups) {
          const { id: groupId } = await tx.specGroup.create({
            data: { ...group, productId, i18n: json(groupI18n) },
            select: { id: true },
          });
          await tx.spec.createMany({
            data: specs.map(({ i18n: specI18n, ...spec }) => ({
              ...spec,
              productId,
              groupId,
              i18n: json(specI18n),
            })),
          });
        }

        await tx.hotspot.createMany({
          data: hotspots.map((hotspot) => ({
            ...hotspot,
            productId,
            position: json(hotspot.position),
            cameraPosition: json(hotspot.cameraPosition),
            cameraTarget: hotspot.cameraTarget == null ? Prisma.DbNull : json(hotspot.cameraTarget),
            i18n: json(hotspot.i18n),
          })),
        });

        await tx.compatibility.createMany({
          data: compatibility.map(({ platform, i18n: compatI18n, ...c }) => ({
            ...c,
            productId,
            platformId: platformId(platform.socket),
            i18n: json(compatI18n),
          })),
        });
      },
      { timeout: 30_000 },
    );

    stats[existing ? 'updated' : 'created']++;
  }

  // ── Материнские платы ─────────────────────────────────────────────────────
  for (const { id: _id, vendor, model, platform, i18n, ...columns } of records.motherboards) {
    const data = { ...columns, platformId: platformId(platform.socket), i18n: json(i18n) };
    await prisma.motherboard.upsert({
      where: { vendor_model: { vendor, model } },
      create: { vendor, model, ...data },
      update: data,
    });
    stats.motherboards++;
  }

  await prisma.auditLog.create({
    data: { action: 'seed.run', entity: 'Collection', entityId: 'compute-collection-2026', diff: stats },
  });

  return stats;
}
