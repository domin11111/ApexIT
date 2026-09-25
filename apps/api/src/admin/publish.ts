import type { FastifyBaseLogger } from 'fastify';
import type { CatalogCache } from '../cache/catalog-cache';

/**
 * Изменение каталога из админки → сброс кэша API (новая версия ключей в Redis)
 * и вебхук ревалидации ISR на фронте, чтобы статические страницы продуктов обновились.
 */
export function createCatalogPublisher({
  cache,
  webUrl,
  secret,
  log,
}: {
  cache: CatalogCache;
  webUrl: string;
  secret: string | undefined;
  log: FastifyBaseLogger;
}) {
  return async function catalogChanged(reason: string): Promise<void> {
    await cache.invalidate().catch((err: unknown) => log.warn({ err }, 'Не удалось сбросить кэш каталога'));
    if (!secret) return;
    // Фронт может быть недоступен (локально не запущен) — изменения уже в БД, страницы обновятся по ISR-таймеру
    void fetch(`${webUrl}/api/revalidate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-revalidate-secret': secret },
      body: JSON.stringify({ tags: ['catalog'], reason }),
      signal: AbortSignal.timeout(5000),
    })
      .then((response) => {
        if (!response.ok) log.warn({ status: response.status }, 'Вебхук ревалидации ответил ошибкой');
      })
      .catch((err: unknown) => log.warn({ err }, 'Вебхук ревалидации недоступен'));
  };
}

export type CatalogPublisher = ReturnType<typeof createCatalogPublisher>;
