import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  /** Публичный адрес API — попадает в servers документа OpenAPI */
  API_PUBLIC_URL: z.url().optional(),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  /** Разрешённые origin фронта для CORS, через запятую */
  WEB_ORIGIN: z
    .string()
    .default('http://localhost:3000')
    .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean)),
  /** true — только за доверенным прокси (Vercel, Fly, nginx): тогда IP клиента берётся из X-Forwarded-For */
  TRUST_PROXY: z.stringbool().default(false),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  /** Запросов в минуту с одного IP к публичному API */
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),

  // ── S3: 3D-модели и картинки ──────────────────────────────────────────────
  /** Адрес S3-совместимого хранилища; не задан — AWS S3 по региону */
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('apex-assets'),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  /** Публичный адрес (CDN) для ключей public/… */
  ASSET_PUBLIC_URL: z.url().optional(),
  /** Создать бакет, политику чтения public/… и CORS при старте — только для локальной разработки */
  S3_AUTO_SETUP: z.stringbool().default(false),
  /** Папка KTX-Software (ktx) для сжатия текстур в KTX2 */
  KTX_SOFTWARE_DIR: z.string().optional(),

  // ── Заявки ────────────────────────────────────────────────────────────────
  /** Секрет Cloudflare Turnstile; не задан — капча не проверяется (только development/test) */
  TURNSTILE_SECRET: z.string().optional(),
  /** Соль хеша IP в заявках */
  LEAD_IP_SALT: z.string().min(8).default('apex-dev-salt'),
  /** Лимит заявок с одного IP в час */
  LEAD_RATE_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(5),
  SMTP_URL: z.url().optional(),
  MAIL_FROM: z.string().default('APEX Compute <no-reply@apex.local>'),
  LEAD_NOTIFY_EMAILS: z
    .string()
    .default('')
    .transform((value) => value.split(',').map((email) => email.trim()).filter(Boolean)),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),

  // ── Админка ───────────────────────────────────────────────────────────────
  /** 32 байта в base64 — ключ AES-256-GCM для секретов TOTP */
  TOTP_ENCRYPTION_KEY: z
    .string()
    .refine((value) => Buffer.from(value, 'base64').length === 32, 'TOTP_ENCRYPTION_KEY: 32 байта в base64 (openssl rand -base64 32)'),
  ADMIN_SESSION_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(12),
  /** Вход по одноразовой ссылке из CLI (pnpm admin:dev-login) — только для development */
  ADMIN_DEV_LOGIN: z.stringbool().default(false),
  /** Адрес сайта: ссылки в письмах и вебхук ревалидации ISR */
  WEB_URL: z.url().default('http://localhost:3000'),
  /** Общий секрет вебхука ревалидации; не задан — вебхук не вызывается */
  REVALIDATE_SECRET: z.string().min(16).optional(),
})
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    // В production без капчи и с отладочным входом запускаться нельзя
    if (!env.TURNSTILE_SECRET) ctx.addIssue({ code: 'custom', path: ['TURNSTILE_SECRET'], message: 'обязателен в production' });
    if (env.ADMIN_DEV_LOGIN) ctx.addIssue({ code: 'custom', path: ['ADMIN_DEV_LOGIN'], message: 'запрещён в production' });
    if (env.LEAD_IP_SALT === 'apex-dev-salt') ctx.addIssue({ code: 'custom', path: ['LEAD_IP_SALT'], message: 'задайте свою соль' });
  });

export type Env = z.infer<typeof Env>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = Env.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Некорректные переменные окружения:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
