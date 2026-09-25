import { randomUUID } from 'node:crypto';
import { createCatalogService, createConfiguratorService, type CatalogReader } from '@apex/domain';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import etag from '@fastify/etag';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyServerOptions } from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { createCatalogPublisher } from './admin/publish';
import { createSessionStore } from './admin/session';
import { createModelQueue, type ModelQueue } from './assets/jobs';
import { CatalogCache } from './cache/catalog-cache';
import type { Redis } from './cache/redis';
import { createCachedCatalog } from './catalog/cached-catalog';
import { createPrismaSource } from './catalog/prisma-source';
import { createPrismaConfigurationStore } from './configurations/prisma-store';
import type { Env } from './config/env';
import type { Db } from './db/prisma';
import { registerErrorHandlers } from './http/errors';
import { transformObject } from './http/openapi';
import { turnstileVerifier, type CaptchaVerifier } from './leads/captcha';
import { createNotifier, type Notifier } from './leads/notifier';
import { adminRoutes } from './routes/admin';
import { catalogRoutes } from './routes/catalog';
import { configurationRoutes } from './routes/configurations';
import { healthRoutes } from './routes/health';
import { leadRoutes } from './routes/leads';
import { createS3Storage, ensureStorageSetup, type Storage } from './storage/storage';

export type AppDeps = {
  env: Env;
  prisma: Db;
  redis: Redis;
  /** Подмена внешних сервисов в тестах: капча, уведомления, S3, очередь воркера */
  overrides?: { captcha?: CaptchaVerifier; notifier?: Notifier; storage?: Storage; queue?: ModelQueue };
};

function logger(env: Env): FastifyServerOptions['logger'] {
  return {
    level: env.LOG_LEVEL,
    // Куки и авторизация не должны попадать в логи
    redact: ['req.headers.authorization', 'req.headers.cookie'],
    ...(env.NODE_ENV === 'development'
      ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } }
      : {}),
  };
}

/**
 * Собирает приложение без запуска сервера: server.ts слушает порт,
 * тесты вызывают app.inject(), скрипт экспорта берёт app.swagger().
 */
export async function buildApp({ env, prisma, redis, overrides = {} }: AppDeps) {
  const app = Fastify({
    logger: logger(env),
    trustProxy: env.TRUST_PROXY,
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandlers(app);

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });
  app.addHook('onClose', async () => {
    await prisma.$disconnect();
    redis.disconnect();
  });

  // Документация OpenAPI строится из тех же Zod-схем, что валидируют запросы и ответы.
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'APEX // Compute Collection API',
        version: '1.0.0',
        description:
          'Публичный API каталога флагманских серверных комплектующих. Тексты локализуются параметром `locale` (ru — по умолчанию, en).',
      },
      servers: [{ url: env.API_PUBLIC_URL ?? `http://localhost:${env.API_PORT}` }],
      tags: [
        { name: 'catalog', description: 'Продукты коллекции и сравнение' },
        { name: 'platforms', description: 'Сокеты и материнские платы' },
        { name: 'configurator', description: 'Движок совместимости и сохранённые сборки' },
        { name: 'leads', description: 'Заявки посетителей' },
        { name: 'admin', description: 'Закрытое API админки: сессия в httpOnly cookie, заголовок x-apex-admin: 1' },
        { name: 'system', description: 'Служебные эндпоинты' },
      ],
    },
    transform: jsonSchemaTransform,
    transformObject,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  await app.register(cors, {
    origin: env.WEB_ORIGIN,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'x-apex-admin'],
    exposedHeaders: ['x-request-id', 'x-cache', 'etag', 'content-disposition'],
    // Админка на сайте ходит в API с cookie сессии; origin — только из списка WEB_ORIGIN
    credentials: true,
    maxAge: 600,
  });
  await app.register(cookie);

  const cache = new CatalogCache(redis, env.CACHE_TTL_SECONDS, app.log);
  const catalog = createCachedCatalog(createCatalogService(createPrismaSource(prisma)), cache);
  // Конфигуратор читает каталог через тот же кэш: проверка сборки не ходит в БД на каждый клик
  const cachedReader: CatalogReader = {
    getProduct: async (slug, locale) => (await catalog.getProduct(slug, locale)).value,
    listPlatforms: async (locale) => (await catalog.listPlatforms(locale)).value,
    listMotherboards: async (socket, locale) => (await catalog.listMotherboards(socket, locale)).value,
  };
  const configurator = createConfiguratorService({ catalog: cachedReader, store: createPrismaConfigurationStore(prisma) });

  const storage = overrides.storage ?? createS3Storage(env);
  if (env.S3_AUTO_SETUP && !overrides.storage) {
    await ensureStorageSetup(env, app.log).catch((err: unknown) => app.log.warn({ err }, 'Хранилище S3 недоступно — загрузка моделей не будет работать'));
  }
  const queue = overrides.queue ?? createModelQueue(env.REDIS_URL);
  app.addHook('onClose', async () => {
    await queue.close();
  });
  const publisher = createCatalogPublisher({ cache, webUrl: env.WEB_URL, secret: env.REVALIDATE_SECRET, log: app.log });
  const leadDeps = {
    prisma,
    captcha: overrides.captcha ?? turnstileVerifier(env.TURNSTILE_SECRET, app.log),
    notifier: overrides.notifier ?? createNotifier(env, app.log),
    configurator,
    ipSalt: env.LEAD_IP_SALT,
    log: app.log,
  };
  const sessions = createSessionStore(prisma, { hours: env.ADMIN_SESSION_HOURS, secure: env.NODE_ENV === 'production' });

  // Всё, кроме /docs: строгие заголовки безопасности, ETag и rate limit.
  // Swagger UI вынесен за этот контекст — ему нужен собственный CSP со скриптами.
  await app.register(async (api) => {
    await api.register(helmet, {
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"] },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    });
    await api.register(etag);
    await api.register(rateLimit, {
      max: env.RATE_LIMIT_MAX,
      timeWindow: '1 minute',
      redis,
      nameSpace: 'apex:ratelimit:',
      // Упал Redis — не блокируем пользователей
      skipOnError: true,
    });

    await api.register(healthRoutes, { prisma, redis });
    await api.register(catalogRoutes, { prefix: '/api/v1', catalog });
    await api.register(configurationRoutes, { prefix: '/api/v1', configurator });
    await api.register(leadRoutes, { prefix: '/api/v1', deps: leadDeps, perHour: env.LEAD_RATE_LIMIT_PER_HOUR });
    await api.register(adminRoutes, {
      prefix: '/api/admin',
      deps: { prisma, redis, env, sessions, publisher, storage, queue, log: app.log },
    });
  });

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
