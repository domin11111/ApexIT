import type {
  ConfigurationField,
  ConfigurationLimits,
  ConfigurationPayload,
  ConfigurationTotals,
  Locale,
  MotherboardDto,
  PlatformDto,
  ProductCategory,
  ProductDetailDto,
  SpecKey,
  ValidateConfigurationResponse,
  ValidationIssue,
} from '@apex/contracts';
import { isOrderable } from '@apex/contracts/status';

/*
 * Движок совместимости конфигуратора (B3) — чистые функции без обращения к БД и сети.
 * На вход — уже загруженные и локализованные данные, на выход — проблемы с человеческими
 * объяснениями, итоги (ядра, память, ватты) и лимиты платформы для интерфейса.
 */

export type EngineInput = {
  payload: ConfigurationPayload;
  platform: PlatformDto;
  /** Все платы платформы — для подсказок «какая плата подойдёт» */
  boards: readonly MotherboardDto[];
  /** Выбранные продукты по slug; отсутствие ключа — такого продукта нет в каталоге */
  products: ReadonlyMap<string, ProductDetailDto>;
  locale: Locale;
};

/** Линии PCIe, которые оставляем под сеть и накопители, когда считаем слоты по платформе */
export const RESERVED_PCIE_LANES = 32;
/** Плата, BMC, сеть, накопители — постоянная часть потребления */
export const PLATFORM_BASE_W = 150;
/** Вентиляторы растут вместе с теплом: доля от мощности CPU и GPU */
export const COOLING_SHARE = 0.1;
/** Блок питания нагружаем не больше чем на 80 % */
export const PSU_HEADROOM = 1.25;

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const;

/** Числовые характеристики продукта по ключу. */
export function specNumbers(product: ProductDetailDto): Map<SpecKey, number> {
  const numbers = new Map<SpecKey, number>();
  for (const group of product.specGroups) {
    for (const spec of group.specs) {
      if (spec.numericValue !== null) numbers.set(spec.key as SpecKey, spec.numericValue);
    }
  }
  return numbers;
}

const displayName = (product: ProductDetailDto) => `${product.brand} ${product.name}`;
const boardName = (board: MotherboardDto) => `${board.vendor} ${board.model}`;

/** Слоты x16 платы: прямые слоты плюс пары MCIO x8 через кабельный райзер. */
export function boardGpuSlots(board: MotherboardDto): number | null {
  if (board.pcieX16Slots === null && board.mcioX8Ports === null) return null;
  return (board.pcieX16Slots ?? 0) + Math.floor((board.mcioX8Ports ?? 0) / 2);
}

/** Лимиты платформы или конкретной платы при заданном числе процессоров. */
export function computeLimits(platform: PlatformDto, board: MotherboardDto | null, cpuCount: number): ConfigurationLimits {
  const sockets = board ? board.sockets : platform.maxSockets;
  const populated = Math.max(1, Math.min(cpuCount, sockets));

  // На двухсокетной плате с одним процессором работают только его каналы памяти
  const memorySlots = board
    ? Math.floor((board.dimmSlots * populated) / board.sockets)
    : platform.memoryChannels * (platform.dimmsPerChannel ?? 1) * populated;

  const lanes = populated >= 2 ? (platform.pcieLanes2P ?? platform.pcieLanes1P) : platform.pcieLanes1P;
  const platformGpuSlots = Math.floor(Math.max(0, lanes - RESERVED_PCIE_LANES) / 16);
  const gpuSlots = (board && !board.isPlaceholder ? boardGpuSlots(board) : null) ?? platformGpuSlots;

  return {
    sockets,
    memorySlots,
    memoryChannels: platform.memoryChannels,
    gpuSlots,
    cpuTdpW: board?.maxCpuTdpW ?? platform.maxCpuTdpW,
    memoryPerSlotGb: board?.maxMemoryGb ? Math.floor(board.maxMemoryGb / board.dimmSlots) : null,
  };
}

