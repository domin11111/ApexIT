import { describe, expect, it } from 'vitest';
import { alternatesFor, localizedPath, SITE_URL } from './site';

describe('localizedPath', () => {
  it('ru — без префикса, en — с /en', () => {
    expect(localizedPath('ru', '/')).toBe('/');
    expect(localizedPath('en', '/')).toBe('/en');
    expect(localizedPath('ru', '/compare')).toBe('/compare');
    expect(localizedPath('en', '/products/epyc-9965')).toBe('/en/products/epyc-9965');
  });
});

describe('alternatesFor', () => {
  it('canonical своей локали, hreflang на обе и x-default на русскую — абсолютными адресами', () => {
    expect(alternatesFor('en', '/configurator')).toEqual({
      canonical: `${SITE_URL}/en/configurator`,
      languages: { ru: `${SITE_URL}/configurator`, en: `${SITE_URL}/en/configurator`, 'x-default': `${SITE_URL}/configurator` },
    });
  });

  it('главная — без слэша на конце (иначе canonical вёл бы на редирект под префиксом)', () => {
    expect(alternatesFor('ru', '/').canonical).toBe(SITE_URL);
    expect(alternatesFor('en', '/').canonical).toBe(`${SITE_URL}/en`);
  });
});
