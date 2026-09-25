import { z } from 'zod';
import { HexColor, Slug, Vec3 } from './common';
import { ShareCode } from './configuration';
import {
  AdminRole,
  AssetStatus,
  AssetVariant,
  CompareDirection,
  CompatibilityLevel,
  HotspotVisibility,
  LeadIntent,
  LeadStatus,
  ModelPreset,
  ProductCategory,
  ProductStatus,
} from './enums';

/*
 * Контракты закрытого API админки (/api/admin). Тексты редактируются сразу на двух языках:
 * ru хранится в базовых колонках, en — в JSON i18n (пустая строка = перевода нет).
 */

// ── Общие ─────────────────────────────────────────────────────────────────────

/** Текст на двух языках */
export const Localized = z.object({ ru: z.string().trim(), en: z.string().trim() });
export type Localized = z.infer<typeof Localized>;
const RequiredLocalized = z.object({ ru: z.string().trim().min(1, 'Заполните русский текст'), en: z.string().trim() });

export const IdParam = z.object({ id: z.uuid() });

/** Курсорная пагинация: курсор — id последнего элемента предыдущей страницы (uuid v7 растут со временем) */
export const PageQuery = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const OkResponse = z.object({ ok: z.literal(true) });

// ── Аутентификация ────────────────────────────────────────────────────────────

export const LoginRequest = z.object({
  email: z.email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(1).max(256),
});

export const AdminMe = z
  .object({
    id: z.uuid(),
    email: z.string(),
    role: AdminRole,
    totpEnabled: z.boolean(),
    /** Сессия прошла второй фактор (или он не включён) */
    mfaPassed: z.boolean(),
  })
  .meta({ id: 'AdminMe' });
export type AdminMe = z.infer<typeof AdminMe>;

export const LoginResponse = z.object({
  /** totp — пароль верный, нужен код из приложения-аутентификатора */
  next: z.enum(['done', 'totp']),
  me: AdminMe,
});
export type LoginResponse = z.infer<typeof LoginResponse>;

export const TotpCode = z.object({ code: z.string().regex(/^\d{6}$/, 'Шесть цифр') });

export const TotpSetupResponse = z.object({
  /** base32 — для ручного ввода */
  secret: z.string(),
  /** otpauth:// — для QR-кода */
  uri: z.string(),
});
export type TotpSetupResponse = z.infer<typeof TotpSetupResponse>;

// ── Пользователи (только ADMIN) ───────────────────────────────────────────────

export const AdminUserDto = z
  .object({
    id: z.uuid(),
    email: z.string(),
    role: AdminRole,
    isActive: z.boolean(),
    totpEnabled: z.boolean(),
    lastLoginAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'AdminUser' });
export type AdminUserDto = z.infer<typeof AdminUserDto>;

export const AdminUserCreate = z.object({
  email: z.email().max(254).transform((email) => email.toLowerCase()),
  role: AdminRole,
  password: z.string().min(12, 'Не короче 12 символов').max(256),
});
export const AdminUserUpdate = z.object({ role: AdminRole.optional(), isActive: z.boolean().optional() });

// ── Продукты ──────────────────────────────────────────────────────────────────

export const AdminProductListItem = z
  .object({
    id: z.uuid(),
    slug: Slug,
    brand: z.string(),
    name: z.string(),
    category: ProductCategory,
    status: ProductStatus,
    published: z.boolean(),
    hasModel: z.boolean(),
    accentColor: HexColor,
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'AdminProductListItem' });
export type AdminProductListItem = z.infer<typeof AdminProductListItem>;

const productFields = {
  name: z.string().trim().min(1),
  brand: z.string().trim().min(1),
  codename: z.string().trim().nullable(),
  headline: z.string().trim().min(1),
  tagline: RequiredLocalized,
  description: RequiredLocalized,
  status: ProductStatus,
  availabilityWindow: z.string().trim().nullable(),
  availabilityNote: Localized.nullable(),
  accentColor: HexColor,
  accentColorAlt: HexColor.nullable(),
  modelPreset: ModelPreset,
  modelAssetId: z.uuid().nullable(),
  sortOrder: z.number().int(),
};

export const AdminProduct = z
  .object({
    id: z.uuid(),
    slug: Slug,
    category: ProductCategory,
    publishedAt: z.iso.datetime().nullable(),
    updatedAt: z.iso.datetime(),
    ...productFields,
  })
  .meta({ id: 'AdminProduct' });
export type AdminProduct = z.infer<typeof AdminProduct>;

/** PATCH: только изменённые поля; slug и категория неизменны — на них ссылаются URL и совместимость */
export const AdminProductUpdate = z.object(productFields).partial();
export type AdminProductUpdate = z.infer<typeof AdminProductUpdate>;

export const PublishRequest = z.object({ published: z.boolean() });

