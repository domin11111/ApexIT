import { BOARD } from '@/three/models/procedural/board';
import {
  beat,
  easeInOut,
  easeOut,
  enter,
  SCENES,
  smooth,
  type SceneId,
  type StoryClock,
} from './clock';

/*
 * Режиссёр главной: чистая функция «часы скролла → позы всех участников».
 * Для каждой модели задана поза в каждой сцене; при входе следующей сцены (enter)
 * поза плавно смешивается с новой. Поэтому хореография детерминирована, обратима
 * при скролле вверх и покрыта юнит-тестами (director.test.ts).
 */

export type Vec3 = [number, number, number];
export type ActorPose = { position: Vec3; rotation: Vec3; scale: number; visibility: number };

export type StoryPose = {
  camera: { position: Vec3; target: Vec3 };
  /** rim — цвет контрового света (линейный RGB): акцент продукта текущей сцены */
  stage: { beam: number; dust: number; floor: number; podium: number; rim: Vec3 };
  venice: ActorPose & { explode: number; lit: number };
  turin: ActorPose;
  memory: ActorPose & { explode: number; tsv: number; edge: number };
  /** Четыре тусклых модуля по 128 ГБ: появление и схлопывание в один */
  ghosts: { visibility: number; spread: number };
  gpu: ActorPose & { glow: number };
  /** Поток частиц-данных в видеокарту */
  stream: number;
  board: { visibility: number; traces: number; reveal: number; scale: number; x: number };
  /** 0…1 — сколько модулей-статистов уже вставлено в слоты */
  fillers: number;
};

/** Высота схемы платы в сцене сборки. */
export const BOARD_Y = -0.45;

export type DirectorInput = {
  clock: StoryClock;
  /** Интро hero (по времени, не по скроллу): луч, подъём процессора, дорожки */
  intro: { beam: number; model: number; traces: number };
  /** Накопленный угол ленивого вращения процессора в hero, рад */
  spin: number;
  /** Ширина / высота вьюпорта */
  aspect: number;
  /** Акценты продуктов (линейный RGB) — красят контровой свет своей сцены */
  accents?: { venice: Vec3; memory: Vec3; gpu: Vec3 };
};

const WHITE: Vec3 = [1, 1, 1];

// ─── Смешивание поз ──────────────────────────────────────────────────────────

type Mixable = number | readonly number[] | { readonly [key: string]: Mixable };

function mix<T extends Mixable>(a: T, b: T, t: number): T {
  if (typeof a === 'number' && typeof b === 'number') return (a + (b - a) * t) as T;
  if (Array.isArray(a) && Array.isArray(b)) return a.map((v: number, i) => v + ((b[i] as number) - v) * t) as unknown as T;
  const result: Record<string, Mixable> = {};
  for (const key of Object.keys(a as object)) {
    result[key] = mix((a as Record<string, Mixable>)[key]!, (b as Record<string, Mixable>)[key]!, t);
  }
  return result as T;
}

/** Угол к диапазону [−π, π] — чтобы переход из вращения hero не раскручивал лишние обороты. */
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

const hidden = (position: Vec3, scale: number, rotation: Vec3 = [0, 0, 0]): ActorPose => ({
  position,
  rotation,
  scale,
  visibility: 0,
});

// ─── Режиссёр ────────────────────────────────────────────────────────────────

