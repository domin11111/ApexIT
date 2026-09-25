import type { LeadStatus } from '@apex/contracts';

export const LEAD_STATUS: Record<LeadStatus, { label: string; tone: 'blue' | 'amber' | 'green' }> = {
  NEW: { label: 'Новая', tone: 'blue' },
  IN_PROGRESS: { label: 'В работе', tone: 'amber' },
  CLOSED: { label: 'Закрыта', tone: 'green' },
};

export const LEAD_INTENT = { QUOTE: 'КП', INFO: 'Информация' } as const;
export const LEAD_SOURCE: Record<string, string> = { product: 'Страница продукта', configurator: 'Конфигуратор', request: 'Форма запроса' };
