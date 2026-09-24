import type {
  ConfigurationPayload,
  Locale,
  MotherboardDto,
  PlatformDto,
  ProductCategory,
  ProductDetailDto,
  ValidateConfigurationResponse,
} from '@apex/contracts';
import { computeLimits, evaluateConfiguration } from '@apex/domain/engine';

/*
 * Состояние конфигуратора — чистые функции над ConfigurationPayload.
 * Движок совместимости тот же, что в API (@apex/domain/engine, без Zod в бандле):
 * интерфейс пересчитывает сборку мгновенно, а сервер повторяет проверку при сохранении.
 */

export type ConfiguratorCatalog = {
  platforms: PlatformDto[];
  /** Платы по сокету */
  boards: Record<string, MotherboardDto[]>;
  /** Процессоры, память и видеокарты коллекции */
  products: ProductDetailDto[];
};

export const productsOf = (catalog: ConfiguratorCatalog, category: ProductCategory) =>
  catalog.products.filter((p) => p.category === category);

export const supportsSocket = (product: ProductDetailDto, socket: string) => product.compatibility.some((c) => c.socket === socket);

export const platformOf = (catalog: ConfiguratorCatalog, socket: string) =>
  catalog.platforms.find((p) => p.socket === socket) ?? catalog.platforms[0]!;

export const boardOf = (catalog: ConfiguratorCatalog, payload: ConfigurationPayload) =>
  (catalog.boards[payload.socket] ?? []).find((b) => b.id === payload.motherboardId) ?? null;

export function limitsOf(catalog: ConfiguratorCatalog, payload: ConfigurationPayload) {
  return computeLimits(platformOf(catalog, payload.socket), boardOf(catalog, payload), payload.cpu.count);
}

/** Счётчики не выходят за лимиты платы/платформы: 0 модулей или карт — позиция не выбрана. */
export function clampToLimits(catalog: ConfiguratorCatalog, payload: ConfigurationPayload): ConfigurationPayload {
  const board = boardOf(catalog, payload);
  const cpuCount = Math.min(payload.cpu.count, board?.sockets ?? platformOf(catalog, payload.socket).maxSockets);
  const next = { ...payload, cpu: { ...payload.cpu, count: cpuCount } };
  const limits = limitsOf(catalog, next);
  const memoryCount = Math.min(payload.memory?.count ?? 0, limits.memorySlots);
  const gpuCount = Math.min(payload.gpu?.count ?? 0, limits.gpuSlots);
  return {
    ...next,
    memory: payload.memory && memoryCount > 0 ? { ...payload.memory, count: memoryCount } : null,
    gpu: payload.gpu && gpuCount > 0 ? { ...payload.gpu, count: gpuCount } : null,
  };
}

/** Флагманская сборка при первом открытии: первый процессор коллекции, все каналы памяти заняты, две карты. */
export function defaultPayload(catalog: ConfiguratorCatalog): ConfigurationPayload {
  const cpu = productsOf(catalog, 'CPU')[0]!;
  const platform = platformOf(catalog, cpu.compatibility[0]?.socket ?? catalog.platforms[0]!.socket);
  const memory = productsOf(catalog, 'MEMORY').find((m) => supportsSocket(m, platform.socket));
  const gpu = productsOf(catalog, 'GPU').find((g) => supportsSocket(g, platform.socket));
  return clampToLimits(catalog, {
    schemaVersion: 1,
    socket: platform.socket,
    motherboardId: null,
    cpu: { slug: cpu.slug, count: 1 },
    memory: memory ? { slug: memory.slug, count: platform.memoryChannels } : null,
    gpu: gpu ? { slug: gpu.slug, count: 2 } : null,
  });
}

/**
 * Смена платформы: процессор другого сокета заменяется первым совместимым,
 * плата сбрасывается на «любую подходящую», память — по модулю в каждый канал новой платформы,
 * остальные счётчики — в пределах её лимитов.
 */
export function changeSocket(catalog: ConfiguratorCatalog, payload: ConfigurationPayload, socket: string): ConfigurationPayload {
  const current = catalog.products.find((p) => p.slug === payload.cpu.slug);
  const cpu = current && supportsSocket(current, socket) ? current : productsOf(catalog, 'CPU').find((c) => supportsSocket(c, socket));
  const channels = platformOf(catalog, socket).memoryChannels * payload.cpu.count;
  return clampToLimits(catalog, {
    ...payload,
    socket,
    motherboardId: null,
    cpu: { slug: cpu?.slug ?? payload.cpu.slug, count: payload.cpu.count },
    memory: payload.memory ? { ...payload.memory, count: channels } : null,
  });
}

export function changeBoard(catalog: ConfiguratorCatalog, payload: ConfigurationPayload, motherboardId: string | null) {
  return clampToLimits(catalog, { ...payload, motherboardId });
}

export function changeCpu(catalog: ConfiguratorCatalog, payload: ConfigurationPayload, cpu: { slug?: string; count?: number }) {
  return clampToLimits(catalog, { ...payload, cpu: { slug: cpu.slug ?? payload.cpu.slug, count: cpu.count ?? payload.cpu.count } });
}

export function changeMemory(catalog: ConfiguratorCatalog, payload: ConfigurationPayload, slug: string, count: number) {
  return clampToLimits(catalog, { ...payload, memory: count > 0 ? { slug, count } : null });
}

export function changeGpu(catalog: ConfiguratorCatalog, payload: ConfigurationPayload, slug: string, count: number) {
  return clampToLimits(catalog, { ...payload, gpu: count > 0 ? { slug, count } : null });
}

export function evaluate(catalog: ConfiguratorCatalog, payload: ConfigurationPayload, locale: Locale): ValidateConfigurationResponse {
  const products = new Map(catalog.products.map((p) => [p.slug, p]));
  return evaluateConfiguration({
    payload,
    platform: platformOf(catalog, payload.socket),
    boards: catalog.boards[payload.socket] ?? [],
    products,
    locale,
  });
}

/**
 * Что будет со сборкой на каждой плате: ошибки движка — причина, почему плата не подходит.
 * Счётчики при этом подрезаются под плату, как при реальном выборе.
 */
export function boardOptions(catalog: ConfiguratorCatalog, payload: ConfigurationPayload, locale: Locale) {
  return (catalog.boards[payload.socket] ?? []).map((board) => {
    const candidate = changeBoard(catalog, payload, board.id);
    const errors = evaluate(catalog, candidate, locale).issues.filter((i) => i.severity === 'error');
    return { board, fits: errors.length === 0, reason: errors[0]?.message ?? null };
  });
}

/** Сбалансированные количества модулей: все каналы, затем 2 модуля на канал. */
export function balancedMemoryCounts(catalog: ConfiguratorCatalog, payload: ConfigurationPayload): number[] {
  const limits = limitsOf(catalog, payload);
  const channels = limits.memoryChannels * Math.min(payload.cpu.count, limits.sockets);
  return [channels, channels * 2].filter((n) => n <= limits.memorySlots);
}

/** Ключ сборки без учёта порядка полей — сравнить текущую сборку с сохранённой. */
export function payloadKey(payload: ConfigurationPayload): string {
  const pick = (s: { slug: string; count: number } | null) => (s ? `${s.slug}:${s.count}` : '-');
  return [payload.socket, payload.motherboardId ?? '-', pick(payload.cpu), pick(payload.memory), pick(payload.gpu)].join('|');
}
