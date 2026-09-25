import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalogRecords } from '@apex/collection';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { buildApp, type App } from '../src/app';
import type { ModelQueue } from '../src/assets/jobs';
import { createRedis, type Redis } from '../src/cache/redis';
import { loadEnv, type Env } from '../src/config/env';
import { createPrisma, type Db } from '../src/db/prisma';
import { seedCatalog } from '../src/db/seed-catalog';
import type { LeadNotice } from '../src/leads/notifier';
import { createMemoryStorage } from '../src/storage/memory-storage';

const apiRoot = fileURLToPath(new URL('..', import.meta.url));

/** Поднятая среда интеграционного теста: настоящие PostgreSQL и Redis, внешние сервисы — подмены. */
export type Harness = {
  app: App;
  prisma: Db;
  redis: Redis;
  env: Env;
  storage: ReturnType<typeof createMemoryStorage>;
  /** Письма и сообщения, которые ушли бы менеджерам */
  notices: LeadNotice[];
  /** Поставленные в очередь задачи обработки моделей */
  queued: string[];
  /** Капча: true — «человек» */
  captcha: { pass: boolean };
  stop(): Promise<void>;
};

export async function startHarness(extraEnv: Record<string, string> = {}): Promise<Harness> {
  const [postgres, redisContainer]: [StartedPostgreSqlContainer, StartedRedisContainer] = await Promise.all([
    new PostgreSqlContainer('postgres:17-alpine').start(),
    new RedisContainer('redis:7-alpine').start(),
  ]);
  const databaseUrl = postgres.getConnectionUri();

  // Те же миграции, что и в production
  execFileSync(process.execPath, [join(apiRoot, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });

  const prisma = createPrisma(databaseUrl);
  await seedCatalog(prisma, buildCatalogRecords());
  const redis = createRedis(redisContainer.getConnectionUrl());
  await redis.connect();

  const env = loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisContainer.getConnectionUrl(),
    WEB_ORIGIN: 'http://localhost:3000',
    TOTP_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'),
    LEAD_IP_SALT: 'test-salt-123',
    ...extraEnv,
  });

  const storage = createMemoryStorage();
  const notices: LeadNotice[] = [];
  const queued: string[] = [];
  const captcha = { pass: true };
  const queue: ModelQueue = {
    enqueue: async (assetId) => {
      queued.push(assetId);
    },
    close: async () => undefined,
  };

  const app = await buildApp({
    env,
    prisma,
    redis,
    overrides: {
      storage,
      queue,
      captcha: async () => captcha.pass,
      notifier: {
        leadCreated: async (lead) => {
          notices.push(lead);
        },
      },
    },
  });
  await app.ready();

  return {
    app,
    prisma,
    redis,
    env,
    storage,
    notices,
    queued,
    captcha,
    async stop() {
      await app.close();
      await Promise.all([postgres.stop(), redisContainer.stop()]);
    },
  };
}
