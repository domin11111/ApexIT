import { accents } from '@apex/ui/tokens';
import type { SeedProduct } from '../schema';

/*
 * Источник: спецификация AMD EPYC 9005.
 * Дополнено к брифу: кэш L1/L2 (Zen 5c: 32 КБ I + 48 КБ D и 1 МБ L2 на ядро), раскладка 12 × 16 ядер,
 * техпроцесс CCD (TSMC 3 нм), до 160 линий PCIe в 2P.
 */
export const epyc9965: SeedProduct = {
  slug: 'epyc-9965',
  name: 'EPYC 9965',
  brand: 'AMD',
  category: 'CPU',
  codename: 'Turin Dense',
  headline: 'The Density King',
  tagline: ['192 ядра. Одна сущность.', '192 cores. One entity.'],
  description: [
    '192 ядра Zen 5c в одном сокете. Процессор создан для максимальной плотности вычислений: облака, контейнеры и масштабируемые сервисы получают больше ядер на стойку и на ватт. Проверенная платформа SP5 — доступна уже сегодня.',
    '192 Zen 5c cores in a single socket. Built for maximum compute density: cloud, containers and scale-out services get more cores per rack and per watt. On the proven SP5 platform — available today.',
  ],
  status: 'AVAILABLE',
  accentColor: accents.epyc9965.solid,
  modelPreset: 'CPU_SP5',
  sortOrder: 20,

  specGroups: [
    {
      key: 'compute',
      title: ['Вычисления', 'Compute'],
      specs: [
        { key: 'cpu.architecture', label: ['Архитектура', 'Architecture'], value: ['Zen 5c «Turin Dense»', 'Zen 5c “Turin Dense”'] },
        { key: 'cpu.series', label: ['Серия', 'Series'], value: ['EPYC 9005', 'EPYC 9005'] },
        { key: 'cpu.cores', label: ['Ядра', 'Cores'], value: ['192', '192'], numericValue: 192, highlight: true },
        { key: 'cpu.threads', label: ['Потоки', 'Threads'], value: ['384', '384'], numericValue: 384, highlight: true },
        {
          key: 'cpu.ccdLayout',
          label: ['Чиплеты', 'Chiplets'],
          value: ['12 CCD × 16 ядер', '12 CCDs × 16 cores'],
          numericValue: 12,
        },
        { key: 'cpu.baseClock', label: ['Базовая частота', 'Base clock'], value: ['2,25 ГГц', '2.25 GHz'], numericValue: 2.25 },
        {
          key: 'cpu.allCoreBoost',
          label: ['Буст на все ядра', 'All-core boost'],
          value: ['3,35 ГГц', '3.35 GHz'],
          numericValue: 3.35,
        },
        { key: 'cpu.maxBoost', label: ['Максимальный буст', 'Max boost'], value: ['до 3,7 ГГц', 'up to 3.7 GHz'], numericValue: 3.7 },
      ],
    },
    {
      key: 'cache',
      title: ['Кэш', 'Cache'],
      specs: [
        {
          key: 'cpu.l1Cache',
          label: ['Кэш L1', 'L1 cache'],
          value: ['15 МБ', '15 MB'],
          numericValue: 15,
          note: ['80 КБ на ядро: 32 КБ инструкций + 48 КБ данных.', '80 KB per core: 32 KB instruction + 48 KB data.'],
        },
        {
          key: 'cpu.l2Cache',
          label: ['Кэш L2', 'L2 cache'],
          value: ['192 МБ', '192 MB'],
          numericValue: 192,
          note: ['1 МБ на ядро.', '1 MB per core.'],
        },
        { key: 'cpu.l3Cache', label: ['Кэш L3', 'L3 cache'], value: ['384 МБ', '384 MB'], numericValue: 384, highlight: true },
        { key: 'cpu.l3PerCcd', label: ['L3 на чиплет', 'L3 per chiplet'], value: ['32 МБ', '32 MB'], numericValue: 32 },
      ],
    },
    {
      key: 'memory',
      title: ['Память', 'Memory'],
      specs: [
        { key: 'cpu.memChannels', label: ['Каналы памяти', 'Memory channels'], value: ['12', '12'], numericValue: 12 },
        { key: 'cpu.memType', label: ['Тип', 'Type'], value: ['DDR5 ECC RDIMM', 'DDR5 ECC RDIMM'] },
        { key: 'cpu.memSpeed', label: ['Скорость', 'Speed'], value: ['до 6000 МТ/с', 'up to 6,000 MT/s'], numericValue: 6000 },
        {
          key: 'cpu.memBandwidth',
          label: ['Пропускная способность', 'Bandwidth'],
          value: ['до 576 ГБ/с', 'up to 576 GB/s'],
          numericValue: 576,
          highlight: true,
          note: ['На сокет.', 'Per socket.'],
        },
      ],
    },
    {
      key: 'power',
      title: ['Питание', 'Power'],
      specs: [
        { key: 'cpu.tdp', label: ['TDP', 'TDP'], value: ['500 Вт', '500 W'], numericValue: 500 },
        {
          key: 'cpu.ctdp',
          label: ['Настраиваемый TDP', 'Configurable TDP'],
          value: ['450–500 Вт', '450–500 W'],
          numericValue: 450,
        },
      ],
    },
    {
      key: 'io',
      title: ['Интерфейсы и платформа', 'I/O & platform'],
      specs: [
        { key: 'cpu.socket', label: ['Сокет', 'Socket'], value: ['SP5 (LGA 6096)', 'SP5 (LGA 6096)'] },
        { key: 'cpu.socketConfigs', label: ['Конфигурации', 'Configurations'], value: ['1P / 2P', '1P / 2P'], numericValue: 2 },
        { key: 'cpu.pcieGen', label: ['PCI Express', 'PCI Express'], value: ['PCIe 5.0', 'PCIe 5.0'], numericValue: 5 },
        {
          key: 'cpu.pcieLanes',
          label: ['Линии PCIe', 'PCIe lanes'],
          value: ['128 (1P) · до 160 (2P)', '128 (1P) · up to 160 (2P)'],
          numericValue: 128,
        },
        { key: 'cpu.cxl', label: ['CXL', 'CXL'], value: ['CXL 2.0', 'CXL 2.0'], numericValue: 2 },
      ],
    },
    {
      key: 'silicon',
      title: ['Кристалл', 'Silicon'],
      specs: [
        {
          key: 'cpu.process',
          label: ['Техпроцесс', 'Process'],
          value: ['TSMC 3 нм (CCD) · 6 нм (I/O)', 'TSMC 3 nm (CCD) · 6 nm (I/O)'],
          numericValue: 3,
        },
        { key: 'cpu.ioDies', label: ['I/O-кристалл', 'I/O die'], value: ['1 × 6 нм', '1 × 6 nm'], numericValue: 1 },
      ],
    },
  ],

  hotspots: [
    {
      key: 'ihs',
      anchorNode: 'ihs',
      position: [0, 0.13, 0],
      cameraPosition: [1.6, 1.5, 1.9],
      cameraTarget: [0, 0, 0],
      visibility: 'ASSEMBLED',
      title: ['Теплораспределительная крышка', 'Integrated heat spreader'],
      body: [
        'Под крышкой — двенадцать вычислительных чиплетов. Она выравнивает тепловой поток 500-ваттного процессора.',
        'Twelve compute chiplets sit beneath the lid, which evens out the heat flow of a 500 W processor.',
      ],
    },
    {
      key: 'ccd',
      anchorNode: 'ccd_0',
      position: [-0.55, 0.05, -0.4],
      cameraPosition: [-0.95, 0.9, 0.4],
      cameraTarget: [-0.55, 0.03, -0.4],
      visibility: 'EXPLODED',
      title: ['Чиплет Zen 5c', 'Zen 5c chiplet'],
      body: [
        '16 компактных ядер Zen 5c и 32 МБ L3 на кристалле TSMC 3 нм. Двенадцать таких чиплетов дают 192 ядра.',
        '16 compact Zen 5c cores and 32 MB of L3 on a TSMC 3 nm die. Twelve chiplets deliver 192 cores.',
      ],
    },
    {
      key: 'io-die',
      anchorNode: 'iod_0',
      position: [0, 0.05, 0],
      cameraPosition: [0.4, 1.1, 1.0],
      cameraTarget: [0, 0.03, 0],
      visibility: 'EXPLODED',
      title: ['I/O-кристалл', 'I/O die'],
      body: [
        'Центральный кристалл 6 нм: 12 каналов DDR5, 128 линий PCIe 5.0 и CXL 2.0.',
        'The central 6 nm die: 12 DDR5 channels, 128 PCIe 5.0 lanes and CXL 2.0.',
      ],
    },
    {
      key: 'contacts',
      anchorNode: 'contacts',
      position: [0.6, -0.07, 0.55],
      cameraPosition: [1.5, -1.1, 1.5],
      cameraTarget: [0, -0.06, 0],
      title: ['LGA 6096', 'LGA 6096'],
      body: [
        '6096 контактов сокета SP5 — платформа, которую уже поддерживают серверные платы ведущих производителей.',
        'The 6,096-contact SP5 socket — a platform already backed by boards from leading vendors.',
      ],
    },
  ],

  compatibility: [{ socket: 'SP5', level: 'SUPPORTED' }],
};
