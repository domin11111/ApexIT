/*
 * «Часы» скролл-сторителлинга главной. Всё в экранах (высотах вьюпорта):
 * позиция скролла и начало/длина каждой секции. HTML-счётчики и 3D-режиссёр
 * считают свои значения из одних и тех же часов — поэтому они синхронны.
 */

export const SCENES = ['hero', 'chiplets', 'generations', 'memory', 'gpu', 'assembly', 'footer'] as const;
export type SceneId = (typeof SCENES)[number];

/** Высоты секций в экранах (десктоп). На телефоне секции короче — см. классы в разметке. */
export const SCENE_LENGTH: Record<SceneId, number> = {
  hero: 1,
  chiplets: 3,
  generations: 2.6,
  memory: 3.4,
  gpu: 2.8,
  assembly: 3,
  footer: 1.2,
};

export type SceneMark = { start: number; length: number };

export type StoryClock = {
  /** Позиция скролла в экранах */
  screens: number;
  marks: Record<SceneId, SceneMark>;
  /** prefers-reduced-motion: вместо плавной хореографии — статичные состояния сцен */
  reduced: boolean;
};

/** Разметка по умолчанию (до измерения DOM): секции подряд. */
export function defaultMarks(): Record<SceneId, SceneMark> {
  let start = 0;
  const marks = {} as Record<SceneId, SceneMark>;
  for (const id of SCENES) {
    marks[id] = { start, length: SCENE_LENGTH[id] };
    start += SCENE_LENGTH[id];
  }
  return marks;
}

export const clamp01 = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t);
const snap = (t: number) => (t >= 0.5 ? 1 : 0);

/** 0 — верх секции у нижнего края экрана, 1 — секция закрепилась (sticky) вверху. */
export function enter(clock: StoryClock, id: SceneId): number {
  const t = clamp01(clock.screens - (clock.marks[id].start - 1));
  return clock.reduced ? snap(t) : t;
}

/** Прогресс «закреплённой» части секции: 0 — только закрепилась, 1 — вот-вот уйдёт. */
export function active(clock: StoryClock, id: SceneId): number {
  const { start, length } = clock.marks[id];
  const t = clamp01((clock.screens - start) / Math.max(1e-6, length - 1));
  // Без анимаций сцена сразу показывает итоговое состояние
  return clock.reduced ? (clock.screens >= start - 0.5 ? 1 : 0) : t;
}

/** Подотрезок [a, b] внутри прогресса t, нормированный к 0…1. */
export const span = (t: number, [a, b]: readonly [number, number]) => clamp01((t - a) / (b - a));

export const smooth = (t: number) => t * t * (3 - 2 * t);
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * «Биты» сцен — окна внутри active(сцена), общие для HTML и 3D.
 * Например, чиплеты загораются в окне chiplets.cores, и в том же окне счётчик идёт 0 → 256.
 */
export const BEATS = {
  chiplets: { lid: [0, 0.38], cores: [0.4, 0.92] },
  generations: { bars: [0.08, 0.6] },
  memory: { explode: [0, 0.28], capacity: [0.04, 0.3], ghosts: [0.42, 0.56], merge: [0.62, 0.86] },
  gpu: { vram: [0, 0.3], cuda: [0.2, 0.55], bandwidth: [0.4, 0.75] },
  assembly: { cpu: [0, 0.32], memory: [0.12, 0.5], gpu: [0.3, 0.62], traces: [0.5, 0.92], cta: [0.72, 0.95] },
} as const satisfies Partial<Record<SceneId, Record<string, readonly [number, number]>>>;

/** Значение бита: прогресс окна внутри активной фазы сцены. */
export function beat<S extends keyof typeof BEATS>(clock: StoryClock, scene: S, name: keyof (typeof BEATS)[S]): number {
  return span(active(clock, scene), BEATS[scene][name] as readonly [number, number]);
}

/** Какая сцена сейчас на экране — для индикатора прогресса и aria. */
export function currentScene(clock: StoryClock): SceneId {
  let current: SceneId = 'hero';
  for (const id of SCENES) if (clock.screens >= clock.marks[id].start - 0.5) current = id;
  return current;
}
