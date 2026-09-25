import layout from '@/three/models/assembly-layout.json';

/*
 * Раскладка сцены сборки: реальная плата SP7 (GLB) и детали в её сокете и слотах.
 * Координаты приходят из tools/blender (sync_collection.py → assembly-layout.json) в нормализованном
 * пространстве каждой модели — как после prepareGlb: наибольший габарит = 2, центр габаритов в нуле.
 * Здесь они приводятся к общему масштабу: детали стоят на плате в реальных пропорциях.
 */

export type Vec3 = [number, number, number];

/** Масштаб модели платы в сцене: ширина 330 мм (2 в модели) → 3,4 единицы. */
export const BOARD_DISPLAY = 1.7;
/** Единиц сцены на метр — общий масштаб всех деталей на плате (при масштабе платы 1). */
export const UNITS_PER_METER = BOARD_DISPLAY * layout.board.scale;
/**
 * Плата развёрнута на 180°: к камере — VRM и сокет, слоты PCIe — дальше.
 * Видеокарта (111 мм над платой) стоит за сокетом и не закрывает процессор.
 */
export const BOARD_YAW = Math.PI;
/** Верх текстолита относительно центра модели платы (единицы сцены при масштабе 1). */
export const BOARD_TOP = layout.board.top * BOARD_DISPLAY;

/** Поза детали в посадочном месте: положение — от центра верха платы при масштабе платы 1. */
export type Mount = { position: Vec3; yaw: number; scale: number };

const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

/** Поворот точки XZ вокруг оси Y — как Object3D.rotation.y. */
function yawed(x: number, z: number, yaw: number): [number, number] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [x * c + z * s, -x * s + z * c];
}

type Part = { scale: number; anchor: number[] };

/**
 * Деталь в посадочном месте: опорная точка детали (контакты) — над центром слота на высоте seat (м).
 * yaw — поворот детали относительно платы.
 */
function mount([x, z]: number[], seat: number, part: Part, yaw: number): Mount {
  const scale = UNITS_PER_METER / part.scale;
  const total = wrap(BOARD_YAW + yaw);
  const [sx, sz] = yawed(x! * BOARD_DISPLAY, z! * BOARD_DISPLAY, BOARD_YAW);
  const [ax, az] = yawed(part.anchor[0]! * scale, part.anchor[2]! * scale, total);
  return { position: [sx - ax, seat * UNITS_PER_METER - part.anchor[1]! * scale, sz - az], yaw: total, scale };
}

const cpu = { scale: layout.cpu.scale, anchor: layout.cpu.contacts };
const memory = { scale: layout.memory.scale, anchor: layout.memory.contacts };
const filler = { scale: layout.filler.scale, anchor: layout.filler.contacts };
const gpu = { scale: layout.gpu.scale, anchor: layout.gpu.fingers };

/** Ключ слота DIMM смотрит на север платы: модуль повёрнут на 90° относительно неё. */
const DIMM_YAW = Math.PI / 2;

export const ASSEMBLY = {
  /**
   * Процессор развёрнут вместе с сокетом (ориентацию сокета на плате выбирает производитель платы):
   * маркировка крышки читается с камеры, а не вверх ногами
   */
  socket: mount(layout.board.socket, layout.seat.cpu, cpu, Math.PI),
  /** Слоты DIMM: 0–7 — запад от сокета наружу, 8–15 — восток */
  dimms: layout.board.dimms.map((slot) => mount(slot, layout.seat.memory, memory, DIMM_YAW)),
  /** Те же слоты для облегчённой модели модуля-статиста */
  fillers: layout.board.dimms.map((slot) => mount(slot, layout.seat.memory, filler, DIMM_YAW)),
  /** Слоты PCIe x16: 0 — ближний к сокету */
  pcie: layout.board.pcie.map((slot) => mount(slot, layout.seat.gpu, gpu, 0)),
};

/** Слот, в который встаёт модуль из сцены памяти: ближний к сокету с западной стороны (к камере). */
export const HERO_DIMM = 0;

/** Порядок, в котором статисты занимают слоты: парами запад/восток, от сокета наружу. */
export const FILLER_ORDER = Array.from({ length: 8 }, (_, k) => [k, k + 8])
  .flat()
  .filter((slot) => slot !== HERO_DIMM);

/** Геометрия платы для светящихся трасс — в нормализованных координатах модели платы. */
export const BOARD_LAYOUT = layout.board;
