import { z } from 'zod';
import { Slug } from './common';

const selection = (maxCount: number) =>
  z.object({
    slug: Slug,
    count: z.number().int().min(1).max(maxCount),
  });

/** Состояние конфигуратора. Хранится в Configuration.payload и шарится по shareCode. */
export const ConfigurationPayload = z.object({
  schemaVersion: z.literal(1),
  socket: z.string(),
  motherboardId: z.uuid().nullable(),
  /** count = число сокетов (1P / 2P) */
  cpu: selection(2),
  memory: selection(64).nullable(),
  gpu: selection(16).nullable(),
});
export type ConfigurationPayload = z.infer<typeof ConfigurationPayload>;

export const ConfigurationTotals = z.object({
  cores: z.number().int(),
  threads: z.number().int(),
  memoryGb: z.number(),
  vramGb: z.number(),
  cpuPowerW: z.number(),
  memoryPowerW: z.number(),
  gpuPowerW: z.number(),
  /** Плата, накопители, вентиляторы — оценка */
  platformOverheadW: z.number(),
  totalPowerW: z.number(),
  /** Рекомендованный блок питания с запасом */
  recommendedPsuW: z.number(),
});
export type ConfigurationTotals = z.infer<typeof ConfigurationTotals>;

export const ValidationIssueCode = z.enum([
  'UNKNOWN_PRODUCT',
  'SOCKET_MISMATCH',
  'SOCKET_COUNT_EXCEEDED',
  'CPU_TDP_EXCEEDS_BOARD',
  'MEMORY_SLOTS_EXCEEDED',
  'MEMORY_CAPACITY_EXCEEDS_BOARD',
  'MEMORY_UNBALANCED',
  'MEMORY_NOT_VALIDATED',
  'PCIE_SLOTS_EXCEEDED',
  'PLATFORM_NOT_AVAILABLE',
  'BOARD_SPECS_PENDING',
  'PRODUCT_NOT_ORDERABLE',
]);
export type ValidationIssueCode = z.infer<typeof ValidationIssueCode>;

export const ValidationIssue = z.object({
  code: ValidationIssueCode,
  /** error — сборка невозможна; warning — возможна с оговорками; info — к сведению */
  severity: z.enum(['error', 'warning', 'info']),
  field: z.enum(['socket', 'motherboard', 'cpu', 'memory', 'gpu']),
  /** Человеческое объяснение: «EPYC 9996 требует сокет SP7, а выбрана платформа SP5» */
  message: z.string(),
  hint: z.string().optional(),
});
export type ValidationIssue = z.infer<typeof ValidationIssue>;

export const ValidateConfigurationResponse = z.object({
  valid: z.boolean(),
  /** false, если в сборке есть PREVIEW-продукт: доступен только запрос информации */
  orderable: z.boolean(),
  issues: z.array(ValidationIssue),
  totals: ConfigurationTotals,
});
export type ValidateConfigurationResponse = z.infer<typeof ValidateConfigurationResponse>;

export const CreateConfigurationResponse = z.object({
  shareCode: z.string(),
});
export type CreateConfigurationResponse = z.infer<typeof CreateConfigurationResponse>;

export const SavedConfigurationDto = z.object({
  shareCode: z.string(),
  payload: ConfigurationPayload,
  totals: ConfigurationTotals,
  createdAt: z.iso.datetime(),
});
export type SavedConfigurationDto = z.infer<typeof SavedConfigurationDto>;
