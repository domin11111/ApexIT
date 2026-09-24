import { isOrderable } from '@apex/contracts';
import { describe, expect, it } from 'vitest';
import { loadCollection } from './validate';

const data = loadCollection();

const numeric = (slug: string, key: string) =>
  data.products
    .find((p) => p.slug === slug)
    ?.specGroups.flatMap((g) => g.specs)
    .find((s) => s.key === key)?.numericValue;

describe('коллекция', () => {
  it('проходит схему и перекрёстные проверки', () => {
    expect(data.products).toHaveLength(4);
  });

  it('идёт в порядке сцен главной', () => {
    expect(data.products.toSorted((a, b) => a.sortOrder - b.sortOrder).map((p) => p.slug)).toEqual([
      'epyc-9996-venice',
      'epyc-9965',
      'micron-ddr5-512gb-rdimm',
      'rtx-pro-6000-blackwell',
    ]);
  });

  // Раздел 1 брифа: цифры обязаны совпадать с базой (критерий готовности из раздела 9).
  it.each([
    ['epyc-9996-venice', 'cpu.cores', 256],
    ['epyc-9996-venice', 'cpu.threads', 512],
    ['epyc-9996-venice', 'cpu.baseClock', 2.55],
    ['epyc-9996-venice', 'cpu.maxBoost', 4.1],
    ['epyc-9996-venice', 'cpu.l3Cache', 1024],
    ['epyc-9996-venice', 'cpu.tdp', 600],
    ['epyc-9996-venice', 'cpu.memChannels', 16],
    ['epyc-9996-venice', 'cpu.memBandwidth', 1600],
    ['epyc-9996-venice', 'cpu.transistors', 203],
    ['epyc-9996-venice', 'cpu.pcieGen', 6],
    ['epyc-9996-venice', 'cpu.cxl', 3.1],
    ['epyc-9965', 'cpu.cores', 192],
    ['epyc-9965', 'cpu.threads', 384],
    ['epyc-9965', 'cpu.baseClock', 2.25],
    ['epyc-9965', 'cpu.allCoreBoost', 3.35],
    ['epyc-9965', 'cpu.maxBoost', 3.7],
    ['epyc-9965', 'cpu.l3Cache', 384],
    ['epyc-9965', 'cpu.tdp', 500],
    ['epyc-9965', 'cpu.memChannels', 12],
    ['epyc-9965', 'cpu.memSpeed', 6000],
    ['epyc-9965', 'cpu.memBandwidth', 576],
    ['epyc-9965', 'cpu.pcieLanes', 128],
    ['micron-ddr5-512gb-rdimm', 'memory.capacity', 512],
    ['micron-ddr5-512gb-rdimm', 'memory.speed', 9200],
    ['micron-ddr5-512gb-rdimm', 'memory.power', 16],
    ['micron-ddr5-512gb-rdimm', 'memory.powerBaseline', 44.2],
    ['micron-ddr5-512gb-rdimm', 'memory.maxSystemCapacity', 12],
    ['rtx-pro-6000-blackwell', 'gpu.vram', 96],
    ['rtx-pro-6000-blackwell', 'gpu.memoryBus', 512],
    ['rtx-pro-6000-blackwell', 'gpu.memoryBandwidth', 1792],
    ['rtx-pro-6000-blackwell', 'gpu.cudaCores', 24064],
    ['rtx-pro-6000-blackwell', 'gpu.tensorCores', 752],
    ['rtx-pro-6000-blackwell', 'gpu.rtCores', 188],
    ['rtx-pro-6000-blackwell', 'gpu.fp32', 125],
    ['rtx-pro-6000-blackwell', 'gpu.tgp', 600],
  ] as const)('%s → %s = %s', (slug, key, expected) => {
    expect(numeric(slug, key)).toBe(expected);
  });

  it('статусы и бейджи соответствуют брифу', () => {
    const status = Object.fromEntries(data.products.map((p) => [p.slug, [p.status, p.availabilityWindow]]));
    expect(status).toEqual({
      'epyc-9996-venice': ['COMING_SOON', 'Q4 2026'],
      'epyc-9965': ['AVAILABLE', undefined],
      'micron-ddr5-512gb-rdimm': ['PREVIEW', 'H2 2027'],
      'rtx-pro-6000-blackwell': ['AVAILABLE', undefined],
    });
  });

  it('PREVIEW-продукт нельзя заказать — только запросить информацию', () => {
    const preview = data.products.filter((p) => p.status === 'PREVIEW');
    expect(preview.length).toBeGreaterThan(0);
    for (const p of preview) expect(isOrderable(p.status)).toBe(false);
  });

  it('Venice нет на SP5, а 9965 — на SP7', () => {
    const sockets = (slug: string) =>
      data.products.find((p) => p.slug === slug)?.compatibility.map((c) => c.socket);
    expect(sockets('epyc-9996-venice')).toEqual(['SP7']);
    expect(sockets('epyc-9965')).toEqual(['SP5']);
  });
});
