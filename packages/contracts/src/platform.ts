import { z } from 'zod';
import { CompatibilityLevel, ProductStatus } from './enums';

export const PlatformDto = z.object({
  id: z.uuid(),
  /** 'SP5', 'SP7', … — строка, а не enum: новые платформы добавляются из админки без миграции */
  socket: z.string(),
  name: z.string(),
  cpuFamily: z.string(),
  memoryChannels: z.number().int(),
  /** null — ещё не объявлено производителем */
  dimmsPerChannel: z.number().int().nullable(),
  maxMemorySpeedMts: z.number().int(),
  maxMrdimmSpeedMts: z.number().int().nullable(),
  pcieGen: z.number().int(),
  pcieLanes1P: z.number().int(),
  pcieLanes2P: z.number().int().nullable(),
  cxlVersion: z.string().nullable(),
  maxSockets: z.number().int(),
  maxCpuTdpW: z.number().int(),
  status: ProductStatus,
  availabilityWindow: z.string().nullable(),
  availabilityNote: z.string().nullable(),
});
export type PlatformDto = z.infer<typeof PlatformDto>;

export const MotherboardDto = z.object({
  id: z.uuid(),
  vendor: z.string(),
  model: z.string(),
  socket: z.string(),
  formFactor: z.string(),
  sockets: z.number().int().min(1).max(2),
  dimmSlots: z.number().int(),
  /** Максимальный объём памяти по спецификации платы; null — не указан */
  maxMemoryGb: z.number().int().nullable(),
  /** Максимальный TDP процессора на сокет; null — не указан */
  maxCpuTdpW: z.number().int().nullable(),
  pcieX16Slots: z.number().int().nullable(),
  /** Разъёмы MCIO x8: два таких через кабельный райзер дают один x16 */
  mcioX8Ports: z.number().int().nullable(),
  features: z.array(z.string()),
  status: ProductStatus,
  availabilityWindow: z.string().nullable(),
  /** Плейсхолдер будущей платы: движок проверяет только лимиты платформы */
  isPlaceholder: z.boolean(),
  note: z.string().nullable(),
  sourceUrl: z.url().nullable(),
});
export type MotherboardDto = z.infer<typeof MotherboardDto>;

export const CompatibilityDto = z.object({
  socket: z.string(),
  platformName: z.string(),
  level: CompatibilityLevel,
  notes: z.string().nullable(),
});
export type CompatibilityDto = z.infer<typeof CompatibilityDto>;

export const PlatformListResponse = z.object({ items: z.array(PlatformDto) });
export const MotherboardListResponse = z.object({ items: z.array(MotherboardDto) });
