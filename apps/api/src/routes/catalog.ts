import {
  ApiError,
  CompareQuery,
  CompareResponse,
  LocaleQuery,
  MotherboardListResponse,
  PlatformListResponse,
  ProductDetailDto,
  ProductListQuery,
  ProductListResponse,
  Slug,
  SocketParam,
} from '@apex/contracts';
import type { FastifyReply } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Cached } from '../cache/catalog-cache';
import type { CachedCatalog } from '../catalog/cached-catalog';

/** Браузер и CDN держат ответ минуту и ещё 5 минут могут отдавать его, обновляя в фоне. */
const CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=300';

function fromCache<T>(reply: FastifyReply, { value, hit }: Cached<T>): T {
  reply.header('cache-control', CACHE_CONTROL).header('x-cache', hit ? 'HIT' : 'MISS');
  return value;
}

const errors = { 400: ApiError, 404: ApiError, 422: ApiError, 429: ApiError };

export const catalogRoutes: FastifyPluginAsyncZod<{ catalog: CachedCatalog }> = async (app, { catalog }) => {
  app.get(
    '/products',
    {
      schema: {
        tags: ['catalog'],
        summary: 'Продукты коллекции',
        description: 'Опубликованные продукты в порядке презентации. Фильтры — по категории и статусу.',
        querystring: ProductListQuery,
        response: { 200: ProductListResponse, 400: errors[400], 429: errors[429] },
      },
    },
    async (request, reply) => {
      const { locale, ...filter } = request.query;
      return fromCache(reply, await catalog.listProducts(filter, locale));
    },
  );

  app.get(
    '/products/:slug',
    {
      schema: {
        tags: ['catalog'],
        summary: 'Продукт со всеми характеристиками',
        description: 'Характеристики по группам, хотспоты 3D-модели, ассеты и совместимость с платформами.',
        params: z.object({ slug: Slug }),
        querystring: LocaleQuery,
        response: { 200: ProductDetailDto, 400: errors[400], 404: errors[404], 429: errors[429] },
      },
    },
    async (request, reply) =>
      fromCache(reply, await catalog.getProduct(request.params.slug, request.query.locale)),
  );

  app.get(
    '/compare',
    {
      schema: {
        tags: ['catalog'],
        summary: 'Сравнение 2–3 продуктов одной категории',
        description: 'Нормализованная таблица: строки по ключам характеристик, лучшее значение и доли для баров.',
        querystring: CompareQuery,
        response: { 200: CompareResponse, 400: errors[400], 404: errors[404], 422: errors[422], 429: errors[429] },
      },
    },
    async (request, reply) =>
      fromCache(reply, await catalog.compare(request.query.slugs, request.query.locale)),
  );

  app.get(
    '/platforms',
    {
      schema: {
        tags: ['platforms'],
        summary: 'Серверные платформы (сокеты)',
        querystring: LocaleQuery,
        response: { 200: PlatformListResponse, 400: errors[400], 429: errors[429] },
      },
    },
    async (request, reply) => fromCache(reply, await catalog.listPlatforms(request.query.locale)),
  );

  app.get(
    '/platforms/:socket/motherboards',
    {
      schema: {
        tags: ['platforms'],
        summary: 'Материнские платы платформы',
        params: z.object({ socket: SocketParam }),
        querystring: LocaleQuery,
        response: { 200: MotherboardListResponse, 400: errors[400], 404: errors[404], 429: errors[429] },
      },
    },
    async (request, reply) =>
      fromCache(reply, await catalog.listMotherboards(request.params.socket, request.query.locale)),
  );
};
