import { randomUUID } from 'node:crypto';
import { createCatalogService, createConfiguratorService, type CatalogReader } from '@apex/domain';
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
import { CatalogCache } from './cache/catalog-cache';
import type { Redis } from './cache/redis';
import { createCachedCatalog } from './catalog/cached-catalog';
import { createPrismaSource } from './catalog/prisma-source';
import { createPrismaConfigurationStore } from './configurations/prisma-store';
import type { Env } from './config/env';
import type { Db } from './db/prisma';
import { registerErrorHandlers } from './http/errors';
import { transformObject } from './http/openapi';
import { catalogRoutes } from './routes/catalog';
import { configurationRoutes } from './routes/configurations';
import { healthRoutes } from './routes/health';

export type AppDeps = { env: Env; prisma: Db; redis: Redis };

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
export async function buildApp({ env, prisma, redis }: AppDeps) {
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
        { name: 'system', description: 'Служебные эндпоинты' },
      ],
    },
    transform: jsonSchemaTransform,
    transformObject,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  await app.register(cors, {
    origin: env.WEB_ORIGIN,
    methods: ['GET', 'HEAD', 'POST', 'OPTIONS'],
    exposedHeaders: ['x-request-id', 'x-cache', 'etag'],
    maxAge: 600,
  });

  const catalog = createCachedCatalog(
    createCatalogService(createPrismaSource(prisma)),
    new CatalogCache(redis, env.CACHE_TTL_SECONDS, app.log),
  );
  // Конфигуратор читает каталог через тот же кэш: проверка сборки не ходит в БД на каждый клик
  const cachedReader: CatalogReader = {
    getProduct: async (slug, locale) => (await catalog.getProduct(slug, locale)).value,
    listPlatforms: async (locale) => (await catalog.listPlatforms(locale)).value,
    listMotherboards: async (socket, locale) => (await catalog.listMotherboards(socket, locale)).value,
  };
  const configurator = createConfiguratorService({ catalog: cachedReader, store: createPrismaConfigurationStore(prisma) });

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
  });

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
