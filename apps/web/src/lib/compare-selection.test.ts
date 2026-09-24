import { describe, expect, it } from 'vitest';
import { chipState, resolveSelection } from './compare-selection';

const items = [
  { slug: 'venice', category: 'CPU' },
  { slug: 'turin', category: 'CPU' },
  { slug: 'monolith', category: 'MEMORY' },
  { slug: 'mind', category: 'GPU' },
] as const;

describe('resolveSelection', () => {
  it('пустой адрес — первая категория, где есть пара', () => {
    expect(resolveSelection(items, undefined)).toEqual(['venice', 'turin']);
  });

  it('отбрасывает неизвестное, повторы и чужие категории, сохраняя порядок', () => {
    expect(resolveSelection(items, 'turin,nope,turin,mind,venice')).toEqual(['turin', 'venice']);
    expect(resolveSelection(items, ['mind'])).toEqual(['mind']);
  });
});

describe('chipState', () => {
  it('выбранный — снять; той же категории — добавить; единственный в категории — недоступен', () => {
    expect(chipState(items, ['venice', 'turin'], items[0])).toEqual({ kind: 'selected', slugs: ['turin'] });
    expect(chipState(items, ['venice'], items[1])).toEqual({ kind: 'add', slugs: ['venice', 'turin'] });
    expect(chipState(items, ['venice', 'turin'], items[3])).toEqual({ kind: 'only' });
  });
});
