import { z } from 'zod';
import type { CompareDirection, ProductCategory } from './enums';

/**
 * Каноничные единицы для Spec.numericValue. Сравнение и счётчики работают только с ними,
 * а человекочитаемая строка лежит в Spec.value.
 */
export const UNITS = {
  count: { ru: '', en: '' },
  GHz: { ru: 'ГГц', en: 'GHz' },
  MB: { ru: 'МБ', en: 'MB' },
  GB: { ru: 'ГБ', en: 'GB' },
  TB: { ru: 'ТБ', en: 'TB' },
  'GB/s': { ru: 'ГБ/с', en: 'GB/s' },
  'MT/s': { ru: 'МТ/с', en: 'MT/s' },
  W: { ru: 'Вт', en: 'W' },
  nm: { ru: 'нм', en: 'nm' },
  bit: { ru: 'бит', en: 'bit' },
  TFLOPS: { ru: 'TFLOPS', en: 'TFLOPS' },
  TOPS: { ru: 'TOPS', en: 'TOPS' },
  billion: { ru: 'млрд', en: 'B' },
  percent: { ru: '%', en: '%' },
  times: { ru: '×', en: '×' },
  lanes: { ru: 'линий', en: 'lanes' },
  slots: { ru: 'слота', en: 'slots' },
  version: { ru: '', en: '' },
} as const;
export type Unit = keyof typeof UNITS;

export type SpecKeyMeta = {
  category: ProductCategory;
  unit?: Unit;
  /** Направление по умолчанию; в БД хранится своё значение (Spec.compareDirection), его можно менять в админке */
  direction: CompareDirection;
};

const H = 'HIGHER_BETTER' as const;
const L = 'LOWER_BETTER' as const;
const N = 'NONE' as const;

/**
 * Реестр известных ключей характеристик. По ключу сравнение (/compare) сопоставляет строки
 * разных продуктов, а движок конфигуратора достаёт числа (см. ENGINE_SPEC_KEYS).
 * Из админки можно добавить и произвольный ключ — тогда он просто не участвует в движке.
 */
