import { accents } from '@apex/ui/tokens';
import type { SeedProduct } from '../schema';

/*
 * Источник: пресс-релиз Micron от 15.09.2026.
 * Дополнено к брифу: прирост до 1,4× против конфигураций на 256 ГБ (Spark SVM), валидация у AMD и Intel.
 */
export const micron512gbRdimm: SeedProduct = {
  slug: 'micron-ddr5-512gb-rdimm',
  name: '512GB DDR5 RDIMM',
  brand: 'Micron',
  category: 'MEMORY',
  headline: 'The Monolith',
  tagline: ['Полтерабайта. Одна планка.', 'Half a terabyte. One module.'],
  description: [
    'Первый в мире модуль DDR5 RDIMM на 512 ГБ. Вертикальные стеки кристаллов DRAM, связанные сквозными кремниевыми переходами (TSV), помещают полтерабайта в одну планку — и потребляют более чем на 60% меньше энергии, чем четыре модуля по 128 ГБ. До 12 ТБ памяти в двухсокетном сервере.',
    'The world’s first 512 GB DDR5 RDIMM. Vertically stacked DRAM dies linked by through-silicon vias put half a terabyte on a single module — drawing over 60% less power than four 128 GB modules. Up to 12 TB of memory in a dual-socket server.',
  ],
  status: 'PREVIEW',
  availabilityWindow: 'H2 2027',
  availabilityNote: [
    'Продемонстрирован 15 сентября 2026 г. Массовое производство ожидается во второй половине 2027 г.',
    'Demonstrated September 15, 2026. Volume production expected in the second half of 2027.',
  ],
  accentColor: accents.memory.solid,
  modelPreset: 'RDIMM',
  model: { url: '/models/rdimm-micron-512gb.glb', sizeBytes: 1398844, mobileSizeBytes: 850228, triangles: 35052 },
  sortOrder: 30,

  specGroups: [
    {
      key: 'module',
      title: ['Модуль', 'Module'],
      specs: [
        { key: 'memory.capacity', label: ['Ёмкость', 'Capacity'], value: ['512 ГБ', '512 GB'], numericValue: 512, highlight: true },
        { key: 'memory.type', label: ['Тип', 'Type'], value: ['DDR5 RDIMM', 'DDR5 RDIMM'] },
        { key: 'memory.ecc', label: ['Коррекция ошибок', 'Error correction'], value: ['ECC', 'ECC'] },
        { key: 'memory.formFactor', label: ['Разъём', 'Connector'], value: ['288-pin', '288-pin'] },
      ],
    },
    {
      key: 'technology',
      title: ['Технология', 'Technology'],
      specs: [
        {
          key: 'memory.stacking',
          label: ['Компоновка', 'Die stacking'],
          value: ['Вертикальный стек DRAM с TSV', 'Vertically stacked DRAM with TSV'],
          note: [
            'TSV (through-silicon via) — сквозные кремниевые переходы, соединяющие кристаллы в стеке.',
            'TSV — through-silicon vias that connect the dies within a stack.',
          ],
        },
      ],
    },
    {
      key: 'performance',
      title: ['Производительность', 'Performance'],
      specs: [
        {
          key: 'memory.speed',
          label: ['Скорость', 'Speed'],
          value: ['до 9200 МТ/с', 'up to 9,200 MT/s'],
          numericValue: 9200,
          highlight: true,
          note: ['Фактическая скорость ограничена контроллером памяти платформы.', 'Effective speed is capped by the platform memory controller.'],
        },
        {
          key: 'memory.perfUplift',
          label: ['Прирост', 'Uplift'],
          value: ['до 1,4×', 'up to 1.4×'],
          numericValue: 1.4,
          note: [
            'Против конфигураций на 256 ГБ в аналитике Spark SVM, по данным Micron.',
            'Versus 256 GB configurations in Spark SVM analytics, per Micron.',
          ],
        },
      ],
    },
    {
      key: 'power',
      title: ['Питание', 'Power'],
      specs: [
        { key: 'memory.power', label: ['Потребление модуля', 'Module power'], value: ['16 Вт', '16 W'], numericValue: 16, highlight: true },
        {
          key: 'memory.powerBaseline',
          label: ['4 модуля × 128 ГБ', '4 modules × 128 GB'],
          value: ['44,2 Вт', '44.2 W'],
          numericValue: 44.2,
        },
        {
          key: 'memory.powerSaving',
          label: ['Экономия энергии', 'Power savings'],
          value: ['более 60%', 'over 60%'],
          numericValue: 63.8,
          note: ['16 Вт против 44,2 Вт при той же ёмкости — −63,8%.', '16 W vs 44.2 W at equal capacity — −63.8%.'],
        },
      ],
    },
    {
      key: 'scale',
      title: ['Масштаб', 'Scale'],
      specs: [
        {
          key: 'memory.maxSystemCapacity',
          label: ['Память на сервер', 'Memory per server'],
          value: ['до 12 ТБ', 'up to 12 TB'],
          numericValue: 12,
          note: ['24 слота в двухсокетном сервере.', '24 slots in a dual-socket server.'],
        },
      ],
    },
    {
      key: 'platform',
      title: ['Платформа', 'Platform'],
      specs: [
        {
          key: 'memory.validation',
          label: ['Валидация', 'Validation'],
          value: ['AMD и Intel — в процессе', 'AMD and Intel — in progress'],
        },
      ],
    },
  ],

  // Модель RDIMM: плата в плоскости XY (x — длина, y — высота), компоненты на лицевой стороне (z > 0).
  hotspots: [
    {
      key: 'dram-stack',
      anchorNode: 'dram_stack_0',
      position: [-0.89, 0.135, 0.03],
      cameraPosition: [-0.6, 0.4, 0.9],
      cameraTarget: [-0.89, 0.13, 0.02],
      title: ['Стек DRAM с TSV', 'TSV DRAM stack'],
      body: [
        'Кристаллы DRAM уложены вертикально и соединены сквозными кремниевыми переходами — так в одном корпусе помещается в разы больше памяти.',
        'DRAM dies are stacked vertically and linked by through-silicon vias, multiplying capacity per package.',
      ],
    },
    {
      key: 'rcd',
      anchorNode: 'rcd',
      position: [0, -0.06, 0.025],
      cameraPosition: [0.1, 0.2, 0.8],
      title: ['Регистровый буфер (RCD)', 'Registering clock driver (RCD)'],
      body: [
        'Буферизует команды и адреса, чтобы сервер стабильно работал с модулями огромной ёмкости.',
        'Buffers command and address signals so servers can reliably drive very high-capacity modules.',
      ],
    },
    {
      key: 'pmic',
      anchorNode: 'pmic',
      position: [0, 0.03, -0.02],
      cameraPosition: [0.2, 0.35, -0.85],
      title: ['Контроллер питания (PMIC)', 'Power management IC (PMIC)'],
      body: [
        'В DDR5 питание регулируется прямо на модуле. Все 512 ГБ потребляют лишь 16 Вт.',
        'DDR5 regulates power on the module itself. All 512 GB draw just 16 W.',
      ],
    },
    {
      key: 'contacts',
      anchorNode: 'contacts',
      position: [0.3, -0.21, 0.01],
      cameraPosition: [0.5, -0.5, 0.9],
      title: ['288 контактов', '288 contacts'],
      body: [
        'Позолоченный краевой разъём стандарта DDR5 RDIMM.',
        'A gold-plated DDR5 RDIMM edge connector.',
      ],
    },
  ],

  compatibility: [
    {
      socket: 'SP7',
      level: 'VALIDATING',
      notes: [
        'Валидация AMD продолжается. Скорость ограничена контроллером памяти платформы.',
        'AMD validation in progress. Speed is capped by the platform memory controller.',
      ],
    },
    {
      socket: 'SP5',
      level: 'VALIDATING',
      notes: [
        'Нужна поддержка модулей 512 ГБ со стороны платы и BIOS; скорость — до 6400 МТ/с.',
        'Requires board and BIOS support for 512 GB modules; speed up to 6,400 MT/s.',
      ],
    },
  ],
};
