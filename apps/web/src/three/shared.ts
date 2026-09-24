/**
 * Общие uniform'ы всех шейдеров сцены. Время обновляет <SceneClock /> один раз за кадр,
 * материалы ссылаются на тот же объект — без обхода сцены.
 */
export const sharedUniforms = {
  uTime: { value: 0 },
};

/** Детерминированный генератор случайных чисел (mulberry32): процедурные модели одинаковы при каждой сборке. */
export function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const hasDom = () => typeof document !== 'undefined';