export function evaluateConfiguration({ payload, platform, boards, products, locale }: EngineInput): ValidateConfigurationResponse {
  const t = (ru: string, en: string) => (locale === 'ru' ? ru : en);
  const num = new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'en-US');
  const W = t('Вт', 'W');
  const GB = t('ГБ', 'GB');
  const socket = platform.socket;

  const issues: ValidationIssue[] = [];
  const issue = (
    code: ValidationIssue['code'],
    severity: ValidationIssue['severity'],
    field: ConfigurationField,
    message: string,
    hint?: string,
  ) => issues.push({ code, severity, field, message, ...(hint ? { hint } : {}) });

  /** Продукт выбранной позиции нужной категории или null (с объяснением). */
  const resolve = (field: 'cpu' | 'memory' | 'gpu', slug: string, category: ProductCategory) => {
    const product = products.get(slug);
    if (!product) {
      issue('UNKNOWN_PRODUCT', 'error', field, t(`Продукт «${slug}» не найден в каталоге`, `Product "${slug}" is not in the catalog`));
      return null;
    }
    if (product.category !== category) {
      issue(
        'UNKNOWN_PRODUCT',
        'error',
        field,
        t(`${displayName(product)} нельзя выбрать в этом шаге`, `${displayName(product)} cannot be selected in this step`),
      );
      return null;
    }
    return product;
  };

  /** Проверка сокета по таблице совместимости продукта. */
  const checkSocket = (field: 'cpu' | 'memory' | 'gpu', product: ProductDetailDto) => {
    const entry = product.compatibility.find((c) => c.socket === socket);
    if (entry) return entry;
    const supported = product.compatibility.map((c) => c.socket);
    issue(
      'SOCKET_MISMATCH',
      'error',
      field,
      field === 'cpu'
        ? t(
            `${displayName(product)} требует сокет ${supported.join(' / ')}, а выбрана платформа ${socket}`,
            `${displayName(product)} requires socket ${supported.join(' / ')}, but the ${socket} platform is selected`,
          )
        : t(`${displayName(product)} не поддерживается платформой ${socket}`, `${displayName(product)} is not supported on ${socket}`),
      supported.length > 0
        ? t(
            `Выберите платформу ${supported.join(' или ')} — или другой продукт для ${socket}`,
            `Choose the ${supported.join(' or ')} platform — or another product for ${socket}`,
          )
        : undefined,
    );
    return null;
  };

  // ── Платформа и плата ─────────────────────────────────────────────────────
  if (platform.status !== 'AVAILABLE') {
    const when = platform.availabilityWindow;
    issue(
      'PLATFORM_NOT_AVAILABLE',
      'info',
      'socket',
      t(
        `Платформа ${socket} ожидается${when ? ` в ${when}` : ' позже'} — сборку можно запросить заранее`,
        `The ${socket} platform is expected${when ? ` in ${when}` : ' later'} — you can request this build in advance`,
      ),
    );
  }

  let board: MotherboardDto | null = null;
  if (payload.motherboardId) {
    board = boards.find((b) => b.id === payload.motherboardId) ?? null;
    if (!board) {
      issue(
        'UNKNOWN_MOTHERBOARD',
        'error',
        'motherboard',
        t(`Выбранная плата не относится к платформе ${socket}`, `The selected board is not a ${socket} board`),
        t('Выберите плату из списка или оставьте «Любая подходящая»', 'Pick a board from the list or keep "Any compatible"'),
      );
    } else if (board.isPlaceholder) {
      issue(
        'BOARD_SPECS_PENDING',
        'info',
        'motherboard',
        t(
          `Характеристики платы ${boardName(board)} ещё не объявлены — проверены лимиты платформы ${socket}`,
          `${boardName(board)} specifications are not announced yet — checked against ${socket} platform limits`,
        ),
      );
    }
  }

  const cpuCount = payload.cpu.count;
  const limits = computeLimits(platform, board, cpuCount);

  // ── Процессор ─────────────────────────────────────────────────────────────
  const cpu = resolve('cpu', payload.cpu.slug, 'CPU');
  const cpuSpecs = cpu ? specNumbers(cpu) : new Map<SpecKey, number>();
  if (cpu && checkSocket('cpu', cpu)) {
    const cpuMax = cpuSpecs.get('cpu.socketConfigs') ?? 1;
    if (cpuCount > cpuMax) {
      issue(
        'SOCKET_COUNT_EXCEEDED',
        'error',
        'cpu',
        t(`${displayName(cpu)} работает максимум в ${cpuMax}P-конфигурации`, `${displayName(cpu)} supports up to ${cpuMax}P configurations`),
      );
    } else if (cpuCount > limits.sockets) {
      issue(
        'SOCKET_COUNT_EXCEEDED',
        'error',
        'cpu',
        board
          ? t(`Плата ${boardName(board)} — односокетная, а выбрано ${cpuCount} процессора`, `${boardName(board)} is a single-socket board, but ${cpuCount} CPUs are selected`)
          : t(`Платформа ${socket} поддерживает до ${limits.sockets} процессоров`, `The ${socket} platform supports up to ${limits.sockets} CPUs`),
        t('Выберите двухсокетную плату или один процессор', 'Choose a dual-socket board or a single CPU'),
      );
    }
    if (board && board.sockets > cpuCount) {
      issue(
        'SOCKETS_UNDERPOPULATED',
        'warning',
        'cpu',
        t(
          `Плата ${boardName(board)} двухсокетная, а процессор один: половина слотов памяти и линий PCIe не будет работать`,
          `${boardName(board)} is a dual-socket board with one CPU: half of the memory slots and PCIe lanes stay inactive`,
        ),
        t('Добавьте второй процессор или выберите односокетную плату', 'Add a second CPU or choose a single-socket board'),
      );
    }

    const tdp = cpuSpecs.get('cpu.tdp');
    if (tdp !== undefined && limits.cpuTdpW !== null && tdp > limits.cpuTdpW) {
      const fitting = boards.filter(
        (b) => !b.isPlaceholder && b.maxCpuTdpW !== null && b.maxCpuTdpW >= tdp && b.sockets >= Math.min(cpuCount, 2),
      );
      issue(
        'CPU_TDP_EXCEEDS_BOARD',
        'error',
        board ? 'motherboard' : 'cpu',
        board
          ? t(
              `Плата ${boardName(board)} рассчитана на процессоры до ${limits.cpuTdpW} ${W}, а TDP ${displayName(cpu)} — ${tdp} ${W}`,
              `${boardName(board)} supports CPUs up to ${limits.cpuTdpW} ${W}, but ${displayName(cpu)} is rated at ${tdp} ${W}`,
            )
          : t(
              `Платформа ${socket} рассчитана на процессоры до ${limits.cpuTdpW} ${W}, а TDP ${displayName(cpu)} — ${tdp} ${W}`,
              `The ${socket} platform supports CPUs up to ${limits.cpuTdpW} ${W}, but ${displayName(cpu)} is rated at ${tdp} ${W}`,
            ),
        fitting.length > 0
          ? t(`Подойдут: ${fitting.map(boardName).join(', ')}`, `These boards fit: ${fitting.map(boardName).join(', ')}`)
          : undefined,
      );
    }
  }

  // ── Память ────────────────────────────────────────────────────────────────
  const memory = payload.memory ? resolve('memory', payload.memory.slug, 'MEMORY') : null;
  const memorySpecs = memory ? specNumbers(memory) : new Map<SpecKey, number>();
  const memoryCount = payload.memory?.count ?? 0;
  if (!payload.memory) {
    issue(
      'MEMORY_MISSING',
      'warning',
      'memory',
      t('Память не выбрана — без модулей система не запустится', 'No memory selected — the system will not boot without modules'),
    );
  }
  if (memory) {
    const entry = checkSocket('memory', memory);
    if (entry?.level === 'VALIDATING') {
      issue(
        'MEMORY_NOT_VALIDATED',
        'warning',
        'memory',
        t(`${displayName(memory)} ещё проходит валидацию на платформе ${socket}`, `${displayName(memory)} is still being validated on ${socket}`),
        entry.notes ?? undefined,
      );
    }

    if (memoryCount > limits.memorySlots) {
      issue(
        'MEMORY_SLOTS_EXCEEDED',
        'error',
        'memory',
        t(
          `Выбрано модулей: ${memoryCount}, а доступных слотов — ${limits.memorySlots}`,
          `${memoryCount} modules selected, but only ${limits.memorySlots} slots are available`,
        ),
        board && board.sockets > cpuCount
          ? t('С одним процессором работает половина слотов платы', 'With one CPU only half of the board slots work')
          : t(`Уменьшите число модулей до ${limits.memorySlots}`, `Reduce the module count to ${limits.memorySlots}`),
      );
    }

    const capacity = memorySpecs.get('memory.capacity');
    if (board && capacity !== undefined && limits.memoryPerSlotGb !== null && capacity > limits.memoryPerSlotGb) {
      issue(
        'MEMORY_CAPACITY_EXCEEDS_BOARD',
        'error',
        'memory',
        t(
          `Плата ${boardName(board)} поддерживает модули до ${num.format(limits.memoryPerSlotGb)} ${GB}, а ${displayName(memory)} — ${num.format(capacity)} ${GB}`,
          `${boardName(board)} supports modules up to ${num.format(limits.memoryPerSlotGb)} ${GB}, but ${displayName(memory)} is ${num.format(capacity)} ${GB}`,
        ),
        t('Выберите другую плату или оставьте «Любая подходящая»', 'Choose another board or keep "Any compatible"'),
      );
    }

    // Пропускная способность максимальна, когда модулей поровну во всех каналах всех процессоров
    const channels = platform.memoryChannels * Math.max(1, Math.min(cpuCount, limits.sockets));
    if (memoryCount > 0 && memoryCount <= limits.memorySlots) {
      const balanced = [channels, channels * 2].filter((n) => n <= limits.memorySlots);
      if (memoryCount < channels) {
        issue(
          'MEMORY_UNBALANCED',
          'warning',
          'memory',
          t(
            `Заняты не все каналы памяти: ${memoryCount} из ${channels} — пропускная способность будет ниже максимальной`,
            `Not all memory channels are populated: ${memoryCount} of ${channels} — bandwidth will be below peak`,
          ),
          t(
            `Для полной скорости — ${channels} модулей (по ${platform.memoryChannels} на процессор)`,
            `For full bandwidth use ${channels} modules (${platform.memoryChannels} per CPU)`,
          ),
        );
      } else if (memoryCount % channels !== 0) {
        issue(
          'MEMORY_UNBALANCED',
          'warning',
          'memory',
          t(
            `${memoryCount} модулей не делятся поровну на ${channels} каналов — часть каналов будет нагружена сильнее`,
            `${memoryCount} modules do not split evenly across ${channels} channels — some channels will be loaded more`,
          ),
          t(`Сбалансированно: ${balanced.join(' или ')}`, `Balanced options: ${balanced.join(' or ')}`),
        );
      }
    }
  }

  // ── Видеокарты ────────────────────────────────────────────────────────────
  const gpu = payload.gpu ? resolve('gpu', payload.gpu.slug, 'GPU') : null;
  const gpuSpecs = gpu ? specNumbers(gpu) : new Map<SpecKey, number>();
  const gpuCount = payload.gpu?.count ?? 0;
  if (gpu && checkSocket('gpu', gpu) && gpuCount > limits.gpuSlots) {
    issue(
      'PCIE_SLOTS_EXCEEDED',
      'error',
      'gpu',
      board && !board.isPlaceholder
        ? t(
            `Видеокарт: ${gpuCount}, а слотов PCIe x16 у платы ${boardName(board)} — ${limits.gpuSlots}`,
            `${gpuCount} GPUs selected, but ${boardName(board)} has ${limits.gpuSlots} PCIe x16 slots`,
          )
        : t(
            `Видеокарт: ${gpuCount}, а линий PCIe хватает на ${limits.gpuSlots} (${RESERVED_PCIE_LANES} линии оставлены под сеть и накопители)`,
            `${gpuCount} GPUs selected, but PCIe lanes allow ${limits.gpuSlots} (${RESERVED_PCIE_LANES} lanes are kept for networking and storage)`,
          ),
      t(`Максимум для этой конфигурации — ${limits.gpuSlots}`, `The maximum for this configuration is ${limits.gpuSlots}`),
    );
  }

  // ── Статусы: PREVIEW можно только «запросить информацию» (B3) ─────────────
  const selected: Array<[ConfigurationField, ProductDetailDto | null]> = [
    ['cpu', cpu],
    ['memory', memory],
    ['gpu', gpu],
  ];
  let orderable = true;
  for (const [field, product] of selected) {
    if (!product || isOrderable(product.status)) continue;
    orderable = false;
    issue(
      'PRODUCT_NOT_ORDERABLE',
      'info',
      field,
      t(
        `${displayName(product)} — превью: заказать пока нельзя, можно запросить информацию`,
        `${displayName(product)} is a preview: it cannot be ordered yet, but you can request information`,
      ),
    );
  }

  // ── Итоги ─────────────────────────────────────────────────────────────────
  const times = (specs: Map<SpecKey, number>, key: SpecKey, count: number) => (specs.get(key) ?? 0) * count;
  const cpuPowerW = times(cpuSpecs, 'cpu.tdp', cpu ? cpuCount : 0);
  const memoryPowerW = times(memorySpecs, 'memory.power', memoryCount);
  const gpuPowerW = times(gpuSpecs, 'gpu.tgp', gpuCount);
  const platformOverheadW = PLATFORM_BASE_W + Math.round((cpuPowerW + gpuPowerW) * COOLING_SHARE);
  const totalPowerW = cpuPowerW + memoryPowerW + gpuPowerW + platformOverheadW;

  const totals: ConfigurationTotals = {
    cores: times(cpuSpecs, 'cpu.cores', cpu ? cpuCount : 0),
    threads: times(cpuSpecs, 'cpu.threads', cpu ? cpuCount : 0),
    memoryGb: times(memorySpecs, 'memory.capacity', memoryCount),
    vramGb: times(gpuSpecs, 'gpu.vram', gpuCount),
    cpuPowerW,
    memoryPowerW,
    gpuPowerW,
    platformOverheadW,
    totalPowerW,
    recommendedPsuW: Math.ceil((totalPowerW * PSU_HEADROOM) / 100) * 100,
  };

  const sorted = issues.toSorted((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  return {
    valid: !sorted.some((i) => i.severity === 'error'),
    orderable,
    issues: sorted,
    totals,
    limits,
  };
}
