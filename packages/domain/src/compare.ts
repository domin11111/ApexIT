import type {
  CompareCell,
  CompareDirection,
  CompareResponse,
  CompareRow,
  ProductDetailDto,
  SpecDto,
} from '@apex/contracts';
import { DomainError } from './errors';

type RowHead = Omit<CompareRow, 'cells'>;

/**
 * Нормализованная таблица сравнения.
 *
 * Строки идут в порядке характеристик первого продукта, затем — ключи, которых у него нет.
 * Лучшее значение отмечается, только если сравнение осмысленно: направление задано,
 * хотя бы у двух продуктов есть число, единицы совпадают и значения различаются.
 */
export function buildCompareTable(products: readonly ProductDetailDto[]): Omit<CompareResponse, 'products'> {
  const [first] = products;
  if (!first) throw new Error('buildCompareTable: пустой список продуктов');

  const mixed = products.find((p) => p.category !== first.category);
  if (mixed) {
    throw new DomainError(
      'COMPARE_MIXED_CATEGORIES',
      `Сравнивать можно только продукты одной категории: ${first.name} — ${first.category}, ${mixed.name} — ${mixed.category}`,
      { categories: [...new Set(products.map((p) => p.category))] },
    );
  }

  const heads: RowHead[] = [];
  const seen = new Set<string>();
  for (const product of products) {
    for (const group of product.specGroups) {
      for (const spec of group.specs) {
        if (seen.has(spec.key)) continue;
        seen.add(spec.key);
        heads.push({
          key: spec.key,
          groupKey: group.key,
          label: spec.label,
          unit: spec.unit,
          direction: spec.compareDirection,
        });
      }
    }
  }

  const specsByKey = products.map(
    (product) => new Map(product.specGroups.flatMap((g) => g.specs).map((spec) => [spec.key, spec])),
  );

  return {
    category: first.category,
    rows: heads.map((head) => ({
      ...head,
      cells: compareCells(
        specsByKey.map((specs) => specs.get(head.key) ?? null),
        head.direction,
      ),
    })),
  };
}

export function compareCells(specs: readonly (SpecDto | null)[], direction: CompareDirection): CompareCell[] {
  const present = specs.filter((spec): spec is SpecDto => spec !== null);
  const numbers = present.flatMap((spec) => (spec.numericValue === null ? [] : [spec.numericValue]));
  const sameUnit = new Set(present.map((spec) => spec.unit)).size === 1;
  const measurable = numbers.length >= 2 && numbers.length === present.length && sameUnit;

  const distinct = new Set(numbers).size > 1;
  const best =
    measurable && distinct && direction !== 'NONE'
      ? direction === 'HIGHER_BETTER'
        ? Math.max(...numbers)
        : Math.min(...numbers)
      : null;
  const max = measurable ? Math.max(...numbers) : null;

  return specs.map((spec) => {
    const n = spec?.numericValue ?? null;
    return {
      value: spec?.value ?? null,
      numericValue: n,
      isBest: best !== null && n === best,
      // Длина бара: доля от максимума в строке
      ratio: max !== null && max > 0 && n !== null && n >= 0 ? Math.round((n / max) * 10_000) / 10_000 : null,
    };
  });
}
