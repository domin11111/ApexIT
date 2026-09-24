import { accents } from '@apex/ui/tokens';
import type { SeedProduct } from '../schema';

/*
 * Источник: страница и даташит NVIDIA RTX PRO 6000 Blackwell.
 * Дополнено к брифу: 4000 AI TOPS (FP4), кристалл GB202 (≈ 92,2 млрд транзисторов),
 * двухслотовое исполнение, MIG до 4 инстансов, TGP версии Max-Q.
 */
export const rtxPro6000Blackwell: SeedProduct = {
  slug: 'rtx-pro-6000-blackwell',
  name: 'RTX PRO 6000 Blackwell',
  brand: 'NVIDIA',
  category: 'GPU',
  headline: 'The Mind',
  tagline: ['96 гигабайт мышления.', '96 gigabytes of thought.'],
  description: [
    'Флагманский профессиональный GPU на архитектуре Blackwell. 96 ГБ памяти GDDR7 с ECC вмещают большие языковые модели, сцены и датасеты целиком. 24 064 ядра CUDA, Tensor-ядра 5-го поколения с FP4 и RT-ядра 4-го поколения — для ИИ, рендеринга и симуляций.',
    'The flagship professional GPU built on Blackwell. 96 GB of GDDR7 ECC memory holds large language models, scenes and datasets whole. 24,064 CUDA cores, fifth-gen Tensor Cores with FP4 and fourth-gen RT Cores — for AI, rendering and simulation.',
  ],
  status: 'AVAILABLE',
  accentColor: accents.gpu.solid,
  modelPreset: 'GPU_DUAL_SLOT',
  model: { url: '/models/gpu-rtx-pro-6000-se.glb', sizeBytes: 1150072, mobileSizeBytes: 583304, triangles: 10824 },
  sortOrder: 40,

  specGroups: [
    {
      key: 'compute',
      title: ['Вычисления', 'Compute'],
      specs: [
        { key: 'gpu.architecture', label: ['Архитектура', 'Architecture'], value: ['Blackwell', 'Blackwell'] },
        {
          key: 'gpu.cudaCores',
          label: ['Ядра CUDA', 'CUDA cores'],
          value: ['24 064', '24,064'],
          numericValue: 24064,
          highlight: true,
        },
        {
          key: 'gpu.tensorCores',
          label: ['Tensor-ядра', 'Tensor Cores'],
          value: ['752 · 5-е поколение, FP4', '752 · 5th gen, FP4'],
          numericValue: 752,
        },
        { key: 'gpu.rtCores', label: ['RT-ядра', 'RT Cores'], value: ['188 · 4-е поколение', '188 · 4th gen'], numericValue: 188 },
        { key: 'gpu.fp32', label: ['FP32', 'FP32'], value: ['≈ 125 TFLOPS', '≈ 125 TFLOPS'], numericValue: 125 },
        {
          key: 'gpu.aiTops',
          label: ['ИИ-производительность', 'AI performance'],
          value: ['4000 AI TOPS', '4,000 AI TOPS'],
          numericValue: 4000,
          note: ['FP4, по данным NVIDIA.', 'FP4, per NVIDIA.'],
        },
      ],
    },
    {
      key: 'memory',
      title: ['Видеопамять', 'Memory'],
      specs: [
        { key: 'gpu.vram', label: ['Объём', 'Capacity'], value: ['96 ГБ', '96 GB'], numericValue: 96, highlight: true },
        { key: 'gpu.memoryType', label: ['Тип', 'Type'], value: ['GDDR7 с ECC', 'GDDR7 with ECC'] },
        { key: 'gpu.memoryBus', label: ['Шина', 'Bus width'], value: ['512 бит', '512-bit'], numericValue: 512 },
        {
          key: 'gpu.memoryBandwidth',
          label: ['Пропускная способность', 'Bandwidth'],
          value: ['≈ 1792 ГБ/с', '≈ 1,792 GB/s'],
          numericValue: 1792,
          highlight: true,
        },
      ],
    },
    {
      key: 'power',
      title: ['Питание', 'Power'],
      specs: [
        {
          key: 'gpu.tgp',
          label: ['TGP', 'TGP'],
          value: ['600 Вт', '600 W'],
          numericValue: 600,
          note: [
            'Workstation Edition. Max-Q — 300 Вт, у Server Edition TGP настраивается.',
            'Workstation Edition. Max-Q is 300 W; Server Edition TGP is configurable.',
          ],
        },
      ],
    },
    {
      key: 'io',
      title: ['Интерфейсы', 'I/O'],
      specs: [
        { key: 'gpu.interface', label: ['Шина', 'Host interface'], value: ['PCIe 5.0 x16', 'PCIe 5.0 x16'], numericValue: 5 },
        {
          key: 'gpu.displayOutputs',
          label: ['Видеовыходы', 'Display outputs'],
          value: ['4 × DisplayPort 2.1b', '4 × DisplayPort 2.1b'],
          numericValue: 4,
        },
        { key: 'gpu.slotWidth', label: ['Толщина', 'Slot width'], value: ['2 слота', 'Dual slot'], numericValue: 2 },
      ],
    },
    {
      key: 'silicon',
      title: ['Кристалл', 'Silicon'],
      specs: [
        { key: 'gpu.die', label: ['Графический процессор', 'GPU'], value: ['GB202', 'GB202'] },
        { key: 'gpu.process', label: ['Техпроцесс', 'Process'], value: ['TSMC 4N (4 нм)', 'TSMC 4N (4 nm)'], numericValue: 4 },
        {
          key: 'gpu.transistors',
          label: ['Транзисторы', 'Transistors'],
          value: ['≈ 92,2 млрд', '≈ 92.2 billion'],
          numericValue: 92.2,
        },
      ],
    },
    {
      key: 'platform',
      title: ['Версии и виртуализация', 'Editions & virtualization'],
      specs: [
        {
          key: 'gpu.editions',
          label: ['Исполнения', 'Editions'],
          value: ['Workstation · Max-Q · Server Edition', 'Workstation · Max-Q · Server Edition'],
        },
        {
          key: 'gpu.mig',
          label: ['Multi-Instance GPU', 'Multi-Instance GPU'],
          value: ['до 4 изолированных инстансов', 'up to 4 isolated instances'],
          numericValue: 4,
          note: ['По 24 ГБ видеопамяти на инстанс.', '24 GB of memory per instance.'],
        },
      ],
    },
  ],

  // Модель GPU (Server Edition): x — длина, y — высота (разъём PCIe снизу), z — толщина
  // (лицевая панель на z > 0), брекет на x = −1, открытый торец с рёбрами на x = +1.
  hotspots: [
    {
      key: 'gpu-die',
      anchorNode: 'gpu_die',
      position: [-0.017, 0.05, -0.043],
      cameraPosition: [0.3, 0.45, 1.3],
      visibility: 'EXPLODED',
      title: ['GB202 · Tensor-ядра 5-го поколения', 'GB202 · 5th-gen Tensor Cores'],
      body: [
        '752 Tensor-ядра с поддержкой FP4 ускоряют инференс и дообучение моделей прямо на рабочей станции.',
        '752 Tensor Cores with FP4 accelerate inference and fine-tuning right on the workstation.',
      ],
    },
    {
      key: 'vram',
      anchorNode: 'vram',
      position: [0.2, 0.313, -0.051],
      cameraPosition: [0.8, 0.6, 1.1],
      visibility: 'EXPLODED',
      title: ['96 ГБ GDDR7', '96 GB GDDR7'],
      body: [
        'Шина 512 бит и ≈ 1,8 ТБ/с: большие модели, сцены и датасеты целиком помещаются в память карты.',
        'A 512-bit bus at ≈ 1.8 TB/s: large models, scenes and datasets fit entirely in memory.',
      ],
    },
    {
      key: 'cooling',
      anchorNode: 'heatsink',
      position: [0.7, 0.415, 0.05],
      cameraPosition: [1.7, 1.1, 0.9],
      visibility: 'ASSEMBLED',
      title: ['Пассивный радиатор', 'Passive heatsink'],
      body: [
        'Server Edition без вентиляторов: воздух прогоняют вентиляторы сервера сквозь плотное оребрение — так карта отводит до 600 Вт в двухслотовом корпусе.',
        'The Server Edition has no fans: the server’s own airflow is pushed through dense fins, letting the card shed up to 600 W in a dual-slot body.',
      ],
    },
    {
      key: 'pcie',
      anchorNode: 'pcie_edge',
      position: [-0.29, -0.37, -0.055],
      cameraPosition: [-0.1, -1.0, 1.1],
      title: ['PCIe 5.0 x16', 'PCIe 5.0 x16'],
      body: [
        'До ≈ 64 ГБ/с в каждую сторону между GPU и процессором.',
        'Up to ≈ 64 GB/s each way between the GPU and the CPU.',
      ],
    },
    {
      key: 'outputs',
      anchorNode: 'io_bracket',
      position: [-0.99, 0.1, 0],
      cameraPosition: [-2.0, 0.3, 0.6],
      title: ['4 × DisplayPort 2.1b', '4 × DisplayPort 2.1b'],
      body: [
        'Четыре дисплея высокого разрешения — для визуализации, VR и видеостен.',
        'Four high-resolution displays — for visualization, VR and video walls.',
      ],
    },
  ],

  compatibility: [
    { socket: 'SP5', level: 'SUPPORTED' },
    {
      socket: 'SP7',
      level: 'SUPPORTED',
      notes: ['Карта PCIe 5.0 работает в слоте PCIe 6.0 — обратная совместимость.', 'A PCIe 5.0 card runs in a PCIe 6.0 slot — backward compatible.'],
    },
  ],
};
