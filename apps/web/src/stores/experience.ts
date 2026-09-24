import { create } from 'zustand';
import { defaultMarks, type StoryClock } from '@/story/clock';

/** loading — прелоадер на экране; revealing — шторка уходит, стартует интро; ready — всё показано. */
export type Phase = 'loading' | 'revealing' | 'ready';

/**
 * high — полная постобработка; medium — без bloom и аберраций (телефоны, просадка FPS);
 * low — без постобработки и частиц. Переключает PerformanceMonitor.
 */
export type Quality = 'high' | 'medium' | 'low';

type ExperienceState = {
  phase: Phase;
  /** Прогресс загрузки 3D-ассетов, 0…1 (пишет сцена, читает прелоадер) */
  sceneProgress: number;
  webgl: 'unknown' | 'supported' | 'unsupported';
  quality: Quality;
  setPhase: (phase: Phase) => void;
  setSceneProgress: (progress: number) => void;
  setWebgl: (webgl: ExperienceState['webgl']) => void;
  setQuality: (quality: Quality) => void;
};

export const useExperience = create<ExperienceState>()((set) => ({
  phase: 'loading',
  sceneProgress: 0,
  webgl: 'unknown',
  quality: 'high',
  setPhase: (phase) => {
    // Метки для замеров (Lighthouse, RUM): сколько длился прелоадер
    if (typeof performance !== 'undefined') performance.mark(`apex:${phase}`);
    set({ phase });
  },
  setSceneProgress: (sceneProgress) => set({ sceneProgress }),
  setWebgl: (webgl) => set({ webgl }),
  setQuality: (quality) => set({ quality }),
}));

/**
 * Позиция скролла для сторителлинга. Обычный изменяемый объект, а не состояние React:
 * ScrollTrigger пишет в него на каждом кадре, 3D-сцена и HTML-счётчики читают — без ре-рендеров.
 */
export const scrollState = {
  /** Позиция в экранах (высотах вьюпорта) */
  screens: 0,
  /** Скорость скролла, экранов в секунду (со знаком) — крутит вентиляторы GPU */
  velocity: 0,
  /** Начало и длина секций в экранах — измеряет StoryScroll */
  marks: defaultMarks(),
  reduced: false,
};

/** Часы сторителлинга на текущий момент. */
export function storyClock(): StoryClock {
  return { screens: scrollState.screens, marks: scrollState.marks, reduced: scrollState.reduced };
}
