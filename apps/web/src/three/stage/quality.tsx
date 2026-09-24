'use client';

import { PerformanceMonitor } from '@react-three/drei';
import { useExperience, type Quality } from '@/stores/experience';

const ORDER: Quality[] = ['low', 'medium', 'high'];

export const DPR: Record<Quality, [number, number]> = {
  high: [1, 2],
  medium: [1, 1.5],
  low: [1, 1],
};

/**
 * Адаптивное качество: при просадке FPS снижаем уровень (DPR, постобработка, частицы),
 * при запасе — поднимаем, но не выше потолка устройства. После трёх «качелей» фиксируем low.
 */
export function QualityMonitor({ ceiling }: { ceiling: Quality }) {
  const setQuality = useExperience((s) => s.setQuality);
  const step = (delta: 1 | -1) => {
    const current = ORDER.indexOf(useExperience.getState().quality);
    const next = Math.min(ORDER.indexOf(ceiling), Math.max(0, current + delta));
    setQuality(ORDER[next]!);
  };

  return (
    <PerformanceMonitor
      flipflops={3}
      onIncline={() => step(1)}
      onDecline={() => step(-1)}
      onFallback={() => setQuality('low')}
    />
  );
}
