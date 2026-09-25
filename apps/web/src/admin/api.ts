import type { ApiError } from '@apex/contracts';

/*
 * Клиент закрытого API админки. Сессия — httpOnly cookie API (её не видно JS),
 * поэтому все запросы идут с credentials: 'include' и заголовком x-apex-admin против CSRF.
 */

const BASE = `${process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? ''}/api/admin`;

export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AdminApiError';
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export async function adminFetch<T>(path: string, method: Method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: { 'x-apex-admin': '1', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const error = (data as ApiError | null)?.error;
    throw new AdminApiError(response.status, error?.code ?? 'HTTP_ERROR', error?.message ?? `Ошибка ${response.status}`, error?.details);
  }
  return data as T;
}

/** Прямая ссылка на файл API (CSV): браузер пришлёт cookie сам */
export const adminUrl = (path: string) => `${BASE}${path}`;

/** Текст ошибки для человека: сообщение API или ошибки валидации полей */
export function errorText(error: unknown): string {
  if (error instanceof AdminApiError) {
    if (error.code === 'VALIDATION_ERROR' && Array.isArray(error.details)) {
      return (error.details as Array<{ instancePath?: string; message?: string }>)
        .map((issue) => `${issue.instancePath ?? ''} ${issue.message ?? ''}`.trim())
        .join('; ');
    }
    return error.message;
  }
  return error instanceof Error ? error.message : 'Неизвестная ошибка';
}
