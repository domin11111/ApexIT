/*
 * Статусы продуктов и бейджи — без Zod, чтобы клиентские компоненты (бейдж, CTA)
 * не тянули в браузерный бандл схемы контрактов. Zod-перечисления в enums.ts
 * строятся из этих же констант — источник истины один.
 */

export const PRODUCT_STATUSES = ['AVAILABLE', 'COMING_SOON', 'PREVIEW'] as const;
export type ProductStatusCode = (typeof PRODUCT_STATUSES)[number];

/** Что может сделать посетитель: запросить КП или только информацию (для PREVIEW). */
export const LEAD_INTENTS = ['QUOTE', 'INFO'] as const;
export type LeadIntentCode = (typeof LEAD_INTENTS)[number];

type StatusMeta = {
  /** `{window}` подставляется из Product.availabilityWindow, например «Q4 2026» */
  badge: { ru: string; en: string };
  badgeWithoutWindow: { ru: string; en: string };
  /** Ключ цвета — совпадает с --badge-* в @apex/ui/tokens.css */
  tone: 'available' | 'coming' | 'preview';
  /** Допустимые намерения заявки */
  intents: readonly LeadIntentCode[];
};

export const STATUS_META = {
  AVAILABLE: {
    badge: { ru: 'Доступен', en: 'Available' },
    badgeWithoutWindow: { ru: 'Доступен', en: 'Available' },
    tone: 'available',
    intents: ['QUOTE', 'INFO'],
  },
  COMING_SOON: {
    badge: { ru: 'Ожидается · {window}', en: 'Coming {window}' },
    badgeWithoutWindow: { ru: 'Скоро', en: 'Coming soon' },
    tone: 'coming',
    intents: ['QUOTE', 'INFO'],
  },
  PREVIEW: {
    badge: { ru: 'Превью', en: 'Preview' },
    badgeWithoutWindow: { ru: 'Превью', en: 'Preview' },
    tone: 'preview',
    // Правило B3: PREVIEW нельзя «заказать» — только запросить информацию.
    intents: ['INFO'],
  },
} as const satisfies Record<ProductStatusCode, StatusMeta>;

export function statusBadge(
  status: ProductStatusCode,
  locale: 'ru' | 'en',
  availabilityWindow?: string | null,
): string {
  const meta = STATUS_META[status];
  return availabilityWindow
    ? meta.badge[locale].replace('{window}', availabilityWindow)
    : meta.badgeWithoutWindow[locale];
}

export function isOrderable(status: ProductStatusCode): boolean {
  return (STATUS_META[status].intents as readonly LeadIntentCode[]).includes('QUOTE');
}
