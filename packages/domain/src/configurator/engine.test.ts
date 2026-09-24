import type {
  CompatibilityLevel,
  ConfigurationPayload,
  MotherboardDto,
  PlatformDto,
  ProductCategory,
  ProductDetailDto,
  ProductStatus,
} from '@apex/contracts';
import { describe, expect, it } from 'vitest';
import { computeLimits, evaluateConfiguration, type EngineInput } from './engine';
import { shareCodeFor } from './service';

// ── Фикстуры: минимальные DTO с цифрами, похожими на реальные ───────────────

const SP5: PlatformDto = {
  id: '00000000-0000-4000-8000-000000000005',
  socket: 'SP5',
  name: 'SP5 · LGA 6096',
  cpuFamily: 'AMD EPYC 9005',
  memoryChannels: 12,
  dimmsPerChannel: 2,
  maxMemorySpeedMts: 6400,
  maxMrdimmSpeedMts: null,
  pcieGen: 5,
  pcieLanes1P: 128,
  pcieLanes2P: 160,
  cxlVersion: '2.0',
  maxSockets: 2,
  maxCpuTdpW: 500,
  status: 'AVAILABLE',
  availabilityWindow: null,
  availabilityNote: null,
};
const SP7: PlatformDto = {
  ...SP5,
  id: '00000000-0000-4000-8000-000000000007',
  socket: 'SP7',
  name: 'SP7',
  memoryChannels: 16,
  dimmsPerChannel: null,
  maxCpuTdpW: 600,
  status: 'COMING_SOON',
  availabilityWindow: 'Q4 2026',
};

let boardSeq = 0;
function board(over: Partial<MotherboardDto>): MotherboardDto {
  boardSeq += 1;
  return {
    id: `00000000-0000-4000-9000-${String(boardSeq).padStart(12, '0')}`,
    vendor: 'Vendor',
    model: `Board ${boardSeq}`,
    socket: 'SP5',
    formFactor: 'E-ATX',
    sockets: 1,
    dimmSlots: 12,
    maxMemoryGb: null,
    maxCpuTdpW: 500,
    pcieX16Slots: 4,
    mcioX8Ports: 0,
    features: [],
    status: 'AVAILABLE',
    availabilityWindow: null,
    isPlaceholder: false,
    note: null,
    sourceUrl: null,
    ...over,
  };
}

function product(
  slug: string,
  category: ProductCategory,
  numbers: Record<string, number>,
  compatibility: Array<[string, CompatibilityLevel]>,
  status: ProductStatus = 'AVAILABLE',
): ProductDetailDto {
  return {
    id: '00000000-0000-4000-a000-000000000000',
    slug,
    name: slug.toUpperCase(),
    brand: 'Brand',
    category,
    codename: null,
    headline: '',
    tagline: '',
    status,
    availabilityWindow: null,
    accentColor: '#ffffff',
    accentColorAlt: null,
    modelPreset: category === 'CPU' ? 'CPU_SP5' : category === 'MEMORY' ? 'RDIMM' : 'GPU_DUAL_SLOT',
    heroImage: null,
    sortOrder: 0,
    highlights: [],
    description: '',
    availabilityNote: null,
    specGroups: [
      {
        key: 'main',
        title: 'Main',
        specs: Object.entries(numbers).map(([key, numericValue]) => ({
          key,
          label: key,
          value: String(numericValue),
          numericValue,
          unit: null,
          highlight: false,
          compareDirection: 'NONE',
          note: null,
        })),
      },
    ],
    hotspots: [],
    models: [],
    compatibility: compatibility.map(([socket, level]) => ({
      socket,
      platformName: socket,
      level,
      notes: level === 'VALIDATING' ? 'Идёт валидация' : null,
    })),
  };
}

