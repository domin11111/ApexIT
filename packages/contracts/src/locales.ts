/**
 * Локали без Zod — для клиентского кода (роутинг, переключатель языка):
 * импорт отсюда не тянет в браузерный бандл схемы контрактов.
 */
export const LOCALES = ['ru', 'en'] as const;
export type LocaleCode = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: LocaleCode = 'ru';
