import {
  ConfigurationPayload,
  ConfigurationTotals,
  DEFAULT_LOCALE,
  type CreateConfigurationResponse,
  type Locale,
  type MotherboardDto,
  type PlatformDto,
  type ProductDetailDto,
  type SavedConfigurationDto,
  type ValidateConfigurationResponse,
} from '@apex/contracts';
import { DomainError } from '../errors';
import { evaluateConfiguration } from './engine';

/** Чтение каталога на уровне DTO — подходит и сервис каталога, и его кэширующая обёртка в API. */
export type CatalogReader = {
  getProduct(slug: string, locale: Locale): Promise<ProductDetailDto>;
  listPlatforms(locale: Locale): Promise<{ items: PlatformDto[] }>;
  listMotherboards(socket: string, locale: Locale): Promise<{ items: MotherboardDto[] }>;
};

export type ConfigurationRecord = {
  shareCode: string;
  /** JSON из БД — перед отдачей проверяется схемой */
  payload: unknown;
  totals: unknown;
  createdAt: Date;
};

/** Хранилище сохранённых сборок: в API — Prisma, в моках — Map. */
export interface ConfigurationStore {
  find(shareCode: string): Promise<ConfigurationRecord | null>;
  /** false — код уже занят */
  insert(record: ConfigurationRecord): Promise<boolean>;
}

const SHARE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** Поля в фиксированном порядке: одинаковая сборка → одинаковая строка → одинаковый код. */
function canonical(payload: ConfigurationPayload): string {
  const pick = (s: { slug: string; count: number } | null) => (s ? { slug: s.slug, count: s.count } : null);
  return JSON.stringify({
    schemaVersion: payload.schemaVersion,
    socket: payload.socket,
    motherboardId: payload.motherboardId,
    cpu: pick(payload.cpu),
    memory: pick(payload.memory),
    gpu: pick(payload.gpu),
  });
}

/** cyrb53 — быстрый 53-битный хеш строки. Не криптографический: код сборки не секрет, важна лишь стабильность. */
function cyrb53(text: string, seed: number): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * Код сборки — 10 цифр хеша канонического JSON в 31-символьном алфавите (31^10 < 2^53).
 * Одна и та же сборка всегда получает одну ссылку, а повторное сохранение ничего не дублирует.
 */
export function shareCodeFor(payload: ConfigurationPayload, salt = 0): string {
  let n = cyrb53(canonical(payload), salt);
  let code = '';
  for (let i = 0; i < 10; i++) {
    code += SHARE_ALPHABET.charAt(n % SHARE_ALPHABET.length);
    n = Math.floor(n / SHARE_ALPHABET.length);
  }
  return code;
}

export function createConfiguratorService({ catalog, store }: { catalog: CatalogReader; store: ConfigurationStore }) {
  async function validate(payload: ConfigurationPayload, locale: Locale): Promise<ValidateConfigurationResponse> {
    const platform = (await catalog.listPlatforms(locale)).items.find((p) => p.socket === payload.socket);
    if (!platform) {
      throw new DomainError('PLATFORM_NOT_FOUND', `Платформа ${payload.socket} не найдена`, { socket: payload.socket });
    }
    const { items: boards } = await catalog.listMotherboards(payload.socket, locale);

    const slugs = [...new Set([payload.cpu.slug, payload.memory?.slug, payload.gpu?.slug].filter((s): s is string => !!s))];
    const products = new Map<string, ProductDetailDto>();
    await Promise.all(
      slugs.map(async (slug) => {
        try {
          products.set(slug, await catalog.getProduct(slug, locale));
        } catch (error) {
          // Неизвестный продукт — не ошибка запроса, а проблема сборки с объяснением
          if (!(error instanceof DomainError && error.code === 'PRODUCT_NOT_FOUND')) throw error;
        }
      }),
    );

    return evaluateConfiguration({ payload, platform, boards, products, locale });
  }

  return {
    validate,

    /** Сохраняет только совместимую сборку; повторное сохранение той же сборки возвращает тот же код. */
    async save(payload: ConfigurationPayload): Promise<CreateConfigurationResponse> {
      const result = await validate(payload, DEFAULT_LOCALE);
      if (!result.valid) {
        throw new DomainError('CONFIGURATION_INVALID', 'Сборка несовместима — сохранить её нельзя', {
          issues: result.issues.filter((i) => i.severity === 'error'),
        });
      }

      const serialized = canonical(payload);
      // Коллизия хеша маловероятна, но на этот случай есть код с «солью»
      for (let salt = 0; salt < 3; salt++) {
        const shareCode = shareCodeFor(payload, salt);
        const existing = await store.find(shareCode);
        if (existing) {
          const same = ConfigurationPayload.safeParse(existing.payload);
          if (same.success && canonical(same.data) === serialized) return { shareCode };
          continue;
        }
        if (await store.insert({ shareCode, payload, totals: result.totals, createdAt: new Date() })) return { shareCode };
      }
      throw new Error('Не удалось подобрать свободный код сборки');
    },

    async load(shareCode: string): Promise<SavedConfigurationDto> {
      const record = await store.find(shareCode);
      if (!record) throw new DomainError('CONFIGURATION_NOT_FOUND', `Сборка «${shareCode}» не найдена`, { shareCode });
      return {
        shareCode: record.shareCode,
        payload: ConfigurationPayload.parse(record.payload),
        totals: ConfigurationTotals.parse(record.totals),
        createdAt: record.createdAt.toISOString(),
      };
    },
  };
}

export type ConfiguratorService = ReturnType<typeof createConfiguratorService>;
