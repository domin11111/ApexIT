import { describe, expect, it } from 'vitest';
import { translations } from './localize';

describe('translations', () => {
  const i18n = { en: { title: 'Compute', note: '', count: 3 } };

  it('для языка по умолчанию переводов нет', () => {
    expect(translations(i18n, 'ru')).toEqual({});
  });

  it('берёт только непустые строки', () => {
    expect(translations(i18n, 'en')).toEqual({ title: 'Compute' });
  });

  it('переживает битый JSON', () => {
    expect(translations(null, 'en')).toEqual({});
    expect(translations('oops', 'en')).toEqual({});
    expect(translations({ en: ['x'] }, 'en')).toEqual({});
  });
});
