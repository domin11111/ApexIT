import {
  AdminHotspotsPayload,
  AdminMotherboard,
  AdminMotherboardCreate,
  AdminMotherboardUpdate,
  AdminPlatform,
  AdminPlatformUpdate,
  AdminProduct,
  AdminProductDetail,
  AdminProductListItem,
  AdminProductUpdate,
  AdminSpecsPayload,
  ApiError,
  IdParam,
  OkResponse,
  PublishRequest,
  Vec3,
  type AdminHotspot,
  type AdminSpecGroup,
  type Localized,
} from '@apex/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { audit } from '../../admin/audit';
import { requireAdmin } from '../../admin/session';
import type { Prisma } from '../../generated/prisma/client';
import { HttpError } from '../../http/errors';
import type { AdminDeps } from './deps';

const errors = { 400: ApiError, 401: ApiError, 403: ApiError, 404: ApiError, 409: ApiError, 429: ApiError };

// ── i18n: ru — базовые колонки, en — JSON ────────────────────────────────────

type I18n = Record<string, Record<string, string>>;
const asI18n = (value: unknown): I18n => (value && typeof value === 'object' && !Array.isArray(value) ? (value as I18n) : {});
const en = (i18n: unknown, field: string) => asI18n(i18n).en?.[field] ?? '';
const loc = (ru: string, i18n: unknown, field: string): Localized => ({ ru, en: en(i18n, field) });
const locOrNull = (ru: string | null, i18n: unknown, field: string): Localized | null =>
  ru === null && !en(i18n, field) ? null : { ru: ru ?? '', en: en(i18n, field) };

