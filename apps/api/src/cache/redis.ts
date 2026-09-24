import { Redis } from 'ioredis';

/**
 * Клиент Redis для кэша и rate limit. Подключение — явно через connect().
 * Без офлайн-очереди и с одной попыткой на команду: если Redis лёг, запросы сразу идут в БД,
 * а не ждут переподключения.
 */
export function createRedis(url: string): Redis {
  return new Redis(url, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 2_000,
  });
}

export type { Redis };
