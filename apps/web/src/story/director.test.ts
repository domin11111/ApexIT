import { describe, expect, it } from 'vitest';
import { ASSEMBLY, HERO_DIMM } from './assembly';
import { BEATS, defaultMarks, type SceneId, type StoryClock } from './clock';
import { direct, type StoryPose } from './director';

const marks = defaultMarks();
const INTRO_DONE = { beam: 1, model: 1, traces: 1 };

/** Поза в точке сцены: progress — доля закреплённой фазы (0…1). */
function at(scene: SceneId, progress: number, { aspect = 16 / 9, reduced = false } = {}): StoryPose {
  const { start, length } = marks[scene];
  const clock: StoryClock = { screens: start + progress * (length - 1), marks, reduced };
  return direct({ clock, intro: INTRO_DONE, spin: 0, aspect });
}

const visible = (pose: StoryPose) =>
  (['venice', 'turin', 'memory', 'gpu'] as const).filter((actor) => pose[actor].visibility > 0.5);

describe('режиссёр главной', () => {
  it('hero: только Venice в луче', () => {
    const pose = direct({ clock: { screens: 0, marks, reduced: false }, intro: INTRO_DONE, spin: 0, aspect: 16 / 9 });
    expect(visible(pose)).toEqual(['venice']);
    expect(pose.stage.beam).toBe(1);
    expect(pose.venice.explode).toBe(0);
  });

  it('hero до конца интро: процессор ещё под сценой', () => {
    const pose = direct({ clock: { screens: 0, marks, reduced: false }, intro: { beam: 0, model: 0, traces: 0 }, spin: 0, aspect: 1.6 });
    expect(pose.venice.position[1]).toBeLessThan(-1);
  });

  it('чиплеты: сначала уходит крышка, потом по очереди загораются 8 CCD', () => {
    const lidMid = at('chiplets', BEATS.chiplets.lid[1] / 2);
    expect(lidMid.venice.explode).toBeGreaterThan(0);
    expect(lidMid.venice.lit).toBe(0);

    const end = at('chiplets', 1);
    expect(end.venice.explode).toBe(1);
    expect(end.venice.lit).toBe(8);
  });

  it('поколения: два процессора на подиуме, 9965 слева, Venice справа', () => {
    const pose = at('generations', 0.5);
    expect(visible(pose)).toEqual(['venice', 'turin']);
    expect(pose.stage.podium).toBe(1);
    expect(pose.turin.position[0]).toBeLessThan(0);
    expect(pose.venice.position[0]).toBeGreaterThan(0);
    expect(pose.venice.explode).toBe(0);
  });

  it('память: процессоры ушли вниз, модуль расслаивается, затем 4 тусклых схлопываются в один', () => {
    const exploded = at('memory', BEATS.memory.explode[1]);
    expect(visible(exploded)).toEqual(['memory']);
    expect(exploded.memory.explode).toBe(1);
    expect(exploded.venice.position[1]).toBeLessThan(-3);

    const ghosts = at('memory', BEATS.memory.ghosts[1]);
    expect(ghosts.ghosts.visibility).toBe(1);
    expect(ghosts.memory.explode).toBe(0);

    const merged = at('memory', 1);
    expect(merged.ghosts.visibility).toBe(0);
    expect(merged.memory.edge).toBe(1);
  });

  it('GPU: выезжает сбоку, в неё идёт поток данных', () => {
    const entering = direct({
      clock: { screens: marks.gpu.start - 0.5, marks, reduced: false },
      intro: INTRO_DONE,
      spin: 0,
      aspect: 16 / 9,
    });
    expect(entering.gpu.position[0]).toBeGreaterThan(2);
    const pose = at('gpu', 0.5);
    expect(visible(pose)).toEqual(['gpu']);
    expect(pose.stream).toBe(1);
  });

  it('сборка: процессор в сокете, модуль в слоте, видеокарта в PCIe, трассы прорисованы', () => {
    const pose = at('assembly', 1);
    expect(visible(pose)).toEqual(['venice', 'memory', 'gpu']);
    // Плата на широком экране сдвинута вправо — детали встают в её слоты с тем же сдвигом
    expect(pose.board.x).toBeGreaterThan(0);
    const { socket, dimms, pcie } = ASSEMBLY;
    expect(pose.venice.position[0]).toBeCloseTo(pose.board.x + socket.position[0], 5);
    expect(pose.venice.position[2]).toBeCloseTo(socket.position[2], 5);
    expect(pose.venice.scale).toBeCloseTo(socket.scale, 5);
    expect(pose.memory.position[0]).toBeCloseTo(pose.board.x + dimms[HERO_DIMM]!.position[0], 5);
    expect(pose.memory.rotation[1]).toBeCloseTo(dimms[HERO_DIMM]!.yaw, 5);
    expect(pose.gpu.position[0]).toBeCloseTo(pose.board.x + pcie[0]!.position[0], 5);
    expect(pose.board.reveal).toBe(1);
    expect(pose.fillers).toBe(1);
  });

  it('портрет: плата по центру и меньше, детали — в тех же слотах', () => {
    const pose = at('assembly', 1, { aspect: 0.46 });
    expect(pose.board.x).toBe(0);
    expect(pose.board.scale).toBeLessThan(1);
    expect(pose.venice.position[0]).toBeCloseTo(ASSEMBLY.socket.position[0] * pose.board.scale, 5);
    expect(pose.venice.scale).toBeCloseTo(ASSEMBLY.socket.scale * pose.board.scale, 5);
  });

  it('скролл обратим: одинаковая позиция — одинаковая поза', () => {
    expect(at('memory', 0.4)).toEqual(at('memory', 0.4));
  });

  it('prefers-reduced-motion: сцена сразу в итоговом состоянии', () => {
    const pose = at('chiplets', 0.05, { reduced: true });
    expect(pose.venice.explode).toBe(1);
    expect(pose.venice.lit).toBe(8);
  });

  it('портрет: экспонаты по центру, камера дальше', () => {
    const portrait = at('chiplets', 0.5, { aspect: 0.46 });
    const landscape = at('chiplets', 0.5);
    expect(portrait.venice.position[0]).toBe(0);
    expect(portrait.camera.position[2]).toBeGreaterThan(landscape.camera.position[2]);
  });
});
