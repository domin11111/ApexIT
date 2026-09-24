import type { ProductDetailDto, SpecDto } from '@apex/contracts';
import { describe, expect, it } from 'vitest';
import { buildCompareTable, compareCells } from './compare';
import { DomainError } from './errors';

const spec = (key: string, numericValue: number | null, extra: Partial<SpecDto> = {}): SpecDto => ({
  key,
  label: key,
  value: numericValue === null ? '—' : String(numericValue),
  numericValue,
  unit: 'W',
  highlight: false,
  compareDirection: 'HIGHER_BETTER',
  note: null,
  ...extra,
});

describe('compareCells', () => {
  it('отмечает максимум для HIGHER_BETTER и считает доли', () => {
    const cells = compareCells([spec('a', 192), spec('a', 256)], 'HIGHER_BETTER');
    expect(cells.map((c) => c.isBest)).toEqual([false, true]);
    expect(cells.map((c) => c.ratio)).toEqual([0.75, 1]);
  });

  it('отмечает минимум для LOWER_BETTER', () => {
    const cells = compareCells([spec('tdp', 600), spec('tdp', 500)], 'LOWER_BETTER');
    expect(cells.map((c) => c.isBest)).toEqual([false, true]);
  });

  it('при равенстве лучшего нет', () => {
    const cells = compareCells([spec('a', 2), spec('a', 2)], 'HIGHER_BETTER');
    expect(cells.some((c) => c.isBest)).toBe(false);
    expect(cells.map((c) => c.ratio)).toEqual([1, 1]);
  });

  it('NONE не выбирает лучшего, но бары строит', () => {
    const cells = compareCells([spec('a', 1), spec('a', 2)], 'NONE');
    expect(cells.some((c) => c.isBest)).toBe(false);
    expect(cells.map((c) => c.ratio)).toEqual([0.5, 1]);
  });

  it('не сравнивает, если у кого-то значение не раскрыто или отсутствует', () => {
    const undisclosed = compareCells([spec('l1', null), spec('l1', 15)], 'HIGHER_BETTER');
    expect(undisclosed.every((c) => !c.isBest && c.ratio === null)).toBe(true);

    const missing = compareCells([null, spec('boost', 3.35)], 'HIGHER_BETTER');
    expect(missing[0]).toEqual({ value: null, numericValue: null, isBest: false, ratio: null });
    expect(missing[1]?.isBest).toBe(false);
  });

  it('не сравнивает разные единицы', () => {
    const cells = compareCells([spec('a', 1, { unit: 'GB' }), spec('a', 2, { unit: 'TB' })], 'HIGHER_BETTER');
    expect(cells.every((c) => !c.isBest && c.ratio === null)).toBe(true);
  });
});

const product = (slug: string, category: ProductDetailDto['category'], specs: SpecDto[]) =>
  ({
    slug,
    name: slug,
    category,
    specGroups: [{ key: 'compute', title: 'Вычисления', specs }],
  }) as unknown as ProductDetailDto;

describe('buildCompareTable', () => {
  it('строки — по порядку первого продукта, затем недостающие ключи', () => {
    const table = buildCompareTable([
      product('venice', 'CPU', [spec('cores', 256), spec('l3', 1024)]),
      product('turin', 'CPU', [spec('cores', 192), spec('boost', 3.35), spec('l3', 384)]),
    ]);
    expect(table.rows.map((r) => r.key)).toEqual(['cores', 'l3', 'boost']);
    expect(table.rows.find((r) => r.key === 'boost')?.cells[0]?.value).toBeNull();
  });

  it('не смешивает категории', () => {
    expect(() =>
      buildCompareTable([product('cpu', 'CPU', [spec('a', 1)]), product('gpu', 'GPU', [spec('a', 1)])]),
    ).toThrow(DomainError);
  });
});
