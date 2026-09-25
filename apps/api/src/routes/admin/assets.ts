import { randomUUID } from 'node:crypto';
import {
  AdminAsset,
  AdminAssetUpdate,
  ApiError,
  IdParam,
  MAX_UPLOAD_BYTES,
  OkResponse,
  PreviewUpload,
  UploadRequest,
  UploadTicket,
} from '@apex/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { audit } from '../../admin/audit';
import { requireAdmin } from '../../admin/session';
import type { Prisma } from '../../generated/prisma/client';
import { HttpError } from '../../http/errors';
import type { AdminDeps } from './deps';

const errors = { 400: ApiError, 401: ApiError, 403: ApiError, 404: ApiError, 409: ApiError, 429: ApiError };
const UPLOAD_TTL_SECONDS = 15 * 60;
const GLB_TYPE = 'model/gltf-binary';

const assetInclude = {
  variants: { orderBy: { variant: 'asc' } },
  modelFor: { select: { id: true, brand: true, name: true } },
} satisfies Prisma.AssetInclude;
type AssetRow = Prisma.AssetGetPayload<{ include: typeof assetInclude }>;

const metaOf = (asset: { meta: unknown }) => (asset.meta && typeof asset.meta === 'object' ? (asset.meta as Record<string, unknown>) : {});

const toAdminAsset = (asset: AssetRow): AdminAsset => ({
  id: asset.id,
  fileName: String(metaOf(asset).fileName ?? 'model.glb'),
  status: asset.status,
  url: asset.url,
  sizeBytes: asset.sizeBytes,
  meta: metaOf(asset),
  variants: asset.variants.map((v) => ({ id: v.id, variant: v.variant, status: v.status, url: v.url, sizeBytes: v.sizeBytes })),
  usedBy: asset.modelFor.map((p) => ({ id: p.id, name: `${p.brand} ${p.name}` })),
  createdAt: asset.createdAt.toISOString(),
});

/**
 * Загрузка 3D-моделей (B4): presigned URL → браузер кладёт GLB прямо в S3 → «complete» ставит задачу
 * воркеру (сжатие, мобильный вариант) → админка опрашивает статус. Превью-рендер делает браузер.
 */
