import { specKeyMeta } from '@apex/contracts';
import type { AssetRecord, MotherboardRecord, PlatformRecord, ProductRecord } from '@apex/domain';
import type { L10n, SeedModel } from './schema';
import { loadCollection, type Collection } from './validate';

/*
 * Коллекция → записи в формате БД (см. @apex/domain/records): ru в базовых полях, en — в i18n.
 * Одна функция кормит и сид, и MSW-моки, поэтому их данные совпадают по построению.
 */

export type CatalogRecords = {
  platforms: PlatformRecord[];
  products: ProductRecord[];
  motherboards: MotherboardRecord[];
};

/** Дата публикации записей коллекции в моках (в БД её ставит сид). */
export const COLLECTION_PUBLISHED_AT = new Date('2026-09-24T00:00:00.000Z');

/**
 * Детерминированный UUID (версия 8, RFC 9562) из строки: у моков стабильные id между перезагрузками.
 * FNV-1a в четыре прохода — это не криптография, только стабильность.
 */
export function stableUuid(seed: string): string {
  let hex = '';
  for (let round = 0; round < 4; round++) {
    let hash = 0x811c9dc5;
    for (const char of `${round}:${seed}`) {
      hash ^= char.codePointAt(0) ?? 0;
      hash = Math.imul(hash, 0x01000193);
    }
    hex += (hash >>> 0).toString(16).padStart(8, '0');
  }
  const variant = ((parseInt(hex.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** JSON i18n: только заданные английские поля, без undefined — так же, как после записи в БД. */
function en(fields: Record<string, L10n | undefined>): { en: Record<string, string> } {
  const result: Record<string, string> = {};
  for (const [field, text] of Object.entries(fields)) {
    if (text) result[field] = text[1];
  }
  return { en: result };
}

/** GLB продукта → ассет DESKTOP с мобильным вариантом (тот же путь с суффиксом -mobile). */
function modelAsset(model: SeedModel): AssetRecord & { variants: AssetRecord[] } {
  const glb = (url: string, variant: AssetRecord['variant'], sizeBytes: number): AssetRecord => ({
    id: stableUuid(`asset:${url}`),
    type: 'GLB',
    variant,
    status: 'READY',
    url,
    cdnUrl: null,
    mimeType: 'model/gltf-binary',
    sizeBytes,
    meta: { triangles: model.triangles, generator: 'tools/blender' },
  });
  return {
    ...glb(model.url, 'DESKTOP', model.sizeBytes),
    variants: [glb(model.url.replace(/\.glb$/, '-mobile.glb'), 'MOBILE', model.mobileSizeBytes)],
  };
}

export function buildCatalogRecords(collection: Collection = loadCollection()): CatalogRecords {
  const platforms: PlatformRecord[] = collection.platforms.map(
    ({ availabilityWindow, availabilityNote, ...platform }) => ({
      ...platform,
      id: stableUuid(`platform:${platform.socket}`),
      availabilityWindow: availabilityWindow ?? null,
      availabilityNote: availabilityNote?.[0] ?? null,
      i18n: en({ availabilityNote }),
    }),
  );
  const platformBySocket = new Map(platforms.map((p) => [p.socket, p]));

  const products: ProductRecord[] = collection.products.map((product) => ({
    id: stableUuid(`product:${product.slug}`),
    slug: product.slug,
    name: product.name,
    brand: product.brand,
    category: product.category,
    codename: product.codename ?? null,
    headline: product.headline,
    tagline: product.tagline[0],
    description: product.description[0],
    status: product.status,
    availabilityWindow: product.availabilityWindow ?? null,
    availabilityNote: product.availabilityNote?.[0] ?? null,
    accentColor: product.accentColor,
    accentColorAlt: product.accentColorAlt ?? null,
    modelPreset: product.modelPreset,
    sortOrder: product.sortOrder,
    publishedAt: COLLECTION_PUBLISHED_AT,
    i18n: en({ tagline: product.tagline, description: product.description, availabilityNote: product.availabilityNote }),
    heroImage: null,
    modelAsset: product.model ? modelAsset(product.model) : null,

    specGroups: product.specGroups.map((group, groupOrder) => ({
      key: group.key,
      title: group.title[0],
      order: groupOrder,
      i18n: en({ title: group.title }),
      specs: group.specs.map((spec, order) => {
        const meta = specKeyMeta(spec.key);
        return {
          key: spec.key,
          label: spec.label[0],
          value: spec.value[0],
          numericValue: spec.numericValue ?? null,
          // Единица имеет смысл только у числовых характеристик
          unit: spec.numericValue === undefined ? null : (meta.unit ?? null),
          highlight: spec.highlight ?? false,
          compareDirection: spec.compareDirection ?? meta.direction,
          note: spec.note?.[0] ?? null,
          order,
          i18n: en({ label: spec.label, value: spec.value, note: spec.note }),
        };
      }),
    })),

    hotspots: product.hotspots.map((hotspot, order) => ({
      key: hotspot.key,
      anchorNode: hotspot.anchorNode ?? null,
      position: hotspot.position,
      cameraPosition: hotspot.cameraPosition,
      cameraTarget: hotspot.cameraTarget ?? null,
      visibility: hotspot.visibility,
      title: hotspot.title[0],
      body: hotspot.body[0],
      order,
      i18n: en({ title: hotspot.title, body: hotspot.body }),
    })),

    compatibility: product.compatibility.map((c) => {
      const platform = platformBySocket.get(c.socket);
      if (!platform) throw new Error(`[${product.slug}] неизвестная платформа ${c.socket}`);
      return {
        level: c.level,
        notes: c.notes?.[0] ?? null,
        i18n: en({ notes: c.notes }),
        platform: { socket: platform.socket, name: platform.name },
      };
    }),
  }));

  const motherboards: MotherboardRecord[] = collection.motherboards.map(
    ({ socket, availabilityWindow, note, ...board }) => ({
      ...board,
      id: stableUuid(`motherboard:${board.vendor}:${board.model}`),
      availabilityWindow: availabilityWindow ?? null,
      note: note?.[0] ?? null,
      i18n: en({ note }),
      platform: { socket },
    }),
  );

  return { platforms, products, motherboards };
}
