import { buildCatalogRecords } from '@apex/collection';
import { createCatalogService } from '@apex/domain';
import { createMemorySource } from '@apex/mocks';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  balancedMemoryCounts,
  boardOptions,
  changeBoard,
  changeCpu,
  changeSocket,
  defaultPayload,
  evaluate,
  type ConfiguratorCatalog,
} from './configurator-state';

let catalog: ConfiguratorCatalog;

beforeAll(async () => {
  const service = createCatalogService(createMemorySource(buildCatalogRecords()));
  const { items: platforms } = await service.listPlatforms('ru');
  const boards = Object.fromEntries(
    await Promise.all(platforms.map(async (p) => [p.socket, (await service.listMotherboards(p.socket, 'ru')).items] as const)),
  );
  const { items } = await service.listProducts({}, 'ru');
  const products = await Promise.all(items.map((p) => service.getProduct(p.slug, 'ru')));
  catalog = { platforms, boards, products };
});

describe('состояние конфигуратора на данных коллекции', () => {
  it('по умолчанию — EPYC 9996 на SP7, 16 модулей (все каналы) и две карты; сборка валидна', () => {
    const payload = defaultPayload(catalog);
    expect(payload).toMatchObject({
      socket: 'SP7',
      cpu: { slug: 'epyc-9996-venice', count: 1 },
      memory: { slug: 'micron-ddr5-512gb-rdimm', count: 16 },
      gpu: { slug: 'rtx-pro-6000-blackwell', count: 2 },
    });
    expect(evaluate(catalog, payload, 'ru').valid).toBe(true);
  });

  it('переход на SP5 меняет процессор на EPYC 9965 и перераспределяет память по 12 каналам', () => {
    const sp5 = changeSocket(catalog, defaultPayload(catalog), 'SP5');
    expect(sp5.cpu.slug).toBe('epyc-9965');
    expect(sp5.memory?.count).toBe(12);
    expect(evaluate(catalog, sp5, 'ru').valid).toBe(true);
  });

  it('платы SP5 для EPYC 9965: H13 не подходят по TDP — с причиной', () => {
    const sp5 = changeSocket(catalog, defaultPayload(catalog), 'SP5');
    const options = boardOptions(catalog, sp5, 'ru');
    const verdict = Object.fromEntries(options.map((o) => [o.board.model, o.fits]));
    expect(verdict).toEqual({ 'H13SSL-N': false, H13DSH: false, 'MZ33-AR1 (rev. 3.x)': true, 'TURIN2D24G-2L+/500W': true });
    expect(options[0]!.reason).toContain('до 400 Вт');
  });

  it('односокетная плата подрезает 2P до одного процессора и память — до слотов', () => {
    const sp5 = changeCpu(catalog, changeSocket(catalog, defaultPayload(catalog), 'SP5'), { count: 2 });
    expect(balancedMemoryCounts(catalog, sp5)).toEqual([24, 48]);
    const mz33 = catalog.boards.SP5!.find((b) => b.model.startsWith('MZ33'))!;
    const onBoard = changeBoard(catalog, { ...sp5, memory: { slug: 'micron-ddr5-512gb-rdimm', count: 48 } }, mz33.id);
    expect(onBoard.cpu.count).toBe(1);
    expect(onBoard.memory?.count).toBe(24);
  });
});