export const AdminSpec = z.object({
  key: z.string().trim().regex(/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)*$/, 'Ключ вида cpu.cores'),
  label: RequiredLocalized,
  value: RequiredLocalized,
  numericValue: z.number().nullable(),
  unit: z.string().trim().nullable(),
  highlight: z.boolean(),
  compareDirection: CompareDirection,
  note: Localized.nullable(),
});
export type AdminSpec = z.infer<typeof AdminSpec>;

export const AdminSpecGroup = z.object({
  key: z.string().trim().regex(/^[a-z][a-zA-Z0-9]*$/, 'Ключ группы: compute, cache, …'),
  title: RequiredLocalized,
  specs: z.array(AdminSpec),
});
export type AdminSpecGroup = z.infer<typeof AdminSpecGroup>;

/** PUT заменяет все группы и характеристики целиком; порядок — порядок массивов */
export const AdminSpecsPayload = z
  .object({ groups: z.array(AdminSpecGroup) })
  .superRefine(({ groups }, ctx) => {
    const groupKeys = new Set<string>();
    const specKeys = new Set<string>();
    for (const group of groups) {
      if (groupKeys.has(group.key)) ctx.addIssue({ code: 'custom', message: `Группа ${group.key} повторяется` });
      groupKeys.add(group.key);
      for (const spec of group.specs) {
        if (specKeys.has(spec.key)) ctx.addIssue({ code: 'custom', message: `Характеристика ${spec.key} повторяется` });
        specKeys.add(spec.key);
      }
    }
  });
export type AdminSpecsPayload = z.infer<typeof AdminSpecsPayload>;

export const AdminHotspot = z.object({
  key: z.string().trim().regex(/^[a-z][a-z0-9_-]*$/, 'Ключ: латиница, цифры, - и _'),
  anchorNode: z.string().trim().nullable(),
  position: Vec3,
  cameraPosition: Vec3,
  cameraTarget: Vec3.nullable(),
  visibility: HotspotVisibility,
  title: RequiredLocalized,
  body: RequiredLocalized,
});
export type AdminHotspot = z.infer<typeof AdminHotspot>;

export const AdminHotspotsPayload = z
  .object({ hotspots: z.array(AdminHotspot) })
  .refine(({ hotspots }) => new Set(hotspots.map((h) => h.key)).size === hotspots.length, 'Ключи хотспотов повторяются');
export type AdminHotspotsPayload = z.infer<typeof AdminHotspotsPayload>;

export const AdminProductDetail = z
  .object({
    product: AdminProduct,
    groups: z.array(AdminSpecGroup),
    hotspots: z.array(AdminHotspot),
    compatibility: z.array(z.object({ socket: z.string(), level: CompatibilityLevel })),
  })
  .meta({ id: 'AdminProductDetail' });
export type AdminProductDetail = z.infer<typeof AdminProductDetail>;

// ── Платформы и платы ─────────────────────────────────────────────────────────

const platformFields = {
  name: z.string().trim().min(1),
  cpuFamily: z.string().trim().min(1),
  memoryChannels: z.number().int().min(1),
  dimmsPerChannel: z.number().int().min(1).nullable(),
  maxMemorySpeedMts: z.number().int().positive(),
  maxMrdimmSpeedMts: z.number().int().positive().nullable(),
  pcieGen: z.number().int().min(1),
  pcieLanes1P: z.number().int().positive(),
  pcieLanes2P: z.number().int().positive().nullable(),
  cxlVersion: z.string().trim().nullable(),
  maxSockets: z.number().int().min(1).max(8),
  maxCpuTdpW: z.number().int().positive(),
  status: ProductStatus,
  availabilityWindow: z.string().trim().nullable(),
  availabilityNote: Localized.nullable(),
  sortOrder: z.number().int(),
};
export const AdminPlatform = z.object({ id: z.uuid(), socket: z.string(), ...platformFields }).meta({ id: 'AdminPlatform' });
export type AdminPlatform = z.infer<typeof AdminPlatform>;
export const AdminPlatformUpdate = z.object(platformFields).partial();

const boardFields = {
  vendor: z.string().trim().min(1),
  model: z.string().trim().min(1),
  formFactor: z.string().trim().min(1),
  sockets: z.number().int().min(1).max(2),
  dimmSlots: z.number().int().min(1),
  maxMemoryGb: z.number().int().positive().nullable(),
  maxCpuTdpW: z.number().int().positive().nullable(),
  pcieX16Slots: z.number().int().min(0).nullable(),
  mcioX8Ports: z.number().int().min(0).nullable(),
  features: z.array(z.string().trim().min(1)),
  status: ProductStatus,
  availabilityWindow: z.string().trim().nullable(),
  isPlaceholder: z.boolean(),
  sourceUrl: z.url().nullable(),
  note: Localized.nullable(),
  sortOrder: z.number().int(),
};
export const AdminMotherboard = z
  .object({ id: z.uuid(), socket: z.string(), ...boardFields })
  .meta({ id: 'AdminMotherboard' });
