import { describe, expect, it } from 'vitest';
import { parseDisplayNumber } from './display-number';

describe('разбор строк характеристик для счётчиков', () => {
  it.each([
    ['256', { prefix: '', number: 256, decimals: 0, grouped: false, suffix: '' }],
    ['1024 МБ', { prefix: '', number: 1024, decimals: 0, grouped: false, suffix: ' МБ' }],
    ['до 1,6 ТБ/с', { prefix: 'до ', number: 1.6, decimals: 1, grouped: false, suffix: ' ТБ/с' }],
    ['2,55 ГГц', { prefix: '', number: 2.55, decimals: 2, grouped: false, suffix: ' ГГц' }],
    ['24 064', { prefix: '', number: 24064, decimals: 0, grouped: true, suffix: '' }],
    ['24,064', { prefix: '', number: 24064, decimals: 0, grouped: true, suffix: '' }],
    ['до 12 800 МТ/с', { prefix: 'до ', number: 12800, decimals: 0, grouped: true, suffix: ' МТ/с' }],
    ['≈ 1792 ГБ/с', { prefix: '≈ ', number: 1792, decimals: 0, grouped: false, suffix: ' ГБ/с' }],
    ['up to 3.7 GHz', { prefix: 'up to ', number: 3.7, decimals: 1, grouped: false, suffix: ' GHz' }],
  ])('%s', (value, expected) => {
    expect(parseDisplayNumber(value)).toEqual(expected);
  });

  it('текст без числа не анимируется', () => {
    expect(parseDisplayNumber('Не раскрыто')).toBeNull();
  });
});
