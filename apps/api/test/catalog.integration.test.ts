import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalogRecords } from '@apex/collection';
import {
  ApiError,
  CompareResponse,
  MotherboardListResponse,
  PlatformListResponse,
  ProductDetailDto,
  ProductListResponse,
} from '@apex/contracts';
import { handlers } from '@apex/mocks';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { getResponse } from 'msw';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../src/app';
import { createRedis } from '../src/cache/redis';
import { loadEnv } from '../src/config/env';
import { createPrisma } from '../src/db/prisma';
import { seedCatalog } from '../src/db/seed-catalog';

const apiRoot = fileURLToPath(new URL('..', import.meta.url));

let postgres: StartedPostgreSqlContainer;
let redisContainer: StartedRedisContainer;
let app: App;

beforeAll(async () => {
  [postgres, redisContainer] = await Promise.all([
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

  app = await buildApp({
    env: loadEnv({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: databaseUrl,
      REDIS_URL: redisContainer.getConnectionUrl(),
      WEB_ORIGIN: 'http://localhost:3000',
    }),
    prisma,
    redis,
  });
  await app.ready();
});

afterAll(async () => {
  await app?.close();
  await Promise.all([postgres?.stop(), redisContainer?.stop()]);
});

const get = async (url: string, headers: Record<string, string> = {}) => {
  const response = await app.inject({ method: 'GET', url, headers });
  return { status: response.statusCode, headers: response.headers, body: response.json() as unknown };
};

describe('публичный API каталога', () => {
  it('GET /api/v1/products — коллекция в порядке сцен', async () => {
    const { status, body } = await get('/api/v1/products');
    expect(status).toBe(200);
    expect(ProductListResponse.parse(body).items.map((p) => p.slug)).toEqual([
      'epyc-9996-venice',
      'epyc-9965',
      'micron-ddr5-512gb-rdimm',
      'rtx-pro-6000-blackwell',
    ]);
  });

  it('фильтры и валидация query', async () => {
    const gpu = ProductListResponse.parse((await get('/api/v1/products?category=GPU')).body);
    expect(gpu.items.map((p) => p.slug)).toEqual(['rtx-pro-6000-blackwell']);

    const invalid = await get('/api/v1/products?category=QUANTUM');
    expect(invalid.status).toBe(400);
    expect(ApiError.parse(invalid.body).error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /api/v1/products/:slug — детали и локализация', async () => {
    const venice = ProductDetailDto.parse((await get('/api/v1/products/epyc-9996-venice?locale=en')).body);
    expect(venice.tagline).toBe('256 cores. 2 nanometers. A new era.');
    expect(venice.specGroups.flatMap((g) => g.specs)).toHaveLength(25);
    expect(venice.compatibility).toEqual([
      { socket: 'SP7', platformName: 'SP7', level: 'SUPPORTED', notes: null },
    ]);
    expect(venice.models.map((m) => [m.variant, m.url, m.mimeType])).toEqual([
      ['DESKTOP', '/models/cpu-epyc-9996-sp7.glb', 'model/gltf-binary'],
      ['MOBILE', '/models/cpu-epyc-9996-sp7-mobile.glb', 'model/gltf-binary'],
    ]);
  });

  it('404 с кодом и request id', async () => {
    const { status, headers, body } = await get('/api/v1/products/pentium-4');
    expect(status).toBe(404);
    const error = ApiError.parse(body).error;
    expect(error.code).toBe('PRODUCT_NOT_FOUND');
    expect(error.requestId).toBe(headers['x-request-id']);
  });

  it('GET /api/v1/compare — лучшие значения, ошибки категорий и неизвестных продуктов', async () => {
    const table = CompareResponse.parse((await get('/api/v1/compare?slugs=epyc-9965,epyc-9996-venice')).body);
    expect(table.products.map((p) => p.slug)).toEqual(['epyc-9965', 'epyc-9996-venice']);
    const cores = table.rows.find((r) => r.key === 'cpu.cores');
    expect(cores?.cells.map((c) => [c.isBest, c.ratio])).toEqual([
      [false, 0.75],
      [true, 1],
    ]);

    const mixed = await get('/api/v1/compare?slugs=epyc-9965,rtx-pro-6000-blackwell');
    expect(mixed.status).toBe(422);

    const unknown = await get('/api/v1/compare?slugs=epyc-9965,xeon-6980p');
    expect(unknown.status).toBe(404);
    expect(ApiError.parse(unknown.body).error.details).toEqual({ missing: ['xeon-6980p'] });
  });

  it('GET /api/v1/platforms и платы по сокету', async () => {
    const platforms = PlatformListResponse.parse((await get('/api/v1/platforms')).body);
    expect(platforms.items.map((p) => p.socket)).toEqual(['SP5', 'SP7']);

    const boards = MotherboardListResponse.parse((await get('/api/v1/platforms/sp5/motherboards')).body);
    expect(boards.items.map((b) => b.maxCpuTdpW)).toEqual([400, 400, 500, 500]);
    expect((await get('/api/v1/platforms/AM5/motherboards')).status).toBe(404);
  });

  it('кэш Redis и ETag', async () => {
    const url = '/api/v1/products/rtx-pro-6000-blackwell';
    const first = await app.inject({ method: 'GET', url });
    const second = await app.inject({ method: 'GET', url });
    expect(first.headers['x-cache']).toBe('MISS');
    expect(second.headers['x-cache']).toBe('HIT');
    expect(second.body).toBe(first.body);

    const etag = String(first.headers.etag);
    const notModified = await app.inject({ method: 'GET', url, headers: { 'if-none-match': etag } });
    expect(notModified.statusCode).toBe(304);
    expect(notModified.body).toBe('');
  });

  it('заголовки безопасности и CORS', async () => {
    const { headers } = await get('/api/v1/platforms', { origin: 'http://localhost:3000' });
    expect(headers['content-security-policy']).toContain("default-src 'none'");
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['access-control-allow-origin']).toBe('http://localhost:3000');

    const foreign = await get('/api/v1/platforms', { origin: 'https://evil.example' });
    expect(foreign.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('GET /health', async () => {
    const { status, body } = await get('/health');
    expect(status).toBe(200);
    expect(body).toMatchObject({ status: 'ok', checks: { database: 'ok', cache: 'ok' } });
  });

  it('OpenAPI описывает все публичные маршруты', async () => {
    const { body } = await get('/docs/json');
    const doc = body as { paths: Record<string, unknown>; components: { schemas: Record<string, unknown> } };
    expect(Object.keys(doc.paths).sort()).toEqual([
      '/api/v1/compare',
      '/api/v1/platforms',
      '/api/v1/platforms/{socket}/motherboards',
      '/api/v1/products',
      '/api/v1/products/{slug}',
      '/health',
    ]);
    expect(Object.keys(doc.components.schemas)).toEqual(
      expect.arrayContaining(['ProductDetail', 'ProductSummary', 'Spec', 'CompareResponse', 'ApiError']),
    );
    // Входные дубликаты схем без ссылок на них в документ не попадают
    expect(Object.keys(doc.components.schemas).filter((id) => id.endsWith('Input'))).toEqual([]);
  });
});

/** Убирает id: в БД они uuid v7, в моках — детерминированные. Остальное должно совпасть байт в байт. */
const withoutIds = (value: unknown): unknown =>
  JSON.parse(JSON.stringify(value), (key, v: unknown) => (key === 'id' ? undefined : v));

describe('MSW-моки совпадают с API', () => {
  it.each([
    '/api/v1/products',
    '/api/v1/products?locale=en',
    '/api/v1/products?status=AVAILABLE',
    '/api/v1/products/epyc-9996-venice',
    '/api/v1/products/epyc-9965?locale=en',
    '/api/v1/products/micron-ddr5-512gb-rdimm',
    '/api/v1/products/rtx-pro-6000-blackwell?locale=en',
    '/api/v1/products/unknown-product',
    '/api/v1/compare?slugs=epyc-9996-venice,epyc-9965',
    '/api/v1/compare?slugs=epyc-9965,micron-ddr5-512gb-rdimm',
    '/api/v1/platforms?locale=en',
    '/api/v1/platforms/SP5/motherboards',
    '/api/v1/platforms/sp7/motherboards?locale=en',
  ])('%s', async (url) => {
    const api = await get(url);
    const mock = await getResponse(handlers, new Request(`http://mocks.test${url}`));
    expect(mock, 'мок не найден').toBeDefined();

    expect(mock?.status).toBe(api.status);
    const mockBody = (await mock?.json()) as { error?: { requestId?: string } };
    const apiBody = api.body as { error?: { requestId?: string } };
    // requestId есть только у настоящего API
    if (apiBody.error) delete apiBody.error.requestId;
    expect(withoutIds(mockBody)).toEqual(withoutIds(apiBody));
  });
});
