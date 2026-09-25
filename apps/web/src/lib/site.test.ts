import { describe, expect, it } from 'vitest';
import { alternatesFor, localizedPath } from './site';

describe('localizedPath', () => {
  it('ru — без префикса, en — с /en', () => {
    expect(localizedPath('ru', '/')).toBe('/');
    expect(localizedPath('en', '/')).toBe('/en');
    expect(localizedPath('ru', '/compare')).toBe('/compare');
    expect(localizedPath('en', '/products/epyc-9965')).toBe('/en/products/epyc-9965');
  });
});

describe('alternatesFor', () => {
  it('canonical своей локали, hreflang на обе и x-default на русскую', () => {
    expect(alternatesFor('en', '/configurator')).toEqual({
      canonical: '/en/configurator',
      languages: { ru: '/configurator', en: '/en/configurator', 'x-default': '/configurator' },
    });
  });
});