export function direct({ clock, intro, spin, aspect, accents }: DirectorInput): StoryPose {
  const rim = { venice: accents?.venice ?? WHITE, memory: accents?.memory ?? WHITE, gpu: accents?.gpu ?? WHITE };
  const wide = aspect >= 1;
  /** Сдвиг экспоната вправо на десктопе: слева остаётся место тексту */
  const side = wide ? 1 : 0;
  /** На узких экранах камера отходит дальше */
  const zoom = wide ? 1 : 0.72 / Math.max(aspect, 0.5);
  const boardScale = wide ? 1 : 0.62;
  const boardY = BOARD_Y;

  // Каждая сцена строится поверх предыдущей — кэшируем позы в пределах кадра
  const cache = new Map<SceneId, StoryPose>();
  const poseIn = (scene: SceneId): StoryPose => {
    const cached = cache.get(scene);
    if (cached) return cached;
    const pose = compose(scene);
    cache.set(scene, pose);
    return pose;
  };

  const compose = (scene: SceneId): StoryPose => {
    switch (scene) {
      // ── 1. Hero: луч, процессор поднимается в нём ─────────────────────────
      case 'hero': {
        const rise = easeOut(intro.model);
        return {
          camera: { position: [0, 1.75, 7.6 * zoom], target: [0, 0.12, 0] },
          stage: { beam: intro.beam, dust: intro.beam, floor: intro.traces, podium: 0, rim: rim.venice },
          venice: {
            position: [0, -1.6 + 1.62 * rise, 0],
            rotation: [0.32, wrap(spin) + (1 - rise) * 3.4, 0],
            scale: 0.95,
            visibility: 1,
            explode: 0,
            lit: 0,
          },
          // 9965 ждёт слева в темноте — «выезжает рядом», не пересекая кадр
          turin: hidden([-4.5, -0.1, -2.5], 0.72, [0.45, 0.9, 0]),
          memory: { ...hidden([0.6, -3.2, -1.5], 1.2), explode: 0, tsv: 0, edge: 0 },
          ghosts: { visibility: 0, spread: 1 },
          gpu: { ...hidden([7, 0.12, 0.2], 1.15, [0.1, -1.2, 0]), glow: 0 },
          stream: 0,
          board: { visibility: 0, traces: 0, reveal: 0, scale: boardScale, x: wide ? 0.75 : 0 },
          fillers: 0,
        };
      }

      // ── 2. Чиплеты: крышка уходит, чиплеты загораются по очереди ──────────
      case 'chiplets': {
        const base = poseIn('hero');
        return {
          ...base,
          camera: { position: [0.25 * side, 1.9, 7 * zoom], target: [0.25 * side, 0.1, 0] },
          stage: { beam: 0.35, dust: 0.3, floor: 0.45, podium: 0, rim: rim.venice },
          venice: {
            position: [1.05 * side, 0.05, 0.3],
            rotation: [0.62, -0.28 * side, 0],
            scale: wide ? 0.88 : 0.8,
            visibility: 1,
            explode: smooth(beat(clock, 'chiplets', 'lid')),
            lit: beat(clock, 'chiplets', 'cores') * 8,
          },
        };
      }

      // ── 3. Поколения: 9965 выезжает из тьмы, оба на подиуме ───────────────
      case 'generations': {
        const base = poseIn('chiplets');
        const x = wide ? 1.2 : 0.62;
        const s = wide ? 0.72 : 0.42;
        return {
          ...base,
          camera: { position: [0, 1.9, 7.4 * zoom], target: [0, -0.3, 0] },
          stage: { beam: 0.55, dust: 0.25, floor: 0, podium: 1, rim: rim.venice },
          venice: { position: [x, -0.32, 0], rotation: [0.45, -0.4, 0], scale: s, visibility: 1, explode: 0, lit: 0 },
          turin: { position: [-x, -0.32, 0], rotation: [0.45, 0.4, 0], scale: s, visibility: 1 },
        };
      }

      // ── 4. Память: процессоры уходят вниз, модуль расслаивается ───────────
      case 'memory': {
        const base = poseIn('generations');
        const explode = smooth(beat(clock, 'memory', 'explode'));
        const ghosts = smooth(beat(clock, 'memory', 'ghosts'));
        const merge = smooth(beat(clock, 'memory', 'merge'));
        // A — разобранный модуль, B — отходит назад, пока показываются четыре тусклых,
        // C — возвращается вперёд одним ярким модулем
        const a: ActorPose = { position: [0.6 * side, 0.15, 0.3], rotation: [0.1, wide ? -0.5 : -0.3, 0], scale: wide ? 1.2 : 0.8, visibility: 1 };
        const b: ActorPose = { position: [0.75 * side, 0.95, -1.4], rotation: [0.05, 0, 0], scale: wide ? 0.8 : 0.5, visibility: 1 };
        const c: ActorPose = { position: [0.75 * side, 0.15, 0.5], rotation: [0.05, 0, 0], scale: wide ? 1 : 0.75, visibility: 1 };
        return {
          ...base,
          camera: { position: [0, 1.5, 7.2 * zoom], target: [0.1 * side, 0.15, 0] },
          stage: { beam: 0, dust: 0, floor: 0, podium: 0, rim: rim.memory },
          venice: { ...hidden([0.8, -4.2, 0], 0.72, [0.45, -0.4, 0]), explode: 0, lit: 0 },
          turin: hidden([-0.8, -4.2, 0], 0.72, [0.45, 0.4, 0]),
          memory: {
            ...mix(mix(a, b, ghosts), c, merge),
            explode: explode * (1 - ghosts),
            tsv: explode * (1 - ghosts),
            edge: merge,
          },
          ghosts: { visibility: ghosts * (1 - merge), spread: 1 - merge },
        };
      }

      // ── 5. GPU: выезжает сбоку, в неё втекают данные ──────────────────────
      case 'gpu': {
        const base = poseIn('memory');
        return {
          ...base,
          camera: { position: [0, 1.5, 7 * zoom], target: [0.2 * side, 0.12, 0] },
          stage: { ...base.stage, rim: rim.gpu },
          // Процессоры ждут сцену сборки над кадром — оттуда и опустятся в сокет
          venice: { ...hidden([BOARD.socket.x, 5, BOARD.socket.z], 0.5), explode: 0, lit: 0 },
          memory: { ...hidden([-6, 0.15, 0.5], 1.15), explode: 0, tsv: 0, edge: 0 },
          ghosts: { visibility: 0, spread: 0 },
          gpu: {
            position: [0.95 * side, 0.12, 0.1],
            rotation: [0.12, wide ? -0.55 : -0.35, 0],
            scale: wide ? 0.98 : 0.72,
            visibility: 1,
            glow: 1,
          },
          stream: 1,
        };
      }

      // ── 6. Сборка: всё слетается в схему платы, трассы соединяют ──────────
      case 'assembly': {
        const base = poseIn('gpu');
        const bs = boardScale;
        const cpu = easeInOut(beat(clock, 'assembly', 'cpu'));
        const memory = easeInOut(beat(clock, 'assembly', 'memory'));
        const gpu = easeInOut(beat(clock, 'assembly', 'gpu'));
        const traces = beat(clock, 'assembly', 'traces');
        const slot = BOARD.dimms[4]!;
        const moduleScale = BOARD.dimmLength / 2;
        // На широком экране плата правее — слева колонка текста
        const boardX = wide ? 0.75 : 0;
        const at = (x: number, y: number, z: number): Vec3 => [boardX + x * bs, boardY + y * bs, z * bs];
        return {
          ...base,
          camera: {
            position: [boardX + 2.6 * zoom, 4.4 * zoom, 5.4 * zoom],
            target: [boardX * 0.45 + 0.1, boardY + 0.1, 0.3 * bs],
          },
          stage: { beam: 0, dust: 0, floor: 0, podium: 0, rim: rim.venice },
          venice: {
            ...mix<ActorPose>(
              { position: at(BOARD.socket.x, 2.6, BOARD.socket.z), rotation: [0, 0.8, 0], scale: 0.5 * bs, visibility: 1 },
              { position: at(BOARD.socket.x, 0.065, BOARD.socket.z), rotation: [0, 0, 0], scale: 0.5 * bs, visibility: 1 },
              cpu,
            ),
            explode: 0,
            lit: 0,
          },
          memory: {
            ...mix<ActorPose>(
              { position: at(slot.x, 2.8, slot.z), rotation: [0, Math.PI / 2, 0.4], scale: moduleScale * bs, visibility: 1 },
              { position: at(slot.x, 0.06 + 0.22 * moduleScale, slot.z), rotation: [0, Math.PI / 2, 0], scale: moduleScale * bs, visibility: 1 },
              memory,
            ),
            explode: 0,
            tsv: 0,
            edge: traces,
          },
          gpu: {
            ...mix<ActorPose>(
              { position: at(BOARD.pcie.x, 3, BOARD.pcie.z), rotation: [0, -0.6, 0], scale: 0.95 * bs, visibility: 1 },
              { position: at(BOARD.pcie.x, 0.06 + 0.45 * 0.95, BOARD.pcie.z), rotation: [0, 0, 0], scale: 0.95 * bs, visibility: 1 },
              gpu,
            ),
            glow: 1,
          },
          stream: 0,
          board: { visibility: 1, traces: traces > 0 ? 1 : 0, reveal: traces * 3.6, scale: bs, x: boardX },
          fillers: memory,
        };
      }

      // ── 7. Финал: камера отходит, схема остаётся фоном для карточек ───────
      case 'footer': {
        const base = poseIn('assembly');
        return {
          ...base,
          camera: { position: [base.board.x + 3.2 * zoom, 6.2 * zoom, 7.2 * zoom], target: [base.board.x * 0.5, boardY - 0.4, 0] },
          board: { ...base.board, traces: 0.55 },
        };
      }
    }
  };

  // Последовательное смешивание: поза уже вошедших сцен плавно переходит в позу входящей
  let pose = poseIn('hero');
  for (const scene of SCENES.slice(1)) {
    const e = smooth(enter(clock, scene));
    if (e <= 0) break;
    pose = mix(pose, poseIn(scene), e);
  }
  return pose;
}
