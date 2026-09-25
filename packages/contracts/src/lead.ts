import { z } from 'zod';
import { Locale, Slug } from './common';
import { ShareCode } from './configuration';
import { LeadIntent } from './enums';

/** POST /api/v1/leads — одна схема для клиентской валидации формы и для API. */
export const LeadCreate = z.object({
  name: z.string().trim().min(2, 'Укажите имя').max(120),
  company: z.string().trim().max(160).optional(),
  email: z.email('Проверьте адрес почты').max(254),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9\s\-()]{7,20}$/, 'Проверьте номер телефона')
    .optional(),
  message: z.string().trim().max(4000).optional(),
  intent: LeadIntent,
  productSlug: Slug.optional(),
  configurationShareCode: ShareCode.optional(),
  locale: Locale,
  /** Согласие на обработку персональных данных (152-ФЗ / GDPR) */
  consent: z.literal(true, 'Нужно согласие на обработку данных'),
  /**
   * Honeypot: скрытое поле, люди его не заполняют.
   * Схема его не отклоняет специально — API молча «принимает» такую заявку и не сохраняет,
   * чтобы бот не понял, что его вычислили.
   */
  website: z.string().max(200).optional(),
  /** Токен Cloudflare Turnstile / hCaptcha */
  captchaToken: z.string().min(1),
});
export type LeadCreate = z.infer<typeof LeadCreate>;

export const LeadCreateResponse = z.object({ ok: z.literal(true) });
export type LeadCreateResponse = z.infer<typeof LeadCreateResponse>;
