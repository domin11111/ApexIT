import 'server-only';
import { DomainError } from '@apex/domain';
import { ZodError } from 'zod';

/*
 * Ответы маршрутов app/api/v1 в формате API (ApiError). Всегда Cache-Control: no-store —
 * сайт стоит за Cloudflare, и ответ с данными не должен осесть ни в его кеше, ни в браузере.
 */

const NO_STORE = { 'cache-control': 'no-store' };

/** Ошибка запроса с кодом из контракта API. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });

const fail = (status: number, code: string, message: string, details?: unknown) =>
  json({ error: { code, message, ...(details === undefined ? {} : { details }) } }, status);

/** Тело запроса как JSON, не больше limit байт. */
export async function readJson(request: Request, limit = 32 * 1024): Promise<unknown> {
  const text = await request.text();
  if (Buffer.byteLength(text) > limit) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Слишком большой запрос');
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'Тело запроса — не JSON');
  }
}

/** Выполняет обработчик и переводит ожидаемые ошибки в ответы; неожиданные — 500 без подробностей. */
export async function respond(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof HttpError) return fail(error.status, error.code, error.message, error.details);
    if (error instanceof DomainError) return json(error.toApiError(), error.status);
    if (error instanceof ZodError) return fail(400, 'VALIDATION_ERROR', 'Некорректные параметры запроса', error.issues);
    console.error('[api]', error);
    return fail(500, 'INTERNAL', 'Внутренняя ошибка — попробуйте позже');
  }
}

/** IP посетителя: X-Real-IP ставит Caddy. Процесс слушает только 127.0.0.1, подделать заголовок снаружи нельзя. */
export const clientIp = (request: Request) => request.headers.get('x-real-ip') ?? 'local';

/**
 * Скользящее окно в памяти процесса: не больше limit событий за windowMs с одного ключа.
 * Перезапуск сбрасывает счётчики — для защиты от спама формы этого достаточно.
 */
export function rateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (key: string): boolean => {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (hits.size > 10_000) hits.clear();
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    return true;
  };
}
