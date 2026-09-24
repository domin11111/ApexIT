/*
 * Раскладка серверной платы конфигуратора — чистая функция без three.js (тестируется в Node).
 * Плоскость XZ, верх платы — y = 0, камера смотрит спереди (+z) сверху.
 *
 * Спереди — блоки «сокет + слоты памяти по бокам», как на реальных платах EPYC;
 * сзади — ряд слотов PCIe: видеокарты стоят вертикально длиной вдоль платы и не закрывают процессоры.
 */

export type Vec3 = [number, number, number];
export type Point = { x: number; z: number };
/** Где и как стоит модель компонента */
export type SlotPose = { position: Vec3; rotation: Vec3; scale: number };

export type ServerLayoutInput = {
  sockets: number;
  dimmsPerSocket: number;
  gpuSlots: number;
};

export type ServerLayout = {
  width: number;
  depth: number;
  center: Point;
  sockets: Point[];
  /** В порядке установки: сначала ближние к процессору, поочерёдно слева/справа и между сокетами */
  dimms: Point[];
  /** Центры видеокарт слева направо */
  gpus: Point[];
};

export const SOCKET_SIZE = 1.1;
export const DIMM_LENGTH = 1.7;
export const DIMM_PITCH = 0.1;
/** Зазор между сокетом и первым слотом памяти */
const DIMM_GAP = 0.28;
export const GPU_PITCH = 0.44;
/** Длина карты в пространстве модели (наибольший габарит = 2) */
const GPU_LENGTH = 2;
const SOCKET_Z = 0.7;
export const GPU_Z = -1.55;
const MARGIN = 0.45;
const BLOCK_GAP = 0.35;

export function serverLayout({ sockets, dimmsPerSocket, gpuSlots }: ServerLayoutInput): ServerLayout {
  const perSide = Math.ceil(dimmsPerSocket / 2);
  const blockWidth = SOCKET_SIZE + 2 * (DIMM_GAP + perSide * DIMM_PITCH);
  const blocksWidth = sockets * blockWidth + (sockets - 1) * BLOCK_GAP;

  const socketPoints: Point[] = Array.from({ length: sockets }, (_, i) => ({
    x: -blocksWidth / 2 + blockWidth / 2 + i * (blockWidth + BLOCK_GAP),
    z: SOCKET_Z,
  }));

  // Слоты каждого сокета изнутри наружу, поочерёдно слева и справа
  const slotsOf = (socket: Point): Point[] =>
    Array.from({ length: dimmsPerSocket }, (_, k) => {
      const side = k % 2 === 0 ? -1 : 1;
      const j = Math.floor(k / 2);
      return { x: socket.x + side * (SOCKET_SIZE / 2 + DIMM_GAP + j * DIMM_PITCH + DIMM_PITCH / 2), z: SOCKET_Z };
    });
  const perSocket = socketPoints.map(slotsOf);
  // Модули ставятся по очереди в каждый процессор — память распределяется поровну
  const dimms = Array.from({ length: dimmsPerSocket }, (_, k) => perSocket.map((slots) => slots[k]!)).flat();

  const gpus: Point[] = Array.from({ length: gpuSlots }, (_, i) => ({ x: (i - (gpuSlots - 1) / 2) * GPU_PITCH, z: GPU_Z }));

  const width = Math.max(blocksWidth, gpuSlots * GPU_PITCH) + 2 * MARGIN;
  const front = SOCKET_Z + DIMM_LENGTH / 2 + MARGIN;
  const back = GPU_Z - GPU_LENGTH / 2 - MARGIN;
  return {
    width,
    depth: front - back,
    center: { x: 0, z: (front + back) / 2 },
    sockets: socketPoints,
    dimms,
    gpus,
  };
}

/*
 * Позы моделей в слотах. Модели нормированы к габариту 2 (см. Vec3 в @apex/contracts):
 * процессор — квадрат ~2.1, модуль памяти — длина 2 вдоль X и высота 0.44, карта — длина 2 и высота 0.73.
 */
const CPU_SCALE = SOCKET_SIZE / 2.1;
const DIMM_SCALE = DIMM_LENGTH / 2;

export const cpuPose = (socket: Point): SlotPose => ({
  position: [socket.x, 0.13 * CPU_SCALE, socket.z],
  rotation: [0, 0, 0],
  scale: CPU_SCALE,
});

/** Модуль повёрнут вдоль Z и стоит контактами в слоте */
export const dimmPose = (slot: Point): SlotPose => ({
  position: [slot.x, 0.06 + 0.22 * DIMM_SCALE, slot.z],
  rotation: [0, Math.PI / 2, 0],
  scale: DIMM_SCALE,
});

/** Карта длиной вдоль Z, брекетом к заднему краю платы, разъёмом PCIe вниз */
export const gpuPose = (slot: Point): SlotPose => ({
  position: [slot.x, 0.45, slot.z],
  rotation: [0, -Math.PI / 2, 0],
  scale: 1,
});
