import { z } from 'zod';
import { Slug } from './common';

const selection = (maxCount: number) =>
  z.object({
    slug: Slug,
    count: z.number().int().min(1).max(maxCount),
  });

/** Короткий код сохранённой сборки: /configurator?c=k7m2p9xq4t. Без 0/o/1/l/i — чтобы не путать при диктовке. */
export const ShareCode = z.string().regex(/^[a-hjkmnp-z2-9]{10}$/, 'Код сборки: 10 символов');
export type ShareCode = z.infer<typeof ShareCode>;

/** Состояние конфигуратора. Хранится в Configuration.payload и шарится по shareCode. */
export const ConfigurationPayload = z
  .object({
    schemaVersion: z.literal(1),
    socket: z.string().regex(/^[A-Z0-9]{2,16}$/, 'Сокет: SP5, SP7, …'),
    /** null — «любая подходящая плата»: движок проверяет лимиты платформы */
    motherboardId: z.uuid().nullable(),
    /** count = число сокетов (1P / 2P) */
    cpu: selection(2),
    memory: selection(64).nullable(),
    gpu: selection(16).nullable(),
  })
  .meta({ id: 'ConfigurationPayload' });
export type ConfigurationPayload = z.infer<typeof ConfigurationPayload>;

export const ConfigurationTotals = z
  .object({
    cores: z.number().int(),
    threads: z.number().int(),
    memoryGb: z.number(),
    vramGb: z.number(),
    cpuPowerW: z.number(),
    memoryPowerW: z.number(),
    gpuPowerW: z.number(),
    /** Плата, накопители, сеть, вентиляторы — оценка */
    platformOverheadW: z.number(),
    totalPowerW: z.number(),
    /** Рекомендованный блок питания с запасом */
    recommendedPsuW: z.number(),
  })
  .meta({ id: 'ConfigurationTotals' });
export type ConfigurationTotals = z.infer<typeof ConfigurationTotals>;

/**
 * Лимиты выбранной платформы/платы при текущем числе процессоров —
 * по ним интерфейс ограничивает счётчики и пишет «12 из 24 слотов».
 */
export const ConfigurationLimits = z
  .object({
    sockets: z.number().int(),
    memorySlots: z.number().int(),
    /** Число модулей на процессор, при котором заняты все каналы памяти */
    memoryChannels: z.number().int(),
    gpuSlots: z.number().int(),
    /** Максимальный TDP процессора; null — не указан */
    cpuTdpW: z.number().int().nullable(),
    /** Максимальная ёмкость модуля на слот; null — не указана */
    memoryPerSlotGb: z.number().int().nullable(),
  })
  .meta({ id: 'ConfigurationLimits' });
export type ConfigurationLimits = z.infer<typeof ConfigurationLimits>;

export const ValidationIssueCode = z.enum([
  'UNKNOWN_PRODUCT',
  'UNKNOWN_MOTHERBOARD',
  'SOCKET_MISMATCH',
  'SOCKET_COUNT_EXCEEDED',
  'SOCKETS_UNDERPOPULATED',
  'CPU_TDP_EXCEEDS_BOARD',
  'MEMORY_MISSING',
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

export const IssueSeverity = z.enum(['error', 'warning', 'info']);
export type IssueSeverity = z.infer<typeof IssueSeverity>;

export const ConfigurationField = z.enum(['socket', 'motherboard', 'cpu', 'memory', 'gpu']);
export type ConfigurationField = z.infer<typeof ConfigurationField>;

export const ValidationIssue = z
  .object({
    code: ValidationIssueCode,
    /** error — сборка невозможна; warning — возможна с оговорками; info — к сведению */
    severity: IssueSeverity,
    field: ConfigurationField,
    /** Человеческое объяснение: «EPYC 9996 требует сокет SP7, а выбрана платформа SP5» */
    message: z.string(),
    /** Как исправить: «Выберите платформу SP7 или EPYC 9965» */
    hint: z.string().optional(),
  })
  .meta({ id: 'ValidationIssue' });
export type ValidationIssue = z.infer<typeof ValidationIssue>;

export const ValidateConfigurationResponse = z
  .object({
    valid: z.boolean(),
    /** false, если в сборке есть PREVIEW-продукт: доступен только запрос информации */
    orderable: z.boolean(),
    issues: z.array(ValidationIssue),
    totals: ConfigurationTotals,
    limits: ConfigurationLimits,
  })
  .meta({ id: 'ValidateConfigurationResponse' });
export type ValidateConfigurationResponse = z.infer<typeof ValidateConfigurationResponse>;

export const CreateConfigurationResponse = z
  .object({
    shareCode: ShareCode,
  })
  .meta({ id: 'CreateConfigurationResponse' });
export type CreateConfigurationResponse = z.infer<typeof CreateConfigurationResponse>;

export const SavedConfigurationDto = z
  .object({
    shareCode: ShareCode,
    payload: ConfigurationPayload,
    totals: ConfigurationTotals,
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'SavedConfiguration' });
export type SavedConfigurationDto = z.infer<typeof SavedConfigurationDto>;
