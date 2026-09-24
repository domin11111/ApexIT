import type { FastifyBaseLogger } from 'fastify';
import type { Redis } from './redis';

const VERSION_KEY = 'apex:catalog:version';

export type Cached<T> = { value: T; hit: boolean };

/**
 * Кэш ответов каталога в Redis.
 *
 * Ключи содержат «версию каталога»: инвалидация — это INCR версии (при публикации из админки),
 * без SCAN и массового удаления; старые ключи истекают сами по TTL.
 * Любая ошибка Redis не ломает ответ — данные просто берутся из БД.
 */
export class CatalogCache {
  constructor(
    private readonly redis: Redis,
    private readonly ttlSeconds: number,
    private readonly log: FastifyBaseLogger,
  ) {}

  async wrap<T>(key: string, load: () => Promise<T>): Promise<Cached<T>> {
    let versionedKey: string | null = null;
    try {
      const version = (await this.redis.get(VERSION_KEY)) ?? '0';
      versionedKey = `apex:catalog:v${version}:${key}`;
      const cached = await this.redis.get(versionedKey);
      if (cached !== null) return { value: JSON.parse(cached) as T, hit: true };
    } catch (err) {
      this.log.warn({ err, key }, 'Кэш недоступен — отвечаем из БД');
    }

    const value = await load();
    if (versionedKey) {
      this.redis
        .set(versionedKey, JSON.stringify(value), 'EX', this.ttlSeconds)
        .catch((err: unknown) => this.log.warn({ err, key }, 'Не удалось записать в кэш'));
    }
    return { value, hit: false };
  }

  /** Сбросить кэш каталога целиком — вызывается при публикации изменений. */
  async invalidate(): Promise<void> {
    await this.redis.incr(VERSION_KEY);
  }
}
