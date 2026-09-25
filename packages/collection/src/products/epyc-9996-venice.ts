import { accents } from '@apex/ui/tokens';
import type { SeedProduct } from '../schema';

/*
 * Источники: анонс AMD Advancing AI 2026 (22.07.2026), обзоры Tom's Hardware, Hardware Busters, VRLA Tech.
 * Дополнено к брифу: скорости RDIMM/MRDIMM, число линий PCIe в 1P/2P, CXL 3.1, два I/O-кристалла.
 * Частоты 2,55 / 4,1 ГГц — из брифа; в открытых источниках на дату сида не подтверждены.
 */
export const epyc9996Venice: SeedProduct = {
  slug: 'epyc-9996-venice',
  name: 'EPYC 9996',
  brand: 'AMD',
  category: 'CPU',
  codename: 'Venice',
  headline: 'The New Era',
  tagline: ['256 ядер. 2 нанометра. Новая эпоха.', '256 cores. 2 nanometers. A new era.'],
  description: [
    'Первый высокопроизводительный x86-процессор на 2-нанометровом техпроцессе. Восемь чиплетов Zen 6c по 32 ядра, два I/O-кристалла и гигабайт кэша L3 в одном корпусе. Шестнадцать каналов памяти, PCIe 6.0 и CXL 3.1 открывают платформу SP7 — фундамент дата-центров следующего поколения.',
    'The first high-performance x86 processor built on a 2 nm process. Eight Zen 6c chiplets with 32 cores each, dual I/O dies and a full gigabyte of L3 cache in a single package. Sixteen memory channels, PCIe 6.0 and CXL 3.1 debut the SP7 platform — the foundation of next-generation data centers.',
  ],
  status: 'COMING_SOON',
  availabilityWindow: 'Q4 2026',
  availabilityNote: [
    'Анонсирован 22 июля 2026 г. Поставки платформы SP7 ожидаются в IV квартале 2026 г.',
    'Announced July 22, 2026. SP7 platform shipments expected in Q4 2026.',
  ],
  accentColor: accents.venice.solid,
  accentColorAlt: accents.venice.alt,
  modelPreset: 'CPU_SP7',
  model: { url: '/models/cpu-epyc-9996-sp7.glb', sizeBytes: 3891848, mobileSizeBytes: 1325368, triangles: 26132 },
  sortOrder: 10,

  specGroups: [
    {
      key: 'compute',
      title: ['Вычисления', 'Compute'],
      specs: [
        { key: 'cpu.architecture', label: ['Архитектура', 'Architecture'], value: ['Zen 6c', 'Zen 6c'] },
        { key: 'cpu.series', label: ['Серия', 'Series'], value: ['EPYC 9006', 'EPYC 9006'] },
        { key: 'cpu.cores', label: ['Ядра', 'Cores'], value: ['256', '256'], numericValue: 256, highlight: true },
        { key: 'cpu.threads', label: ['Потоки', 'Threads'], value: ['512', '512'], numericValue: 512, highlight: true },
        {
          key: 'cpu.ccdLayout',
          label: ['Чиплеты', 'Chiplets'],
          value: ['8 CCD × 32 ядра', '8 CCDs × 32 cores'],
          numericValue: 8,
        },
        { key: 'cpu.baseClock', label: ['Базовая частота', 'Base clock'], value: ['2,55 ГГц', '2.55 GHz'], numericValue: 2.55 },
        { key: 'cpu.maxBoost', label: ['Максимальный буст', 'Max boost'], value: ['до 4,1 ГГц', 'up to 4.1 GHz'], numericValue: 4.1 },
      ],
    },
    {
      key: 'cache',
      title: ['Кэш', 'Cache'],
      specs: [
        {
          key: 'cpu.l1Cache',
          label: ['Кэш L1', 'L1 cache'],
          value: ['Не раскрыто', 'Not disclosed'],
          note: ['AMD пока не опубликовала объёмы L1 и L2 для Zen 6c.', 'AMD has not yet published L1 and L2 sizes for Zen 6c.'],
        },
        {
          key: 'cpu.l2Cache',
          label: ['Кэш L2', 'L2 cache'],
          value: ['Не раскрыто', 'Not disclosed'],
          note: ['AMD пока не опубликовала объёмы L1 и L2 для Zen 6c.', 'AMD has not yet published L1 and L2 sizes for Zen 6c.'],
        },
        { key: 'cpu.l3Cache', label: ['Кэш L3', 'L3 cache'], value: ['1024 МБ', '1024 MB'], numericValue: 1024, highlight: true },
        { key: 'cpu.l3PerCcd', label: ['L3 на чиплет', 'L3 per chiplet'], value: ['128 МБ', '128 MB'], numericValue: 128 },
      ],
    },
    {
      key: 'memory',
      title: ['Память', 'Memory'],
      specs: [
        { key: 'cpu.memChannels', label: ['Каналы памяти', 'Memory channels'], value: ['16', '16'], numericValue: 16 },
        { key: 'cpu.memType', label: ['Тип', 'Type'], value: ['DDR5 ECC RDIMM / MRDIMM', 'DDR5 ECC RDIMM / MRDIMM'] },
        { key: 'cpu.memSpeed', label: ['Скорость RDIMM', 'RDIMM speed'], value: ['до 8000 МТ/с', 'up to 8,000 MT/s'], numericValue: 8000 },
        {
          key: 'cpu.memSpeedMrdimm',
          label: ['Скорость MRDIMM', 'MRDIMM speed'],
          value: ['до 12 800 МТ/с', 'up to 12,800 MT/s'],
          numericValue: 12800,
        },
        {
          key: 'cpu.memBandwidth',
          label: ['Пропускная способность', 'Bandwidth'],
          value: ['до 1,6 ТБ/с', 'up to 1.6 TB/s'],
          numericValue: 1600,
          highlight: true,
          note: ['На сокет, с модулями MRDIMM 12 800 МТ/с.', 'Per socket, with MRDIMM-12800.'],
        },
      ],
    },
    {
      key: 'power',
      title: ['Питание', 'Power'],
      specs: [{ key: 'cpu.tdp', label: ['TDP', 'TDP'], value: ['600 Вт', '600 W'], numericValue: 600 }],
    },
    {
      key: 'io',
      title: ['Интерфейсы и платформа', 'I/O & platform'],
      specs: [
        {
          key: 'cpu.socket',
          label: ['Сокет', 'Socket'],
          value: ['SP7', 'SP7'],
          note: ['Новая платформа, несовместима с SP5.', 'New platform, not compatible with SP5.'],
        },
        { key: 'cpu.socketConfigs', label: ['Конфигурации', 'Configurations'], value: ['1P / 2P', '1P / 2P'], numericValue: 2 },
        { key: 'cpu.pcieGen', label: ['PCI Express', 'PCI Express'], value: ['PCIe 6.0', 'PCIe 6.0'], numericValue: 6 },
        {
          key: 'cpu.pcieLanes',
          label: ['Линии PCIe', 'PCIe lanes'],
          value: ['128 (1P) · 160 (2P)', '128 (1P) · 160 (2P)'],
          numericValue: 128,
        },
        { key: 'cpu.cxl', label: ['CXL', 'CXL'], value: ['CXL 3.1', 'CXL 3.1'], numericValue: 3.1 },
      ],
    },
    {
      key: 'silicon',
      title: ['Кристалл', 'Silicon'],
      specs: [
        {
          key: 'cpu.process',
          label: ['Техпроцесс', 'Process'],
          value: ['TSMC 2 нм (CCD) · 6 нм (I/O)', 'TSMC 2 nm (CCD) · 6 nm (I/O)'],
          numericValue: 2,
        },
        { key: 'cpu.ioDies', label: ['I/O-кристаллы', 'I/O dies'], value: ['2 × 6 нм', '2 × 6 nm'], numericValue: 2 },
        {
          key: 'cpu.transistors',
          label: ['Транзисторы', 'Transistors'],
          value: ['≈ 203 млрд', '≈ 203 billion'],
          numericValue: 203,
        },
      ],
    },
  ],

  // Модель CPU: подложка в плоскости XZ, крышка над ней (y > 0), контакты снизу (y < 0).
  hotspots: [
    {
      key: 'ihs',
      anchorNode: 'ihs',
      position: [0, 0.075, 0],
      cameraPosition: [1.6, 1.5, 1.9],
      cameraTarget: [0, 0, 0],
      visibility: 'ASSEMBLED',
      title: ['Теплораспределительная крышка', 'Integrated heat spreader'],
      body: [
        'Никелированная медь забирает до 600 Вт тепла от восьми вычислительных чиплетов и передаёт его системе охлаждения.',
        'Nickel-plated copper draws up to 600 W of heat from eight compute chiplets into the cooler.',
      ],
    },
    {
      key: 'ccd',
      anchorNode: 'ccd_0',
      position: [-0.41, 0, -0.43],
      cameraPosition: [-0.85, 0.85, 0.3],
      cameraTarget: [-0.41, 0, -0.43],
      visibility: 'EXPLODED',
      title: ['Чиплет Zen 6c', 'Zen 6c chiplet'],
      body: [
        '32 ядра и 128 МБ кэша L3 на одном кристалле TSMC 2 нм. Таких чиплетов восемь — вместе 256 ядер.',
        '32 cores and 128 MB of L3 on a single TSMC 2 nm die. Eight of them add up to 256 cores.',
      ],
    },
    {
      key: 'io-die',
      anchorNode: 'iod_0',
      position: [-0.27, 0, 0],
      cameraPosition: [0.2, 1.1, 1.0],
      cameraTarget: [-0.27, 0, 0],
      visibility: 'EXPLODED',
      title: ['I/O-кристаллы', 'I/O dies'],
      body: [
        'Два кристалла 6 нм связывают чиплеты между собой и обслуживают 16 каналов DDR5, линии PCIe 6.0 и CXL 3.1.',
        'Two 6 nm dies interconnect the chiplets and drive 16 DDR5 channels, PCIe 6.0 lanes and CXL 3.1.',
      ],
    },
    {
      key: 'contacts',
      anchorNode: 'contacts',
      position: [0.6, -0.062, 0.6],
      cameraPosition: [1.5, -1.1, 1.5],
      cameraTarget: [0, -0.06, 0],
      title: ['Корпус под сокет SP7', 'SP7 package'],
      body: [
        'Новый сокет рассчитан на 16 каналов памяти и до 600 Вт питания. С платформой SP5 процессор не совместим.',
        'The new socket is built for 16 memory channels and up to 600 W. The processor is not compatible with SP5.',
      ],
    },
  ],

  compatibility: [{ socket: 'SP7', level: 'SUPPORTED' }],
};