/** Английские переводы в JSON: пустая строка = перевода нет, поле удаляется */
function withEnglish(current: unknown, fields: Record<string, Localized | null | undefined>): Prisma.InputJsonValue {
  const i18n = asI18n(current);
  const english = { ...(i18n.en ?? {}) };
  for (const [field, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (value && value.en) english[field] = value.en;
    else delete english[field];
  }
  return { ...i18n, en: english } as Prisma.InputJsonValue;
}
const onlyEnglish = (fields: Record<string, Localized | null>) => withEnglish({}, fields);

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Record<string, unknown>;

// ── Преобразования записей ───────────────────────────────────────────────────

type ProductRow = Prisma.ProductGetPayload<object>;
function toAdminProduct(p: ProductRow): AdminProduct {
  return {
    id: p.id,
    slug: p.slug,
    category: p.category,
    publishedAt: p.publishedAt?.toISOString() ?? null,
    updatedAt: p.updatedAt.toISOString(),
    name: p.name,
    brand: p.brand,
    codename: p.codename,
    headline: p.headline,
    tagline: loc(p.tagline, p.i18n, 'tagline'),
    description: loc(p.description, p.i18n, 'description'),
    status: p.status,
    availabilityWindow: p.availabilityWindow,
    availabilityNote: locOrNull(p.availabilityNote, p.i18n, 'availabilityNote'),
    accentColor: p.accentColor,
    accentColorAlt: p.accentColorAlt,
    modelPreset: p.modelPreset,
    modelAssetId: p.modelAssetId,
    sortOrder: p.sortOrder,
  };
}

type PlatformRow = Prisma.PlatformGetPayload<object>;
const toAdminPlatform = (p: PlatformRow): AdminPlatform => ({
  id: p.id,
  socket: p.socket,
  name: p.name,
  cpuFamily: p.cpuFamily,
  memoryChannels: p.memoryChannels,
  dimmsPerChannel: p.dimmsPerChannel,
  maxMemorySpeedMts: p.maxMemorySpeedMts,
  maxMrdimmSpeedMts: p.maxMrdimmSpeedMts,
  pcieGen: p.pcieGen,
  pcieLanes1P: p.pcieLanes1P,
  pcieLanes2P: p.pcieLanes2P,
  cxlVersion: p.cxlVersion,
  maxSockets: p.maxSockets,
  maxCpuTdpW: p.maxCpuTdpW,
  status: p.status,
  availabilityWindow: p.availabilityWindow,
  availabilityNote: locOrNull(p.availabilityNote, p.i18n, 'availabilityNote'),
  sortOrder: p.sortOrder,
});

type BoardRow = Prisma.MotherboardGetPayload<{ include: { platform: { select: { socket: true } } } }>;
const toAdminBoard = (b: BoardRow): AdminMotherboard => ({
  id: b.id,
  socket: b.platform.socket,
  vendor: b.vendor,
  model: b.model,
  formFactor: b.formFactor,
  sockets: b.sockets,
  dimmSlots: b.dimmSlots,
  maxMemoryGb: b.maxMemoryGb,
  maxCpuTdpW: b.maxCpuTdpW,
  pcieX16Slots: b.pcieX16Slots,
  mcioX8Ports: b.mcioX8Ports,
  features: b.features,
  status: b.status,
  availabilityWindow: b.availabilityWindow,
  isPlaceholder: b.isPlaceholder,
  sourceUrl: b.sourceUrl,
  note: locOrNull(b.note, b.i18n, 'note'),
  sortOrder: b.sortOrder,
});

const vec3 = (value: unknown) => Vec3.parse(value);

export const catalogAdminRoutes: FastifyPluginAsyncZod<{ deps: AdminDeps }> = async (app, { deps }) => {
  const { prisma, publisher } = deps;

  const findProduct = async (id: string) => {
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) throw new HttpError(404, 'NOT_FOUND', 'Продукт не найден');
    return product;
  };

  // ── Продукты ───────────────────────────────────────────────────────────────
  app.get(
    '/products',
    { schema: { tags: ['admin'], summary: 'Все продукты, включая черновики', response: { 200: z.object({ items: z.array(AdminProductListItem) }), ...errors } } },
    async (request) => {
      requireAdmin(request);
      const products = await prisma.product.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
      return {
        items: products.map((p) => ({
          id: p.id,
          slug: p.slug,
          brand: p.brand,
          name: p.name,
          category: p.category,
          status: p.status,
          published: p.publishedAt !== null,
          hasModel: p.modelAssetId !== null,
          accentColor: p.accentColor,
          updatedAt: p.updatedAt.toISOString(),
        })),
      };
    },
  );

  app.get(
    '/products/:id',
    { schema: { tags: ['admin'], summary: 'Продукт для редактирования', params: IdParam, response: { 200: AdminProductDetail, ...errors } } },
    async (request) => {
      requireAdmin(request);
      const product = await prisma.product.findUnique({
        where: { id: request.params.id },
        include: {
          specGroups: { orderBy: { order: 'asc' }, include: { specs: { orderBy: { order: 'asc' } } } },
          hotspots: { orderBy: { order: 'asc' } },
          compatibility: { include: { platform: { select: { socket: true } } } },
        },
      });
      if (!product) throw new HttpError(404, 'NOT_FOUND', 'Продукт не найден');
      return {
        product: toAdminProduct(product),
        groups: product.specGroups.map(
          (g): AdminSpecGroup => ({
            key: g.key,
            title: loc(g.title, g.i18n, 'title'),
            specs: g.specs.map((s) => ({
              key: s.key,
              label: loc(s.label, s.i18n, 'label'),
              value: loc(s.value, s.i18n, 'value'),
              numericValue: s.numericValue,
              unit: s.unit,
              highlight: s.highlight,
              compareDirection: s.compareDirection,
              note: locOrNull(s.note, s.i18n, 'note'),
            })),
          }),
        ),
        hotspots: product.hotspots.map(
          (h): AdminHotspot => ({
            key: h.key,
            anchorNode: h.anchorNode,
            position: vec3(h.position),
            cameraPosition: vec3(h.cameraPosition),
            cameraTarget: h.cameraTarget === null ? null : vec3(h.cameraTarget),
            visibility: h.visibility,
            title: loc(h.title, h.i18n, 'title'),
            body: loc(h.body, h.i18n, 'body'),
          }),
        ),
        compatibility: product.compatibility.map((c) => ({ socket: c.platform.socket, level: c.level })),
      };
    },
  );

  app.patch(
    '/products/:id',
    { schema: { tags: ['admin'], summary: 'Изменить поля продукта', params: IdParam, body: AdminProductUpdate, response: { 200: AdminProduct, ...errors } } },
    async (request) => {
      const admin = requireAdmin(request);
      const before = await findProduct(request.params.id);
      const { tagline, description, availabilityNote, modelAssetId, ...plain } = request.body;
      if (modelAssetId) {
        const asset = await prisma.asset.findUnique({ where: { id: modelAssetId } });
        if (!asset || asset.type !== 'GLB' || asset.sourceId !== null) throw new HttpError(400, 'INVALID_ASSET', 'Это не загруженная 3D-модель');
        if (asset.status !== 'READY') throw new HttpError(409, 'ASSET_NOT_READY', 'Модель ещё не обработана');
      }
      const after = await prisma.$transaction(async (tx) => {
        const updated = await tx.product.update({
          where: { id: before.id },
          data: {
            ...plain,
            ...(tagline ? { tagline: tagline.ru } : {}),
            ...(description ? { description: description.ru } : {}),
            ...(availabilityNote !== undefined ? { availabilityNote: availabilityNote?.ru || null } : {}),
            ...(modelAssetId !== undefined ? { modelAssetId } : {}),
            i18n: withEnglish(before.i18n, { tagline, description, availabilityNote }),
          },
        });
        await audit(tx, { userId: admin.user.id, action: 'product.update', entity: 'Product', entityId: before.id, before: json(before), after: json(updated), ip: request.ip });
        return updated;
      });
      await publisher(`product:${after.slug}`);
      return toAdminProduct(after);
    },
  );

  app.post(
    '/products/:id/publish',
    { schema: { tags: ['admin'], summary: 'Опубликовать или снять с публикации', params: IdParam, body: PublishRequest, response: { 200: AdminProduct, ...errors } } },
    async (request) => {
      const admin = requireAdmin(request);
      const before = await findProduct(request.params.id);
      const after = await prisma.$transaction(async (tx) => {
        const updated = await tx.product.update({
          where: { id: before.id },
          data: { publishedAt: request.body.published ? (before.publishedAt ?? new Date()) : null },
        });
        await audit(tx, {
          userId: admin.user.id,
          action: request.body.published ? 'product.publish' : 'product.unpublish',
          entity: 'Product',
          entityId: before.id,
          before: { publishedAt: before.publishedAt },
          after: { publishedAt: updated.publishedAt },
          ip: request.ip,
        });
        return updated;
      });
      // Публикация — момент ревалидации ISR на фронте (B4)
      await publisher(`publish:${after.slug}`);
      return toAdminProduct(after);
    },
  );

  app.put(
    '/products/:id/specs',
    { schema: { tags: ['admin'], summary: 'Заменить группы и характеристики', params: IdParam, body: AdminSpecsPayload, response: { 200: OkResponse, ...errors } } },
    async (request) => {
      const admin = requireAdmin(request);
      const product = await findProduct(request.params.id);
      await prisma.$transaction(async (tx) => {
        const before = await tx.specGroup.findMany({ where: { productId: product.id }, include: { specs: true } });
        await tx.specGroup.deleteMany({ where: { productId: product.id } });
        for (const [groupOrder, group] of request.body.groups.entries()) {
          const created = await tx.specGroup.create({
            data: { productId: product.id, key: group.key, title: group.title.ru, order: groupOrder, i18n: onlyEnglish({ title: group.title }) },
          });
          await tx.spec.createMany({
            data: group.specs.map((spec, order) => ({
              productId: product.id,
              groupId: created.id,
              key: spec.key,
              label: spec.label.ru,
              value: spec.value.ru,
              numericValue: spec.numericValue,
              unit: spec.unit,
              highlight: spec.highlight,
              compareDirection: spec.compareDirection,
              note: spec.note?.ru || null,
              order,
              i18n: onlyEnglish({ label: spec.label, value: spec.value, note: spec.note }),
            })),
          });
        }
        await audit(tx, {
          userId: admin.user.id,
          action: 'product.specs',
          entity: 'Product',
          entityId: product.id,
          diff: {
            groups: { before: before.map((g) => g.key), after: request.body.groups.map((g) => g.key) },
            specs: { before: before.flatMap((g) => g.specs).length, after: request.body.groups.flatMap((g) => g.specs).length },
          },
          ip: request.ip,
        });
      });
      await publisher(`specs:${product.slug}`);
      return { ok: true } as const;
    },
  );

  app.put(
    '/products/:id/hotspots',
    { schema: { tags: ['admin'], summary: 'Заменить хотспоты 3D-модели', params: IdParam, body: AdminHotspotsPayload, response: { 200: OkResponse, ...errors } } },
    async (request) => {
      const admin = requireAdmin(request);
      const product = await findProduct(request.params.id);
      await prisma.$transaction(async (tx) => {
        const before = await tx.hotspot.findMany({ where: { productId: product.id }, orderBy: { order: 'asc' } });
        await tx.hotspot.deleteMany({ where: { productId: product.id } });
        await tx.hotspot.createMany({
          data: request.body.hotspots.map((h, order) => ({
            productId: product.id,
            key: h.key,
            anchorNode: h.anchorNode,
            position: h.position,
            cameraPosition: h.cameraPosition,
            cameraTarget: h.cameraTarget ?? undefined,
            visibility: h.visibility,
            title: h.title.ru,
            body: h.body.ru,
            order,
            i18n: onlyEnglish({ title: h.title, body: h.body }),
          })),
        });
        await audit(tx, {
          userId: admin.user.id,
          action: 'product.hotspots',
          entity: 'Product',
          entityId: product.id,
          diff: { hotspots: { before: before.map((h) => ({ key: h.key, position: h.position })), after: request.body.hotspots.map((h) => ({ key: h.key, position: h.position })) } },
          ip: request.ip,
        });
      });
      await publisher(`hotspots:${product.slug}`);
      return { ok: true } as const;
    },
  );

  // ── Платформы и платы ──────────────────────────────────────────────────────
  app.get(
    '/platforms',
    { schema: { tags: ['admin'], summary: 'Платформы', response: { 200: z.object({ items: z.array(AdminPlatform) }), ...errors } } },
    async (request) => {
      requireAdmin(request);
      const platforms = await prisma.platform.findMany({ orderBy: [{ sortOrder: 'asc' }, { socket: 'asc' }] });
      return { items: platforms.map(toAdminPlatform) };
    },
  );

  app.patch(
    '/platforms/:id',
    { schema: { tags: ['admin'], summary: 'Изменить платформу', params: IdParam, body: AdminPlatformUpdate, response: { 200: AdminPlatform, ...errors } } },
    async (request) => {
      const admin = requireAdmin(request);
      const before = await prisma.platform.findUnique({ where: { id: request.params.id } });
      if (!before) throw new HttpError(404, 'NOT_FOUND', 'Платформа не найдена');
      const { availabilityNote, ...plain } = request.body;
      const after = await prisma.$transaction(async (tx) => {
        const updated = await tx.platform.update({
          where: { id: before.id },
          data: {
            ...plain,
            ...(availabilityNote !== undefined ? { availabilityNote: availabilityNote?.ru || null } : {}),
            i18n: withEnglish(before.i18n, { availabilityNote }),
          },
        });
        await audit(tx, { userId: admin.user.id, action: 'platform.update', entity: 'Platform', entityId: before.id, before: json(before), after: json(updated), ip: request.ip });
        return updated;
      });
      await publisher(`platform:${after.socket}`);
      return toAdminPlatform(after);
    },
  );

  const boardInclude = { platform: { select: { socket: true } } } as const;

  app.get(
    '/motherboards',
    { schema: { tags: ['admin'], summary: 'Материнские платы всех платформ', response: { 200: z.object({ items: z.array(AdminMotherboard) }), ...errors } } },
    async (request) => {
      requireAdmin(request);
      const boards = await prisma.motherboard.findMany({ include: boardInclude, orderBy: [{ sortOrder: 'asc' }, { vendor: 'asc' }] });
      return { items: boards.map(toAdminBoard) };
    },
  );

  app.post(
    '/motherboards',
    { schema: { tags: ['admin'], summary: 'Добавить плату', body: AdminMotherboardCreate, response: { 201: AdminMotherboard, ...errors } } },
    async (request, reply) => {
      const admin = requireAdmin(request);
      const { socket, note, ...plain } = request.body;
      const platform = await prisma.platform.findUnique({ where: { socket } });
      if (!platform) throw new HttpError(400, 'UNKNOWN_PLATFORM', `Платформа ${socket} не найдена`);
      const board = await prisma.$transaction(async (tx) => {
        const created = await tx.motherboard.create({
          data: { ...plain, platformId: platform.id, note: note?.ru || null, i18n: onlyEnglish({ note }) },
          include: boardInclude,
        });
        await audit(tx, { userId: admin.user.id, action: 'motherboard.create', entity: 'Motherboard', entityId: created.id, before: null, after: json(created), ip: request.ip });
        return created;
      });
      await publisher(`motherboard:${board.id}`);
      return reply.code(201).send(toAdminBoard(board));
    },
  );

  app.patch(
    '/motherboards/:id',
    { schema: { tags: ['admin'], summary: 'Изменить плату', params: IdParam, body: AdminMotherboardUpdate, response: { 200: AdminMotherboard, ...errors } } },
    async (request) => {
      const admin = requireAdmin(request);
      const before = await prisma.motherboard.findUnique({ where: { id: request.params.id } });
      if (!before) throw new HttpError(404, 'NOT_FOUND', 'Плата не найдена');
      const { note, ...plain } = request.body;
      const board = await prisma.$transaction(async (tx) => {
        const updated = await tx.motherboard.update({
          where: { id: before.id },
          data: { ...plain, ...(note !== undefined ? { note: note?.ru || null } : {}), i18n: withEnglish(before.i18n, { note }) },
          include: boardInclude,
        });
        await audit(tx, { userId: admin.user.id, action: 'motherboard.update', entity: 'Motherboard', entityId: before.id, before: json(before), after: json(updated), ip: request.ip });
        return updated;
      });
      await publisher(`motherboard:${board.id}`);
      return toAdminBoard(board);
    },
  );

  app.delete(
    '/motherboards/:id',
    { schema: { tags: ['admin'], summary: 'Удалить плату (только администратор)', params: IdParam, response: { 200: OkResponse, ...errors } } },
    async (request) => {
      const admin = requireAdmin(request, { role: 'ADMIN' });
      const before = await prisma.motherboard.findUnique({ where: { id: request.params.id } });
      if (!before) throw new HttpError(404, 'NOT_FOUND', 'Плата не найдена');
      await prisma.$transaction(async (tx) => {
        await tx.motherboard.delete({ where: { id: before.id } });
        await audit(tx, { userId: admin.user.id, action: 'motherboard.delete', entity: 'Motherboard', entityId: before.id, before: json(before), after: null, ip: request.ip });
      });
      await publisher(`motherboard:${before.id}`);
      return { ok: true } as const;
    },
  );
};
