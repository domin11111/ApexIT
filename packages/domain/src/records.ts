import type {
  AssetStatus,
  AssetType,
  AssetVariant,
  CompareDirection,
  CompatibilityLevel,
  HotspotVisibility,
  ModelPreset,
  ProductCategory,
  ProductStatus,
} from '@apex/contracts';

/*
 * Записи каталога в «сыром» виде, как они лежат в БД: базовые тексты на языке по умолчанию,
 * переводы и координаты — в JSON-полях (unknown, пока не провалидированы).
 *
 * Результаты запросов Prisma структурно совместимы с этими типами, а @apex/collection
 * строит такие же записи из исходных данных для сида и моков. Поэтому одни и те же
 * преобразования в DTO работают и в API, и в MSW-моках фронта.
 */

export type AssetRecord = {
  id: string;
  type: AssetType;
  variant: AssetVariant;
  status: AssetStatus;
  url: string;
  cdnUrl: string | null;
  mimeType: string;
  sizeBytes: number | null;
  meta: unknown;
};

export type SpecRecord = {
  key: string;
  label: string;
  value: string;
  numericValue: number | null;
  unit: string | null;
  highlight: boolean;
  compareDirection: CompareDirection;
  note: string | null;
  order: number;
  i18n: unknown;
};

export type SpecGroupRecord = {
  key: string;
  title: string;
  order: number;
  i18n: unknown;
  specs: SpecRecord[];
};

export type HotspotRecord = {
  key: string;
  anchorNode: string | null;
  position: unknown;
  cameraPosition: unknown;
  cameraTarget: unknown;
  visibility: HotspotVisibility;
  title: string;
  body: string;
  order: number;
  i18n: unknown;
};

export type CompatibilityRecord = {
  level: CompatibilityLevel;
  notes: string | null;
  i18n: unknown;
  platform: { socket: string; name: string };
};

/** Минимум для карточки: список продуктов грузит только характеристики с highlight. */
export type ProductSummaryRecord = {
  id: string;
  slug: string;
  name: string;
  brand: string;
  category: ProductCategory;
  codename: string | null;
  headline: string;
  tagline: string;
  status: ProductStatus;
  availabilityWindow: string | null;
  accentColor: string;
  accentColorAlt: string | null;
  modelPreset: ModelPreset;
  sortOrder: number;
  publishedAt: Date | null;
  i18n: unknown;
  heroImage: AssetRecord | null;
  specGroups: SpecGroupRecord[];
};

export type ProductRecord = ProductSummaryRecord & {
  description: string;
  availabilityNote: string | null;
  modelAsset: (AssetRecord & { variants: AssetRecord[] }) | null;
  hotspots: HotspotRecord[];
  compatibility: CompatibilityRecord[];
};

export type PlatformRecord = {
  id: string;
  socket: string;
  name: string;
  cpuFamily: string;
  memoryChannels: number;
  dimmsPerChannel: number | null;
  maxMemorySpeedMts: number;
  maxMrdimmSpeedMts: number | null;
  pcieGen: number;
  pcieLanes1P: number;
  pcieLanes2P: number | null;
  cxlVersion: string | null;
  maxSockets: number;
  maxCpuTdpW: number;
  status: ProductStatus;
  availabilityWindow: string | null;
  availabilityNote: string | null;
  sortOrder: number;
  i18n: unknown;
};

export type MotherboardRecord = {
  id: string;
  vendor: string;
  model: string;
  formFactor: string;
  sockets: number;
  dimmSlots: number;
  maxMemoryGb: number | null;
  maxCpuTdpW: number | null;
  pcieX16Slots: number | null;
  mcioX8Ports: number | null;
  features: string[];
  status: ProductStatus;
  availabilityWindow: string | null;
  isPlaceholder: boolean;
  sourceUrl: string | null;
  note: string | null;
  sortOrder: number;
  i18n: unknown;
  platform: { socket: string };
};

export type ProductFilter = {
  category?: ProductCategory | undefined;
  status?: ProductStatus | undefined;
};

/**
 * Источник данных каталога. В API — Prisma, в моках — записи в памяти.
 * Возвращает только опубликованные продукты, отсортированные по sortOrder.
 */
export interface CatalogSource {
  listProducts(filter: ProductFilter): Promise<ProductSummaryRecord[]>;
  findProduct(slug: string): Promise<ProductRecord | null>;
  findProducts(slugs: readonly string[]): Promise<ProductRecord[]>;
  listPlatforms(): Promise<PlatformRecord[]>;
  platformExists(socket: string): Promise<boolean>;
  listMotherboards(socket: string): Promise<MotherboardRecord[]>;
}
