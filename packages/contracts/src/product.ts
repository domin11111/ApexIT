import { z } from 'zod';
import { HexColor, Locale, Slug, Vec3 } from './common';
import {
  AssetType,
  AssetVariant,
  CompareDirection,
  HotspotVisibility,
  ModelPreset,
  ProductCategory,
  ProductStatus,
} from './enums';
import { CompatibilityDto } from './platform';

/*
 * DTO публичного API. Все тексты уже разрешены под запрошенную локаль:
 * в БД базовые поля хранятся на ru, а переводы — в JSON-колонке i18n (см. schema.prisma).
 * `.meta({ id })` превращает схему в именованный компонент OpenAPI.
 */

export const SpecDto = z
  .object({
    key: z.string(),
    label: z.string(),
    /** Готовая строка для отображения: «до 4,1 ГГц», «128 (1P) · 160 (2P)» */
    value: z.string(),
    /** Число в каноничной единице (UNITS) — для счётчиков и сравнения; null у текстовых характеристик */
    numericValue: z.number().nullable(),
    unit: z.string().nullable(),
    highlight: z.boolean(),
    compareDirection: CompareDirection,
    /** Сноска: условия измерения, источник */
    note: z.string().nullable(),
  })
  .meta({ id: 'Spec' });
export type SpecDto = z.infer<typeof SpecDto>;

export const SpecGroupDto = z
  .object({
    key: z.string(),
    title: z.string(),
    specs: z.array(SpecDto),
  })
  .meta({ id: 'SpecGroup' });
export type SpecGroupDto = z.infer<typeof SpecGroupDto>;

export const HotspotDto = z
  .object({
    key: z.string(),
    /** Имя узла модели, к которому привязана точка (одинаково в процедурной модели и GLB) */
    anchorNode: z.string().nullable(),
    position: Vec3,
    /** Куда подлетает камера по клику */
    cameraPosition: Vec3,
    /** Куда смотрит камера; null — на position */
    cameraTarget: Vec3.nullable(),
    visibility: HotspotVisibility,
    title: z.string(),
    body: z.string(),
  })
  .meta({ id: 'Hotspot' });
export type HotspotDto = z.infer<typeof HotspotDto>;

export const AssetDto = z
  .object({
    id: z.uuid(),
    type: AssetType,
    variant: AssetVariant,
    /** CDN-адрес, если есть, иначе адрес в хранилище */
    url: z.url(),
    mimeType: z.string(),
    sizeBytes: z.number().int().nullable(),
    /** Треугольники, габариты, размеры изображения и т. п. */
    meta: z.record(z.string(), z.unknown()),
  })
  .meta({ id: 'Asset' });
export type AssetDto = z.infer<typeof AssetDto>;

const productSummaryShape = {
  id: z.uuid(),
  slug: Slug,
  name: z.string(),
  brand: z.string(),
  category: ProductCategory,
  codename: z.string().nullable(),
  /** «The New Era» */
  headline: z.string(),
  /** Слоган: «256 ядер. 2 нанометра. Новая эпоха.» */
  tagline: z.string(),
  status: ProductStatus,
  /** Короткое окно доступности для бейджа: «Q4 2026» */
  availabilityWindow: z.string().nullable(),
  accentColor: HexColor,
  accentColorAlt: HexColor.nullable(),
  modelPreset: ModelPreset,
  heroImage: AssetDto.nullable(),
  sortOrder: z.number().int(),
  /** Характеристики с highlight=true — для карточек и hero */
  highlights: z.array(SpecDto),
};

export const ProductSummaryDto = z.object(productSummaryShape).meta({ id: 'ProductSummary' });
export type ProductSummaryDto = z.infer<typeof ProductSummaryDto>;

export const ProductDetailDto = z
  .object({
    ...productSummaryShape,
    description: z.string(),
    availabilityNote: z.string().nullable(),
    specGroups: z.array(SpecGroupDto),
    hotspots: z.array(HotspotDto),
    /** GLB-варианты (desktop / mobile); пусто — фронт рисует процедурную модель по modelPreset */
    models: z.array(AssetDto),
    compatibility: z.array(CompatibilityDto),
  })
  .meta({ id: 'ProductDetail' });
export type ProductDetailDto = z.infer<typeof ProductDetailDto>;

export const ProductListQuery = z.object({
  category: ProductCategory.optional(),
  status: ProductStatus.optional(),
  locale: Locale.default('ru'),
});
export type ProductListQuery = z.infer<typeof ProductListQuery>;

export const ProductListResponse = z.object({
  items: z.array(ProductSummaryDto),
});
export type ProductListResponse = z.infer<typeof ProductListResponse>;
