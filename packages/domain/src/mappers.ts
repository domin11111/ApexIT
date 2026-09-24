import {
  Vec3,
  type AssetDto,
  type HotspotDto,
  type Locale,
  type MotherboardDto,
  type PlatformDto,
  type ProductDetailDto,
  type ProductSummaryDto,
  type SpecDto,
} from '@apex/contracts';
import { isObject, translations } from './localize';
import type {
  AssetRecord,
  HotspotRecord,
  MotherboardRecord,
  PlatformRecord,
  ProductRecord,
  ProductSummaryRecord,
  SpecGroupRecord,
  SpecRecord,
} from './records';

/*
 * Записи каталога → DTO публичного API под запрошенную локаль.
 * Сортировка повторяется здесь, а не только в SQL: порядок — часть контракта,
 * и моки обязаны отдавать его так же, как API.
 */

const byOrder = <T extends { order: number }>(items: readonly T[]) => items.toSorted((a, b) => a.order - b.order);

export function toAssetDto(asset: AssetRecord): AssetDto {
  return {
    id: asset.id,
    type: asset.type,
    variant: asset.variant,
    url: asset.cdnUrl ?? asset.url,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    meta: isObject(asset.meta) ? asset.meta : {},
  };
}

export function toSpecDto(spec: SpecRecord, locale: Locale): SpecDto {
  const t = translations(spec.i18n, locale);
  return {
    key: spec.key,
    label: t.label ?? spec.label,
    value: t.value ?? spec.value,
    numericValue: spec.numericValue,
    unit: spec.unit,
    highlight: spec.highlight,
    compareDirection: spec.compareDirection,
    note: t.note ?? spec.note,
  };
}

function highlightsOf(groups: readonly SpecGroupRecord[], locale: Locale): SpecDto[] {
  return byOrder(groups).flatMap((group) =>
    byOrder(group.specs)
      .filter((spec) => spec.highlight)
      .map((spec) => toSpecDto(spec, locale)),
  );
}

export function toProductSummaryDto(product: ProductSummaryRecord, locale: Locale): ProductSummaryDto {
  const t = translations(product.i18n, locale);
  return {
    id: product.id,
    slug: product.slug,
    name: t.name ?? product.name,
    brand: product.brand,
    category: product.category,
    codename: product.codename,
    headline: t.headline ?? product.headline,
    tagline: t.tagline ?? product.tagline,
    status: product.status,
    availabilityWindow: product.availabilityWindow,
    accentColor: product.accentColor,
    accentColorAlt: product.accentColorAlt,
    modelPreset: product.modelPreset,
    heroImage: product.heroImage?.status === 'READY' ? toAssetDto(product.heroImage) : null,
    sortOrder: product.sortOrder,
    highlights: highlightsOf(product.specGroups, locale),
  };
}

function toHotspotDto(hotspot: HotspotRecord, locale: Locale): HotspotDto {
  const t = translations(hotspot.i18n, locale);
  return {
    key: hotspot.key,
    anchorNode: hotspot.anchorNode,
    // Координаты лежат в JSON-колонке — проверяем форму, прежде чем отдать сцене.
    position: Vec3.parse(hotspot.position),
    cameraPosition: Vec3.parse(hotspot.cameraPosition),
    cameraTarget: hotspot.cameraTarget == null ? null : Vec3.parse(hotspot.cameraTarget),
    visibility: hotspot.visibility,
    title: t.title ?? hotspot.title,
    body: t.body ?? hotspot.body,
  };
}

/** Готовые GLB-модели: основной вариант и производные (например, мобильный). */
function modelsOf(model: ProductRecord['modelAsset']): AssetDto[] {
  if (!model) return [];
  return [model, ...model.variants]
    .filter((asset) => asset.type === 'GLB' && asset.status === 'READY')
    .map(toAssetDto);
}

export function toProductDetailDto(product: ProductRecord, locale: Locale): ProductDetailDto {
  const t = translations(product.i18n, locale);
  return {
    ...toProductSummaryDto(product, locale),
    description: t.description ?? product.description,
    availabilityNote: t.availabilityNote ?? product.availabilityNote,
    specGroups: byOrder(product.specGroups).map((group) => ({
      key: group.key,
      title: translations(group.i18n, locale).title ?? group.title,
      specs: byOrder(group.specs).map((spec) => toSpecDto(spec, locale)),
    })),
    hotspots: byOrder(product.hotspots).map((hotspot) => toHotspotDto(hotspot, locale)),
    models: modelsOf(product.modelAsset),
    compatibility: product.compatibility
      .toSorted((a, b) => a.platform.socket.localeCompare(b.platform.socket))
      .map((c) => ({
        socket: c.platform.socket,
        platformName: c.platform.name,
        level: c.level,
        notes: translations(c.i18n, locale).notes ?? c.notes,
      })),
  };
}

export function toPlatformDto(platform: PlatformRecord, locale: Locale): PlatformDto {
  const t = translations(platform.i18n, locale);
  return {
    id: platform.id,
    socket: platform.socket,
    name: platform.name,
    cpuFamily: platform.cpuFamily,
    memoryChannels: platform.memoryChannels,
    dimmsPerChannel: platform.dimmsPerChannel,
    maxMemorySpeedMts: platform.maxMemorySpeedMts,
    maxMrdimmSpeedMts: platform.maxMrdimmSpeedMts,
    pcieGen: platform.pcieGen,
    pcieLanes1P: platform.pcieLanes1P,
    pcieLanes2P: platform.pcieLanes2P,
    cxlVersion: platform.cxlVersion,
    maxSockets: platform.maxSockets,
    maxCpuTdpW: platform.maxCpuTdpW,
    status: platform.status,
    availabilityWindow: platform.availabilityWindow,
    availabilityNote: t.availabilityNote ?? platform.availabilityNote,
  };
}

export function toMotherboardDto(board: MotherboardRecord, locale: Locale): MotherboardDto {
  const t = translations(board.i18n, locale);
  return {
    id: board.id,
    vendor: board.vendor,
    model: board.model,
    socket: board.platform.socket,
    formFactor: board.formFactor,
    sockets: board.sockets,
    dimmSlots: board.dimmSlots,
    maxMemoryGb: board.maxMemoryGb,
    maxCpuTdpW: board.maxCpuTdpW,
    pcieX16Slots: board.pcieX16Slots,
    mcioX8Ports: board.mcioX8Ports,
    features: board.features,
    status: board.status,
    availabilityWindow: board.availabilityWindow,
    isPlaceholder: board.isPlaceholder,
    sourceUrl: board.sourceUrl,
    note: t.note ?? board.note,
  };
}