const turin = product('turin', 'CPU', { 'cpu.cores': 192, 'cpu.threads': 384, 'cpu.tdp': 500, 'cpu.socketConfigs': 2 }, [['SP5', 'SUPPORTED']]);
const venice = product('venice', 'CPU', { 'cpu.cores': 256, 'cpu.threads': 512, 'cpu.tdp': 600, 'cpu.socketConfigs': 2 }, [['SP7', 'SUPPORTED']]);
const monolith = product(
  'monolith',
  'MEMORY',
  { 'memory.capacity': 512, 'memory.power': 16 },
  [
    ['SP5', 'VALIDATING'],
    ['SP7', 'VALIDATING'],
  ],
  'PREVIEW',
);
const dimm96 = product('dimm96', 'MEMORY', { 'memory.capacity': 96, 'memory.power': 10 }, [['SP5', 'SUPPORTED']]);
const mind = product('mind', 'GPU', { 'gpu.vram': 96, 'gpu.tgp': 600, 'gpu.slotWidth': 2 }, [
  ['SP5', 'SUPPORTED'],
  ['SP7', 'SUPPORTED'],
]);

const catalog = new Map([turin, venice, monolith, dimm96, mind].map((p) => [p.slug, p]));

const h13ssl = board({ vendor: 'Supermicro', model: 'H13SSL-N', dimmSlots: 12, maxMemoryGb: 3072, maxCpuTdpW: 400, pcieX16Slots: 3 });
const h13dsh = board({ vendor: 'Supermicro', model: 'H13DSH', sockets: 2, dimmSlots: 24, maxMemoryGb: 6144, maxCpuTdpW: 400, pcieX16Slots: 2, mcioX8Ports: 10 });
const mz33 = board({ vendor: 'GIGABYTE', model: 'MZ33-AR1', dimmSlots: 24, maxCpuTdpW: 500, pcieX16Slots: 4 });
const turin2d = board({ vendor: 'ASRock Rack', model: 'TURIN2D24G', sockets: 2, dimmSlots: 24, maxCpuTdpW: 500, pcieX16Slots: 0, mcioX8Ports: 18 });
const sp5Boards = [h13ssl, h13dsh, mz33, turin2d];
const sp7Placeholder = board({ socket: 'SP7', model: 'SP7 · 2P (TBA)', sockets: 2, dimmSlots: 32, maxCpuTdpW: null, pcieX16Slots: null, mcioX8Ports: null, isPlaceholder: true, status: 'COMING_SOON' });

function run(payload: Partial<ConfigurationPayload>, over: Partial<EngineInput> = {}) {
  const full: ConfigurationPayload = {
    schemaVersion: 1,
    socket: 'SP5',
    motherboardId: null,
    cpu: { slug: 'turin', count: 1 },
    memory: { slug: 'dimm96', count: 12 },
    gpu: null,
    ...payload,
  };
  const platform = full.socket === 'SP7' ? SP7 : SP5;
  return evaluateConfiguration({
    payload: full,
    platform,
    boards: full.socket === 'SP7' ? [sp7Placeholder] : sp5Boards,
    products: catalog,
    locale: 'ru',
    ...over,
  });
}

const codes = (result: ReturnType<typeof run>) => result.issues.map((i) => i.code);

// ── Тесты ─────────────────────────────────────────────────────────────────────

