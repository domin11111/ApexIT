import type { ApiError } from '@apex/contracts';
import { whenMockingReady } from '@/providers/app-providers';

/*
 * Запросы к API из браузера. Без NEXT_PUBLIC_API_URL — тот же origin, где их перехватывают
 * MSW-моки (они построены на том же сервисе, что и API). Ответы не парсятся Zod-схемами:
 * контракт проверяет сервер, а схемы в клиентском бандле стоили бы лишних килобайт.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? '';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export async function apiFetch<T>(path: string, init: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<T> {
  await whenMockingReady();
  const response = await fetch(`${BASE}/api/v1${path}`, {
    method: init.method ?? 'GET',
    headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const error = (body as ApiError | null)?.error;
    throw new ApiRequestError(response.status, error?.code ?? 'HTTP_ERROR', error?.message ?? `HTTP ${response.status}`, error?.details);
  }
  return body as T;
}
