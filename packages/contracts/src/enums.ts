import { z } from 'zod';
import { LEAD_INTENTS, PRODUCT_STATUSES } from './status';

/*
 * Перечисления — общие для фронта, API и БД.
 * Prisma генерирует собственные enum'ы; совпадение с этими проверяется на этапе
 * компиляции в apps/api/src/db/enum-parity.ts — рассинхрон роняет typecheck.
 */

export const ProductCategory = z.enum(['CPU', 'MEMORY', 'GPU', 'MOTHERBOARD']);
export type ProductCategory = z.infer<typeof ProductCategory>;

export const ProductStatus = z.enum(PRODUCT_STATUSES);
export type ProductStatus = z.infer<typeof ProductStatus>;

export const CompareDirection = z.enum(['HIGHER_BETTER', 'LOWER_BETTER', 'NONE']);
export type CompareDirection = z.infer<typeof CompareDirection>;

/** SUPPORTED — работает на платформе; VALIDATING — производитель ещё проводит валидацию. */
export const CompatibilityLevel = z.enum(['SUPPORTED', 'VALIDATING']);
export type CompatibilityLevel = z.infer<typeof CompatibilityLevel>;

/**
 * Процедурная модель, которую фронт рисует, пока у продукта нет загруженного GLB.
 * Процедурные модели и GLB обязаны иметь одинаковые имена узлов (см. Hotspot.anchorNode),
 * поэтому замена одной на другую не требует правок сцены.
 */
export const ModelPreset = z.enum(['CPU_SP5', 'CPU_SP7', 'RDIMM', 'GPU_DUAL_SLOT', 'MOTHERBOARD']);
export type ModelPreset = z.infer<typeof ModelPreset>;

/** Когда показывать хотспот: например, чиплеты под крышкой видны только в режиме exploded view. */
export const HotspotVisibility = z.enum(['ALWAYS', 'ASSEMBLED', 'EXPLODED']);
export type HotspotVisibility = z.infer<typeof HotspotVisibility>;

export const AssetType = z.enum(['GLB', 'IMAGE', 'VIDEO', 'HDRI']);
export type AssetType = z.infer<typeof AssetType>;

export const AssetVariant = z.enum(['DESKTOP', 'MOBILE']);
export type AssetVariant = z.infer<typeof AssetVariant>;

/** Жизненный цикл ассета в пайплайне загрузки (presigned URL → воркер gltf-transform → READY). */
export const AssetStatus = z.enum(['PENDING', 'PROCESSING', 'READY', 'FAILED']);
export type AssetStatus = z.infer<typeof AssetStatus>;

export const LeadStatus = z.enum(['NEW', 'IN_PROGRESS', 'CLOSED']);
export type LeadStatus = z.infer<typeof LeadStatus>;

export const AdminRole = z.enum(['ADMIN', 'EDITOR']);
export type AdminRole = z.infer<typeof AdminRole>;

// ─── Бейджи статуса и намерения заявки (без Zod — см. status.ts) ─────────────

export const LeadIntent = z.enum(LEAD_INTENTS);
export type LeadIntent = z.infer<typeof LeadIntent>;

export { isOrderable, STATUS_META, statusBadge } from './status';
