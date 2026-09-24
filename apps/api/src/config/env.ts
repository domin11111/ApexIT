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
});

export type Env = z.infer<typeof Env>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = Env.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Некорректные переменные окружения:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
