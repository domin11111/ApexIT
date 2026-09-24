import { DEFAULT_LOCALE, type Locale } from '@apex/contracts';

/**
 * Достаёт переводы из JSON-колонки i18n вида { "en": { "title": "…" } }.
 * Для языка по умолчанию переводов нет — используются базовые колонки.
 * Нестроковые и пустые значения игнорируются: битый JSON не должен ронять страницу.
 */
export function translations(i18n: unknown, locale: Locale): Partial<Record<string, string>> {
  if (locale === DEFAULT_LOCALE || !isObject(i18n)) return {};
  const forLocale = i18n[locale];
  if (!isObject(forLocale)) return {};

  const result: Record<string, string> = {};
  for (const [field, value] of Object.entries(forLocale)) {
    if (typeof value === 'string' && value.length > 0) result[field] = value;
  }
  return result;
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
