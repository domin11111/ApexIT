import { z } from 'zod';
import { Locale, Slug } from './common';
import { CompareDirection, ProductCategory } from './enums';
import { ProductSummaryDto } from './product';

/** ?slugs=epyc-9996-venice,epyc-9965 — 2–3 продукта одной категории. */
export const CompareQuery = z.object({
  slugs: z
    .string()
    .transform((raw) => [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))])
    .pipe(z.array(Slug).min(2).max(3)),
  locale: Locale.default('ru'),
});
export type CompareQuery = z.infer<typeof CompareQuery>;

export const CompareCell = z.object({
  /** null — у продукта нет такой характеристики */
  value: z.string().nullable(),
  numericValue: z.number().nullable(),
  /** Лучшее значение в строке (с учётом direction) */
  isBest: z.boolean(),
  /** Доля от максимума в строке, 0…1 — длина анимированного бара */
  ratio: z.number().min(0).max(1).nullable(),
});
export type CompareCell = z.infer<typeof CompareCell>;

export const CompareRow = z.object({
  key: z.string(),
  groupKey: z.string(),
  label: z.string(),
  unit: z.string().nullable(),
  direction: CompareDirection,
  /** В порядке products */
  cells: z.array(CompareCell),
});
export type CompareRow = z.infer<typeof CompareRow>;

export const CompareResponse = z.object({
  category: ProductCategory,
  products: z.array(ProductSummaryDto),
  rows: z.array(CompareRow),
});
export type CompareResponse = z.infer<typeof CompareResponse>;
