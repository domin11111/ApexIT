import { DEFAULT_LOCALE, LOCALES } from '@apex/contracts/locales';
import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  // Русский без префикса (/), английский — /en
  localePrefix: 'as-needed',
  // Домен общий с другими приложениями (lenivec.online): cookie — с префиксом сайта, не безликое NEXT_LOCALE
  localeCookie: { name: 'apex-locale' },
});