export const SPEC_KEYS = {
  // ── CPU ──────────────────────────────────────────────
  'cpu.architecture': { category: 'CPU', direction: N },
  'cpu.series': { category: 'CPU', direction: N },
  'cpu.cores': { category: 'CPU', unit: 'count', direction: H },
  'cpu.threads': { category: 'CPU', unit: 'count', direction: H },
  'cpu.ccdLayout': { category: 'CPU', unit: 'count', direction: N },
  'cpu.baseClock': { category: 'CPU', unit: 'GHz', direction: H },
  'cpu.allCoreBoost': { category: 'CPU', unit: 'GHz', direction: H },
  'cpu.maxBoost': { category: 'CPU', unit: 'GHz', direction: H },
  'cpu.l1Cache': { category: 'CPU', unit: 'MB', direction: H },
  'cpu.l2Cache': { category: 'CPU', unit: 'MB', direction: H },
  'cpu.l3Cache': { category: 'CPU', unit: 'MB', direction: H },
  'cpu.l3PerCcd': { category: 'CPU', unit: 'MB', direction: H },
  'cpu.memChannels': { category: 'CPU', unit: 'count', direction: H },
  'cpu.memType': { category: 'CPU', direction: N },
  'cpu.memSpeed': { category: 'CPU', unit: 'MT/s', direction: H },
  'cpu.memSpeedMrdimm': { category: 'CPU', unit: 'MT/s', direction: H },
  'cpu.memBandwidth': { category: 'CPU', unit: 'GB/s', direction: H },
  'cpu.tdp': { category: 'CPU', unit: 'W', direction: L },
  'cpu.ctdp': { category: 'CPU', unit: 'W', direction: N },
  'cpu.socket': { category: 'CPU', direction: N },
  'cpu.socketConfigs': { category: 'CPU', unit: 'count', direction: N },
  'cpu.pcieGen': { category: 'CPU', unit: 'version', direction: H },
  'cpu.pcieLanes': { category: 'CPU', unit: 'lanes', direction: H },
  'cpu.cxl': { category: 'CPU', unit: 'version', direction: H },
  'cpu.process': { category: 'CPU', unit: 'nm', direction: L },
  'cpu.ioDies': { category: 'CPU', unit: 'count', direction: N },
  'cpu.transistors': { category: 'CPU', unit: 'billion', direction: N },

  // ── Память ───────────────────────────────────────────
  'memory.capacity': { category: 'MEMORY', unit: 'GB', direction: H },
  'memory.type': { category: 'MEMORY', direction: N },
  'memory.ecc': { category: 'MEMORY', direction: N },
  'memory.formFactor': { category: 'MEMORY', direction: N },
  'memory.stacking': { category: 'MEMORY', direction: N },
  'memory.speed': { category: 'MEMORY', unit: 'MT/s', direction: H },
  'memory.perfUplift': { category: 'MEMORY', unit: 'times', direction: H },
  'memory.power': { category: 'MEMORY', unit: 'W', direction: L },
  'memory.powerBaseline': { category: 'MEMORY', unit: 'W', direction: N },
  'memory.powerSaving': { category: 'MEMORY', unit: 'percent', direction: H },
  'memory.maxSystemCapacity': { category: 'MEMORY', unit: 'TB', direction: H },
  'memory.validation': { category: 'MEMORY', direction: N },

  // ── GPU ──────────────────────────────────────────────
  'gpu.architecture': { category: 'GPU', direction: N },
  'gpu.cudaCores': { category: 'GPU', unit: 'count', direction: H },
  'gpu.tensorCores': { category: 'GPU', unit: 'count', direction: H },
  'gpu.rtCores': { category: 'GPU', unit: 'count', direction: H },
  'gpu.fp32': { category: 'GPU', unit: 'TFLOPS', direction: H },
  'gpu.aiTops': { category: 'GPU', unit: 'TOPS', direction: H },
  'gpu.vram': { category: 'GPU', unit: 'GB', direction: H },
  'gpu.memoryType': { category: 'GPU', direction: N },
  'gpu.memoryBus': { category: 'GPU', unit: 'bit', direction: H },
  'gpu.memoryBandwidth': { category: 'GPU', unit: 'GB/s', direction: H },
  'gpu.tgp': { category: 'GPU', unit: 'W', direction: L },
  'gpu.interface': { category: 'GPU', unit: 'version', direction: H },
  'gpu.displayOutputs': { category: 'GPU', unit: 'count', direction: N },
  'gpu.slotWidth': { category: 'GPU', unit: 'slots', direction: L },
  'gpu.die': { category: 'GPU', direction: N },
  'gpu.process': { category: 'GPU', unit: 'nm', direction: L },
  'gpu.transistors': { category: 'GPU', unit: 'billion', direction: N },
  'gpu.editions': { category: 'GPU', direction: N },
  'gpu.mig': { category: 'GPU', unit: 'count', direction: H },
} as const satisfies Record<string, SpecKeyMeta>;

export type SpecKey = keyof typeof SPEC_KEYS;
export const SpecKey = z.enum(Object.keys(SPEC_KEYS) as [SpecKey, ...SpecKey[]]);

/** Метаданные ключа в общем виде (у части ключей нет unit — литеральные типы SPEC_KEYS это скрывают). */
export function specKeyMeta(key: SpecKey): SpecKeyMeta {
  return SPEC_KEYS[key];
}

/**
 * Числовые характеристики, без которых движок конфигуратора не посчитает итоги.
 * Тест @apex/collection проверяет, что у каждого продукта категории они есть.
 */
export const ENGINE_SPEC_KEYS = {
  CPU: ['cpu.cores', 'cpu.threads', 'cpu.tdp', 'cpu.socketConfigs'],
  MEMORY: ['memory.capacity', 'memory.power'],
  GPU: ['gpu.vram', 'gpu.tgp', 'gpu.slotWidth'],
  MOTHERBOARD: [],
} as const satisfies Record<ProductCategory, readonly SpecKey[]>;

/** Ключи групп характеристик (иконки и порядок вкладок на странице продукта). */
export const SpecGroupKey = z.enum([
  'compute',
  'cache',
  'memory',
  'performance',
  'power',
  'io',
  'silicon',
  'module',
  'technology',
  'scale',
  'platform',
]);
export type SpecGroupKey = z.infer<typeof SpecGroupKey>;
