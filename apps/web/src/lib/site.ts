import type { LocaleCode as Locale } from '@apex/contracts/locales';

/** Публичный адрес сайта: canonical, hreflang, sitemap, OpenGraph и JSON-LD. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export const SITE_NAME = 'APEX // Compute Collection';

/** Путь страницы в локали: ru — без префикса (localePrefix: as-needed), en — /en/… */
export function localizedPath(locale: Locale, path: string): string {
  const clean = path === '/' ? '' : path;
  return locale === 'ru' ? clean || '/' : `/en${clean}`;
}

export const absoluteUrl = (path: string) => `${SITE_URL}${path === '/' ? '' : path}` || SITE_URL;

/** canonical + hreflang для страницы, одинаковой в обеих локалях. */
export function alternatesFor(locale: Locale, path: string) {
  return {
    canonical: localizedPath(locale, path),
    languages: { ru: localizedPath('ru', path), en: localizedPath('en', path), 'x-default': localizedPath('ru', path) },
  };
}