export const assetRoutes: FastifyPluginAsyncZod<{ deps: AdminDeps }> = async (app, { deps }) => {
  const { prisma, storage, queue, publisher } = deps;

  const findAsset = async (id: string) => {
    const asset = await prisma.asset.findUnique({ where: { id }, include: assetInclude });
    if (!asset || asset.type !== 'GLB' || asset.sourceId !== null) throw new HttpError(404, 'NOT_FOUND', 'Модель не найдена');
    return asset;
  };

  app.get(
    '/assets',
    { schema: { tags: ['admin'], summary: 'Загруженные 3D-модели', response: { 200: z.object({ items: z.array(AdminAsset) }), ...errors } } },
    async (request) => {
      requireAdmin(request);
      const assets = await prisma.asset.findMany({ where: { type: 'GLB', sourceId: null }, include: assetInclude, orderBy: { id: 'desc' } });
      return { items: assets.map(toAdminAsset) };
    },
  );

  app.get(
    '/assets/:id',
    { schema: { tags: ['admin'], summary: 'Модель и её варианты', params: IdParam, response: { 200: AdminAsset, ...errors } } },
    async (request) => {
      requireAdmin(request);
      return toAdminAsset(await findAsset(request.params.id));
    },
  );

  app.post(
    '/assets/uploads',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 hour' } },
      schema: { tags: ['admin'], summary: 'Presigned URL для загрузки GLB', body: UploadRequest, response: { 201: UploadTicket, ...errors } },
    },
    async (request, reply) => {
      const admin = requireAdmin(request);
      const id = randomUUID();
      const sourceKey = `uploads/${id}/source.glb`;
      await prisma.asset.create({
        data: {
          id,
          type: 'GLB',
          variant: 'DESKTOP',
          status: 'PENDING',
          storageKey: sourceKey,
          url: '',
          mimeType: GLB_TYPE,
          meta: { fileName: request.body.fileName, declaredBytes: request.body.sizeBytes, sourceKey, uploadedBy: admin.user.email },
        },
      });
      const uploadUrl = await storage.presignPut(sourceKey, GLB_TYPE, UPLOAD_TTL_SECONDS);
      return reply.code(201).send({ assetId: id, uploadUrl, headers: { 'content-type': GLB_TYPE }, expiresInSeconds: UPLOAD_TTL_SECONDS });
    },
  );

  app.post(
    '/assets/:id/complete',
    { schema: { tags: ['admin'], summary: 'Файл загружен — поставить в обработку', params: IdParam, response: { 200: AdminAsset, ...errors } } },
    async (request) => {
      const admin = requireAdmin(request);
      const asset = await findAsset(request.params.id);
      const sourceKey = String(metaOf(asset).sourceKey ?? asset.storageKey);
      const size = await storage.size(sourceKey);
      if (size === null) throw new HttpError(409, 'UPLOAD_MISSING', 'Файл не найден в хранилище — загрузите его ещё раз');
      if (size > MAX_UPLOAD_BYTES) {
        await storage.delete([sourceKey]);
        throw new HttpError(400, 'UPLOAD_TOO_LARGE', 'Файл больше 100 МБ');
      }
      const updated = await prisma.asset.update({
        where: { id: asset.id },
        data: { status: 'PROCESSING', meta: { ...metaOf(asset), sourceBytes: size, error: null } },
        include: assetInclude,
      });
      await queue.enqueue(asset.id);
      await audit(prisma, { userId: admin.user.id, action: 'asset.upload', entity: 'Asset', entityId: asset.id, diff: { fileName: metaOf(asset).fileName, bytes: size }, ip: request.ip });
      return toAdminAsset(updated);
    },
  );

  app.patch(
    '/assets/:id',
    { schema: { tags: ['admin'], summary: 'Манифест модели: оси, имена узлов, разметка rig', params: IdParam, body: AdminAssetUpdate, response: { 200: AdminAsset, ...errors } } },
    async (request) => {
      const admin = requireAdmin(request);
      const asset = await findAsset(request.params.id);
      const before = metaOf(asset).manifest ?? null;
      const updated = await prisma.$transaction(async (tx) => {
        const row = await tx.asset.update({
          where: { id: asset.id },
          data: { meta: JSON.parse(JSON.stringify({ ...metaOf(asset), manifest: request.body.manifest })) as Prisma.InputJsonValue },
          include: assetInclude,
        });
        await audit(tx, { userId: admin.user.id, action: 'asset.manifest', entity: 'Asset', entityId: asset.id, diff: { manifest: { before, after: request.body.manifest } }, ip: request.ip });
        return row;
      });
      if (updated.modelFor.length > 0) await publisher(`asset:${asset.id}`);
      return toAdminAsset(updated);
    },
  );

  app.post(
    '/assets/:id/preview',
    // Картинка приходит data URL в JSON — лимит тела больше стандартного 1 МБ
    { bodyLimit: 3_000_000, schema: { tags: ['admin'], summary: 'Превью-рендер модели (PNG/WebP из браузера)', params: IdParam, body: PreviewUpload, response: { 200: AdminAsset, ...errors } } },
    async (request) => {
      requireAdmin(request);
      const asset = await findAsset(request.params.id);
      const [header, base64] = request.body.dataUrl.split(',');
      const contentType = header!.slice(5, header!.indexOf(';'));
      const key = `public/previews/${asset.id}-${Date.now().toString(36)}.${contentType === 'image/webp' ? 'webp' : 'png'}`;
      await storage.put(key, Buffer.from(base64!, 'base64'), contentType, 'public, max-age=31536000, immutable');
      const oldKey = metaOf(asset).previewKey;
      const updated = await prisma.asset.update({
        where: { id: asset.id },
        data: { meta: { ...(metaOf(asset) as Prisma.InputJsonObject), previewKey: key, previewUrl: storage.publicUrl(key) } },
        include: assetInclude,
      });
      if (typeof oldKey === 'string') await storage.delete([oldKey]).catch(() => undefined);
      return toAdminAsset(updated);
    },
  );

  app.post(
    '/assets/:id/reprocess',
    { schema: { tags: ['admin'], summary: 'Обработать заново (например, после установки KTX-Software)', params: IdParam, response: { 200: AdminAsset, ...errors } } },
    async (request) => {
      requireAdmin(request);
      const asset = await findAsset(request.params.id);
      // Модели из tools/blender лежат в статике сайта готовыми — исходника в S3 у них нет
      if (typeof metaOf(asset).sourceKey !== 'string') throw new HttpError(409, 'NO_SOURCE', 'У модели нет загруженного исходника для повторной обработки');
      const updated = await prisma.asset.update({ where: { id: asset.id }, data: { status: 'PROCESSING' }, include: assetInclude });
      await queue.enqueue(asset.id);
      return toAdminAsset(updated);
    },
  );

  app.delete(
    '/assets/:id',
    { schema: { tags: ['admin'], summary: 'Удалить модель (только администратор, если не используется)', params: IdParam, response: { 200: OkResponse, ...errors } } },
    async (request) => {
      const admin = requireAdmin(request, { role: 'ADMIN' });
      const asset = await findAsset(request.params.id);
      if (asset.modelFor.length > 0) {
        throw new HttpError(409, 'ASSET_IN_USE', `Модель используется: ${asset.modelFor.map((p) => `${p.brand} ${p.name}`).join(', ')}`);
      }
      const meta = metaOf(asset);
      const keys = [asset.storageKey, ...asset.variants.map((v) => v.storageKey), meta.sourceKey, meta.previewKey].filter(
        (key): key is string => typeof key === 'string' && key.length > 0,
      );
      await prisma.$transaction(async (tx) => {
        await tx.asset.delete({ where: { id: asset.id } });
        await audit(tx, { userId: admin.user.id, action: 'asset.delete', entity: 'Asset', entityId: asset.id, diff: { fileName: meta.fileName }, ip: request.ip });
      });
      await storage.delete([...new Set(keys)]).catch(() => undefined);
      return { ok: true } as const;
    },
  );
};
