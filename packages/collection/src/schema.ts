import {
  CompareDirection,
  CompatibilityLevel,
  HexColor,
  HotspotVisibility,
  ModelPreset,
  ProductCategory,
  ProductStatus,
  Slug,
  SpecGroupKey,
  SpecKey,
  Vec3,
} from '@apex/contracts';
import { z } from 'zod';

/*
 * Формат исходных данных коллекции. Это вход для сида БД и для MSW-моков фронта;
 * публичный API отдаёт уже DTO из @apex/contracts.
 */

/** Перевод [ru, en]. ru — язык по умолчанию (базовые колонки БД), en уходит в JSON i18n. */
export const L10n = z.tuple([z.string().min(1), z.string().min(1)]);
export type L10n = z.infer<typeof L10n>;

export const SeedSpec = z.object({
  key: SpecKey,
  label: L10n,
  value: L10n,
  /** В каноничной единице SPEC_KEYS[key].unit; не задаётся для текстовых характеристик */
  numericValue: z.number().optional(),
  highlight: z.boolean().optional(),
  note: L10n.optional(),
  /** Переопределяет направление по умолчанию из SPEC_KEYS */
  compareDirection: CompareDirection.optional(),
});
export type SeedSpec = z.infer<typeof SeedSpec>;

export const SeedSpecGroup = z.object({
  key: SpecGroupKey,
  title: L10n,
  specs: z.array(SeedSpec).min(1),
});
export type SeedSpecGroup = z.infer<typeof SeedSpecGroup>;

export const SeedHotspot = z.object({
  key: z.string().regex(/^[a-z0-9-]+$/),
  anchorNode: z.string().optional(),
  position: Vec3,
  cameraPosition: Vec3,
  cameraTarget: Vec3.optional(),
  visibility: HotspotVisibility.default('ALWAYS'),
  title: L10n,
  body: L10n,
});
export type SeedHotspot = z.input<typeof SeedHotspot>;

export const SeedCompatibility = z.object({
  socket: z.string(),
  level: CompatibilityLevel,
  notes: L10n.optional(),
});

/**
 * GLB-модель продукта из tools/blender: файл в apps/web/public/models, облегчённый мобильный вариант
 * лежит рядом с суффиксом -mobile (текстуры до 1024 px). Размеры — для прогресса загрузки и мониторинга.
 */
export const SeedModel = z.object({
  url: z.string().regex(/^\/models\/[a-z0-9-]+\.glb$/),
  sizeBytes: z.number().int().positive(),
  mobileSizeBytes: z.number().int().positive(),
  triangles: z.number().int().positive(),
});
export type SeedModel = z.infer<typeof SeedModel>;

export const SeedProduct = z.object({
  slug: Slug,
  name: z.string(),
  brand: z.string(),
  category: ProductCategory,
  codename: z.string().optional(),
  /** «The New Era» — одинаково во всех локалях */
  headline: z.string(),
  /** Слоган */
  tagline: L10n,
  description: L10n,
  status: ProductStatus,
  availabilityWindow: z.string().optional(),
  availabilityNote: L10n.optional(),
  accentColor: HexColor,
  accentColorAlt: HexColor.optional(),
  modelPreset: ModelPreset,
  /** Готовая модель; без неё фронт рисует процедурную по modelPreset */
  model: SeedModel.optional(),
  sortOrder: z.number().int(),
  specGroups: z.array(SeedSpecGroup).min(1),
  hotspots: z.array(SeedHotspot),
  compatibility: z.array(SeedCompatibility).min(1),
});
export type SeedProduct = z.input<typeof SeedProduct>;
export type ParsedSeedProduct = z.output<typeof SeedProduct>;

export const SeedPlatform = z.object({
  socket: z.string(),
  name: z.string(),
  cpuFamily: z.string(),
  memoryChannels: z.number().int(),
  dimmsPerChannel: z.number().int().nullable(),
  maxMemorySpeedMts: z.number().int(),
  maxMrdimmSpeedMts: z.number().int().nullable(),
  pcieGen: z.number().int(),
  pcieLanes1P: z.number().int(),
  pcieLanes2P: z.number().int().nullable(),
  cxlVersion: z.string().nullable(),
  maxSockets: z.number().int().min(1).max(2),
  maxCpuTdpW: z.number().int(),
  status: ProductStatus,
  availabilityWindow: z.string().optional(),
  availabilityNote: L10n.optional(),
  sortOrder: z.number().int(),
});
export type SeedPlatform = z.input<typeof SeedPlatform>;

export const SeedMotherboard = z.object({
  vendor: z.string(),
  model: z.string(),
  socket: z.string(),
  formFactor: z.string(),
  sockets: z.number().int().min(1).max(2),
  dimmSlots: z.number().int(),
  maxMemoryGb: z.number().int().nullable(),
  maxCpuTdpW: z.number().int().nullable(),
  pcieX16Slots: z.number().int().nullable(),
  mcioX8Ports: z.number().int().nullable(),
  features: z.array(z.string()),
  status: ProductStatus,
  availabilityWindow: z.string().optional(),
  isPlaceholder: z.boolean(),
  sourceUrl: z.url().nullable(),
  note: L10n.optional(),
  sortOrder: z.number().int(),
});
export type SeedMotherboard = z.input<typeof SeedMotherboard>;
