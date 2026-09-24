import type { ProductCategory, ProductSummaryDto } from '@apex/contracts';

/*
 * Выбор продуктов для /compare?slugs=a,b,c — чистые функции: разбор адреса и ссылки чипов.
 * Сравниваются 2–3 продукта одной категории; ссылка на сравнение — это просто адрес страницы.
 */

export const MAX_COMPARE = 3;

type Summary = Pick<ProductSummaryDto, 'slug' | 'category'>;

/**
 * Продукты из адреса: только известные, без повторов, одной категории (по первому), не больше трёх.
 * Пустой адрес — первая категория, где есть с чем сравнивать.
 */
export function resolveSelection(items: readonly Summary[], raw: string | string[] | undefined): string[] {
  const requested = [...new Set((Array.isArray(raw) ? raw.join(',') : (raw ?? '')).split(',').map((s) => s.trim()))];
  const known = requested.flatMap((slug) => items.filter((p) => p.slug === slug));
  const category = known[0]?.category;
  if (category) return known.filter((p) => p.category === category).slice(0, MAX_COMPARE).map((p) => p.slug);

  const counts = new Map<ProductCategory, number>();
  for (const item of items) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  const first = items.find((p) => (counts.get(p.category) ?? 0) >= 2);
  return first ? items.filter((p) => p.category === first.category).slice(0, MAX_COMPARE).map((p) => p.slug) : [];
}

export type ChipState =
  | { kind: 'selected'; slugs: string[] }
  | { kind: 'add'; slugs: string[] }
  /** Другая категория: начать новое сравнение с этим продуктом */
  | { kind: 'switch'; slugs: string[] }
  | { kind: 'full' }
  | { kind: 'only' };

/** Что сделает клик по продукту и какой будет новый адрес. */
export function chipState(items: readonly Summary[], selection: readonly string[], product: Summary): ChipState {
  if (selection.includes(product.slug)) return { kind: 'selected', slugs: selection.filter((s) => s !== product.slug) };

  const current = items.find((p) => p.slug === selection[0])?.category;
  if (current === product.category) {
    return selection.length >= MAX_COMPARE ? { kind: 'full' } : { kind: 'add', slugs: [...selection, product.slug] };
  }
  const peers = items.filter((p) => p.category === product.category && p.slug !== product.slug);
  if (peers.length === 0) return { kind: 'only' };
  return { kind: 'switch', slugs: [product.slug, ...peers.slice(0, MAX_COMPARE - 1).map((p) => p.slug)] };
}
