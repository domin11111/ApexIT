import type { CompareResponse, ProductDetailDto, ProductSummaryDto } from '@apex/contracts';
import type { BarRow } from '@/components/story/story-bars';

/** Характеристика для текста сцены: подпись, готовая строка и число для счётчика. */
export type SpecView = { label: string; value: string; numericValue: number | null };

/** Продукт в сценах главной — всё, что нужно HTML-слою и 3D, без лишнего. */
export type StoryProduct = Pick<
  ProductDetailDto,
  'slug' | 'brand' | 'name' | 'codename' | 'headline' | 'tagline' | 'accentColor' | 'accentColorAlt' | 'status' | 'availabilityWindow' | 'modelPreset'
> & { specs: Record<string, SpecView> };

export type StoryData = {
  venice: StoryProduct;
  turin: StoryProduct;
  memory: StoryProduct;
  gpu: StoryProduct;
  /** Бары сцены поколений: [9965, Venice] */
  bars: { rows: BarRow[]; names: [string, string] };
  collection: ProductSummaryDto[];
};

export function toStoryProduct(product: ProductDetailDto): StoryProduct {
  const specs: Record<string, SpecView> = {};
  for (const group of product.specGroups) {
    for (const spec of group.specs) specs[spec.key] = { label: spec.label, value: spec.value, numericValue: spec.numericValue };
  }
  return {
    slug: product.slug,
    brand: product.brand,
    name: product.name,
    codename: product.codename,
    headline: product.headline,
    tagline: product.tagline,
    accentColor: product.accentColor,
    accentColorAlt: product.accentColorAlt,
    status: product.status,
    availabilityWindow: product.availabilityWindow,
    modelPreset: product.modelPreset,
    specs,
  };
}

/** Строки сравнения для баров: только ключевые показатели брифа. */
export function toBars(compare: CompareResponse, keys: string[]): StoryData['bars'] {
  const [first, second] = compare.products;
  return {
    names: [`${first?.brand} ${first?.name}`, `${second?.brand} ${second?.name}`],
    rows: keys.flatMap((key) => {
      const row = compare.rows.find((r) => r.key === key);
      return row ? [{ key, label: row.label, cells: row.cells.map(({ value, ratio, isBest }) => ({ value, ratio, isBest })) }] : [];
    }),
  };
}

/** Число характеристики или запасное значение (счётчики не должны падать на пустых данных). */
export const num = (product: StoryProduct, key: string, fallback = 0) => product.specs[key]?.numericValue ?? fallback;
export const val = (product: StoryProduct, key: string) => product.specs[key]?.value ?? '';