export type AdminMotherboard = z.infer<typeof AdminMotherboard>;
export const AdminMotherboardCreate = z.object({ socket: z.string().regex(/^[A-Z0-9]{2,16}$/), ...boardFields });
export const AdminMotherboardUpdate = z.object(boardFields).partial();

// ── Заявки ────────────────────────────────────────────────────────────────────

export const AdminLeadQuery = PageQuery.extend({
  status: LeadStatus.optional(),
  /** Поиск по имени, компании, почте */
  q: z.string().trim().max(100).optional(),
});

export const AdminLeadComment = z.object({
  id: z.uuid(),
  body: z.string(),
  author: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export const AdminLead = z
  .object({
    id: z.uuid(),
    name: z.string(),
    company: z.string().nullable(),
    email: z.string(),
    phone: z.string().nullable(),
    message: z.string().nullable(),
    intent: LeadIntent,
    productSlug: z.string().nullable(),
    configurationShareCode: ShareCode.nullable(),
    status: LeadStatus,
    source: z.string(),
    locale: z.string(),
    createdAt: z.iso.datetime(),
    comments: z.array(AdminLeadComment),
  })
  .meta({ id: 'AdminLead' });
export type AdminLead = z.infer<typeof AdminLead>;

export const AdminLeadPage = z.object({
  items: z.array(AdminLead),
  nextCursor: z.uuid().nullable(),
  counts: z.record(LeadStatus, z.number().int()),
});
export type AdminLeadPage = z.infer<typeof AdminLeadPage>;

export const LeadStatusUpdate = z.object({ status: LeadStatus });
export const LeadCommentCreate = z.object({ body: z.string().trim().min(1).max(4000) });

// ── Журнал аудита ─────────────────────────────────────────────────────────────

export const AuditEntry = z
  .object({
    id: z.uuid(),
    user: z.string().nullable(),
    action: z.string(),
    entity: z.string(),
    entityId: z.string(),
    diff: z.unknown(),
    ip: z.string().nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'AuditEntry' });
export type AuditEntry = z.infer<typeof AuditEntry>;

export const AuditQuery = PageQuery.extend({ entity: z.string().trim().max(40).optional() });
export const AuditPage = z.object({ items: z.array(AuditEntry), nextCursor: z.uuid().nullable() });
export type AuditPage = z.infer<typeof AuditPage>;

// ── 3D-модели ─────────────────────────────────────────────────────────────────

/** Бюджет исходника: сжатием его доводят до ASSET_BUDGET (3 МБ) */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export const UploadRequest = z.object({
  fileName: z.string().trim().regex(/\.glb$/i, 'Нужен файл .glb').max(200),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES, 'Файл больше 100 МБ'),
});

export const UploadTicket = z.object({
  assetId: z.uuid(),
  /** PUT сюда напрямую из браузера, с заголовком content-type из headers */
  uploadUrl: z.url(),
  headers: z.record(z.string(), z.string()),
  expiresInSeconds: z.number().int(),
});
export type UploadTicket = z.infer<typeof UploadTicket>;

export const AdminAssetVariant = z.object({
  id: z.uuid(),
  variant: AssetVariant,
  status: AssetStatus,
  url: z.string(),
  sizeBytes: z.number().int().nullable(),
});

export const AdminAsset = z
  .object({
    id: z.uuid(),
    fileName: z.string(),
    status: AssetStatus,
    url: z.string(),
    sizeBytes: z.number().int().nullable(),
    /** Треугольники, габариты, отчёт оптимизации, ошибки, манифест, превью */
    meta: z.record(z.string(), z.unknown()),
    variants: z.array(AdminAssetVariant),
    usedBy: z.array(z.object({ id: z.uuid(), name: z.string() })),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'AdminAsset' });
export type AdminAsset = z.infer<typeof AdminAsset>;

/** Манифест GLB: как привести стороннюю модель к контракту rig (см. apps/web/src/three/models/glb.ts) */
export const ModelManifest = z.object({
  rotation: Vec3.optional(),
  nodes: z.record(z.string(), z.string()).optional(),
  rig: z
    .record(
      z.string(),
      z.object({
        explode: Vec3.optional(),
        explodeScale: Vec3.optional(),
        explodeRange: z.tuple([z.number(), z.number()]).optional(),
        glow: z.string().optional(),
        glowMax: z.number().optional(),
        spin: z.enum(['x', 'y', 'z']).optional(),
      }),
    )
    .optional(),
  credit: z.object({ author: z.string(), url: z.url(), license: z.string() }).optional(),
});
export type ModelManifest = z.infer<typeof ModelManifest>;

export const AdminAssetUpdate = z.object({ manifest: ModelManifest });

/** Превью-рендер: браузер админки рендерит модель и присылает PNG (data URL) */
export const PreviewUpload = z.object({
  dataUrl: z.string().regex(/^data:image\/(png|webp);base64,/).max(2_000_000),
});