describe('evaluateConfiguration', () => {
  it('сбалансированная сборка на SP5 валидна и без замечаний', () => {
    const result = run({});
    expect(result.valid).toBe(true);
    expect(result.orderable).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('нельзя поставить EPYC 9996 (SP7) на SP5 — с объяснением и подсказкой', () => {
    const result = run({ cpu: { slug: 'venice', count: 1 } });
    expect(result.valid).toBe(false);
    const issue = result.issues.find((i) => i.code === 'SOCKET_MISMATCH')!;
    expect(issue).toMatchObject({ severity: 'error', field: 'cpu' });
    expect(issue.message).toContain('требует сокет SP7');
    expect(issue.message).toContain('SP5');
    expect(issue.hint).toContain('SP7');
  });

  it('объяснения на английском для locale=en', () => {
    const result = run({ cpu: { slug: 'venice', count: 1 } }, { locale: 'en' });
    expect(result.issues[0]!.message).toBe('Brand VENICE requires socket SP7, but the SP5 platform is selected');
  });

  it('TDP процессора выше лимита платы — ошибка на плате и список подходящих плат', () => {
    const result = run({ motherboardId: h13ssl.id });
    const issue = result.issues.find((i) => i.code === 'CPU_TDP_EXCEEDS_BOARD')!;
    expect(issue).toMatchObject({ severity: 'error', field: 'motherboard' });
    expect(issue.message).toContain('до 400 Вт');
    expect(issue.message).toContain('500 Вт');
    expect(issue.hint).toContain('GIGABYTE MZ33-AR1');
    expect(issue.hint).not.toContain('H13');
  });

  it('два процессора на односокетной плате — ошибка', () => {
    const result = run({ motherboardId: mz33.id, cpu: { slug: 'turin', count: 2 }, memory: { slug: 'dimm96', count: 24 } });
    expect(codes(result)).toContain('SOCKET_COUNT_EXCEEDED');
    expect(result.valid).toBe(false);
  });

  it('один процессор на двухсокетной плате — предупреждение и половина слотов', () => {
    const result = run({ motherboardId: turin2d.id, memory: { slug: 'dimm96', count: 12 } });
    expect(result.valid).toBe(true);
    expect(codes(result)).toContain('SOCKETS_UNDERPOPULATED');
    expect(result.limits.memorySlots).toBe(12);
  });

  it('модулей больше, чем слотов — ошибка', () => {
    const result = run({ memory: { slug: 'dimm96', count: 25 } });
    expect(result.issues.find((i) => i.code === 'MEMORY_SLOTS_EXCEEDED')?.message).toContain('25');
    expect(result.valid).toBe(false);
  });

  it('не все каналы заняты — предупреждение о пропускной способности', () => {
    const result = run({ memory: { slug: 'dimm96', count: 8 } });
    expect(result.valid).toBe(true);
    expect(result.issues[0]).toMatchObject({ code: 'MEMORY_UNBALANCED', severity: 'warning' });
    expect(result.issues[0]!.hint).toContain('12');
  });

  it('число модулей не кратно каналам — подсказка со сбалансированными вариантами', () => {
    const result = run({ memory: { slug: 'dimm96', count: 18 } });
    expect(result.issues[0]!.hint).toBe('Сбалансированно: 12 или 24');
  });

  it('модуль 512 ГБ не встаёт в плату с лимитом 256 ГБ на слот', () => {
    const result = run({ motherboardId: h13dsh.id, cpu: { slug: 'turin', count: 2 }, memory: { slug: 'monolith', count: 24 } });
    const issue = result.issues.find((i) => i.code === 'MEMORY_CAPACITY_EXCEEDS_BOARD')!;
    expect(issue.message).toContain('256 ГБ');
    expect(issue.message).toContain('512 ГБ');
  });

  it('превью-память: валидация идёт, заказать нельзя — только информация', () => {
    const result = run({ memory: { slug: 'monolith', count: 12 } });
    expect(result.valid).toBe(true);
    expect(result.orderable).toBe(false);
    expect(codes(result)).toEqual(['MEMORY_NOT_VALIDATED', 'PRODUCT_NOT_ORDERABLE']);
    expect(result.issues[0]!.hint).toBe('Идёт валидация');
  });

  it('без памяти — предупреждение', () => {
    expect(codes(run({ memory: null }))).toEqual(['MEMORY_MISSING']);
  });

  it('видеокарт больше, чем слотов x16 платы (MCIO считаются парами)', () => {
    expect(computeLimits(SP5, h13dsh, 2).gpuSlots).toBe(7);
    const result = run({ motherboardId: h13ssl.id, cpu: { slug: 'turin', count: 1 }, gpu: { slug: 'mind', count: 4 } });
    expect(result.issues.find((i) => i.code === 'PCIE_SLOTS_EXCEEDED')?.message).toContain('3');
  });

  it('без платы слоты GPU считаются по линиям платформы с резервом', () => {
    expect(computeLimits(SP5, null, 1).gpuSlots).toBe(6);
    expect(computeLimits(SP5, null, 2).gpuSlots).toBe(8);
    expect(codes(run({ gpu: { slug: 'mind', count: 7 } }))).toContain('PCIE_SLOTS_EXCEEDED');
  });

  it('SP7: платформа ожидается, плата-плейсхолдер — проверка по лимитам платформы', () => {
    const result = run({
      socket: 'SP7',
      motherboardId: sp7Placeholder.id,
      cpu: { slug: 'venice', count: 2 },
      memory: { slug: 'monolith', count: 32 },
      gpu: { slug: 'mind', count: 8 },
    });
    expect(result.valid).toBe(true);
    expect(codes(result)).toEqual(['MEMORY_NOT_VALIDATED', 'PLATFORM_NOT_AVAILABLE', 'BOARD_SPECS_PENDING', 'PRODUCT_NOT_ORDERABLE']);
    expect(result.limits).toMatchObject({ sockets: 2, memorySlots: 32, gpuSlots: 8, cpuTdpW: 600 });
  });

  it('неизвестный slug и продукт не той категории', () => {
    expect(run({ cpu: { slug: 'nope', count: 1 } }).issues[0]).toMatchObject({ code: 'UNKNOWN_PRODUCT', field: 'cpu' });
    expect(run({ gpu: { slug: 'turin', count: 1 } }).issues[0]).toMatchObject({ code: 'UNKNOWN_PRODUCT', field: 'gpu' });
  });

  it('плата другой платформы', () => {
    expect(codes(run({ motherboardId: sp7Placeholder.id }))).toContain('UNKNOWN_MOTHERBOARD');
  });

  it('итоги: ядра, память, VRAM и мощность с запасом', () => {
    const result = run({
      socket: 'SP7',
      cpu: { slug: 'venice', count: 2 },
      memory: { slug: 'monolith', count: 32 },
      gpu: { slug: 'mind', count: 4 },
    });
    expect(result.totals).toEqual({
      cores: 512,
      threads: 1024,
      memoryGb: 16_384,
      vramGb: 384,
      cpuPowerW: 1200,
      memoryPowerW: 512,
      gpuPowerW: 2400,
      // 150 Вт база + 10 % от 3600 Вт на охлаждение
      platformOverheadW: 510,
      totalPowerW: 4622,
      recommendedPsuW: 5800,
    });
  });
});

describe('shareCodeFor', () => {
  const payload: ConfigurationPayload = {
    schemaVersion: 1,
    socket: 'SP5',
    motherboardId: null,
    cpu: { slug: 'turin', count: 1 },
    memory: { slug: 'dimm96', count: 12 },
    gpu: null,
  };

  it('стабилен и не зависит от порядка ключей', () => {
    const reordered = { gpu: null, memory: { count: 12, slug: 'dimm96' }, cpu: { count: 1, slug: 'turin' }, motherboardId: null, socket: 'SP5', schemaVersion: 1 } as const;
    expect(shareCodeFor(payload)).toBe(shareCodeFor(reordered));
    expect(shareCodeFor(payload)).toMatch(/^[a-hjkmnp-z2-9]{10}$/);
  });

  it('разные сборки и разная соль — разные коды', () => {
    expect(shareCodeFor(payload)).not.toBe(shareCodeFor({ ...payload, gpu: { slug: 'mind', count: 1 } }));
    expect(shareCodeFor(payload, 1)).not.toBe(shareCodeFor(payload));
  });
});
