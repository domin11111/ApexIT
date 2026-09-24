import {
  ApiError,
  CompareResponse,
  MotherboardListResponse,
  PlatformListResponse,
  ProductDetailDto,
  ProductListResponse,
} from '@apex/contracts';
import { setupServer } from 'msw/node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { handlers } from './handlers';

const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());

const get = async (path: string) => {
  const response = await fetch(`http://mocks.test/api/v1${path}`);
  return { status: response.status, body: (await response.json()) as unknown };
};

describe('MSW-моки публичного API', () => {
  it('/products отдаёт коллекцию в порядке сцен', async () => {
    const { status, body } = await get('/products');
    expect(status).toBe(200);
    const list = ProductListResponse.parse(body);
    expect(list.items.map((p) => p.slug)).toEqual([
      'epyc-9996-venice',
      'epyc-9965',
      'micron-ddr5-512gb-rdimm',
      'rtx-pro-6000-blackwell',
    ]);
    expect(list.items[0]?.highlights.map((s) => s.key)).toContain('cpu.cores');
  });

  it('/products фильтрует по категории и статусу', async () => {
    const cpu = ProductListResponse.parse((await get('/products?category=CPU')).body);
    expect(cpu.items).toHaveLength(2);
    const preview = ProductListResponse.parse((await get('/products?status=PREVIEW')).body);
    expect(preview.items.map((p) => p.slug)).toEqual(['micron-ddr5-512gb-rdimm']);
  });

  it('/products/:slug локализует тексты', async () => {
    const ru = ProductDetailDto.parse((await get('/products/epyc-9996-venice')).body);
    const en = ProductDetailDto.parse((await get('/products/epyc-9996-venice?locale=en')).body);
    expect(ru.tagline).toBe('256 ядер. 2 нанометра. Новая эпоха.');
    expect(en.tagline).toBe('256 cores. 2 nanometers. A new era.');
    expect(en.specGroups[0]?.title).toBe('Compute');
    expect(en.hotspots.find((h) => h.key === 'ccd')?.visibility).toBe('EXPLODED');
  });

  it('неизвестный продукт — 404 с кодом', async () => {
    const { status, body } = await get('/products/pentium-4');
    expect(status).toBe(404);
    expect(ApiError.parse(body).error.code).toBe('PRODUCT_NOT_FOUND');
  });

  it('/compare отмечает лучшие значения', async () => {
    const table = CompareResponse.parse((await get('/compare?slugs=epyc-9996-venice,epyc-9965')).body);
    const best = (key: string) => table.rows.find((r) => r.key === key)?.cells.map((c) => c.isBest);
    expect(best('cpu.cores')).toEqual([true, false]);
    expect(best('cpu.tdp')).toEqual([false, true]);
    expect(best('cpu.l1Cache')).toEqual([false, false]);
  });

  it('/compare не смешивает категории', async () => {
    const { status, body } = await get('/compare?slugs=epyc-9965,rtx-pro-6000-blackwell');
    expect(status).toBe(422);
    expect(ApiError.parse(body).error.code).toBe('COMPARE_MIXED_CATEGORIES');
  });

  it('/platforms и платы по сокету', async () => {
    const platforms = PlatformListResponse.parse((await get('/platforms')).body);
    expect(platforms.items.map((p) => p.socket)).toEqual(['SP5', 'SP7']);
    const boards = MotherboardListResponse.parse((await get('/platforms/sp5/motherboards')).body);
    expect(boards.items).toHaveLength(4);
    expect((await get('/platforms/AM5/motherboards')).status).toBe(404);
  });
});
