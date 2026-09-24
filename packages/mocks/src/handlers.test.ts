import {
  ApiError,
  CompareResponse,
  CreateConfigurationResponse,
  SavedConfigurationDto,
  ValidateConfigurationResponse,
  type ConfigurationPayload,
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

const post = async (path: string, body: unknown) => {
  const response = await fetch(`http://mocks.test/api/v1${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
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

describe('MSW-моки конфигуратора', () => {
  const build = (over: Partial<ConfigurationPayload> = {}): ConfigurationPayload => ({
    schemaVersion: 1,
    socket: 'SP5',
    motherboardId: null,
    cpu: { slug: 'epyc-9965', count: 2 },
    memory: null,
    gpu: { slug: 'rtx-pro-6000-blackwell', count: 4 },
    ...over,
  });

  it('EPYC 9996 на SP5 — несовместимо, с объяснением', async () => {
    const { status, body } = await post('/configurations/validate', build({ cpu: { slug: 'epyc-9996-venice', count: 1 } }));
    expect(status).toBe(200);
    const result = ValidateConfigurationResponse.parse(body);
    expect(result.valid).toBe(false);
    expect(result.issues[0]).toMatchObject({ code: 'SOCKET_MISMATCH', field: 'cpu' });
  });

  it('EPYC 9965 на Supermicro H13SSL-N — не хватает 100 Вт TDP', async () => {
    const boards = MotherboardListResponse.parse((await get('/platforms/SP5/motherboards')).body).items;
    const h13 = boards.find((b) => b.model === 'H13SSL-N')!;
    const result = ValidateConfigurationResponse.parse(
      (await post('/configurations/validate?locale=en', build({ motherboardId: h13.id, cpu: { slug: 'epyc-9965', count: 1 } }))).body,
    );
    const issue = result.issues.find((i) => i.code === 'CPU_TDP_EXCEEDS_BOARD');
    expect(issue?.message).toBe('Supermicro H13SSL-N supports CPUs up to 400 W, but AMD EPYC 9965 is rated at 500 W');
  });

  it('сохранение: код стабилен, сборка читается обратно', async () => {
    const payload = build();
    const first = await post('/configurations', payload);
    expect(first.status).toBe(201);
    const { shareCode } = CreateConfigurationResponse.parse(first.body);
    expect(CreateConfigurationResponse.parse((await post('/configurations', payload)).body).shareCode).toBe(shareCode);

    const saved = SavedConfigurationDto.parse((await get(`/configurations/${shareCode}`)).body);
    expect(saved.payload).toEqual(payload);
    expect(saved.totals).toMatchObject({ cores: 384, threads: 768, vramGb: 384 });
  });

  it('несовместимую сборку сохранить нельзя; неизвестный код — 404', async () => {
    const invalid = await post('/configurations', build({ cpu: { slug: 'epyc-9996-venice', count: 1 } }));
    expect(invalid.status).toBe(422);
    expect(ApiError.parse(invalid.body).error.code).toBe('CONFIGURATION_INVALID');
    expect((await get('/configurations/abcdefghjk')).status).toBe(404);
    expect((await get('/configurations/not-a-code')).status).toBe(400);
  });
});
