'use client';

import { useEffect } from 'react';
import { useExperience } from '@/stores/experience';

function detectWebGL(): boolean {
  // ?webgl=off — посмотреть фолбэк на рендерах без отключения аппаратного ускорения
  if (new URLSearchParams(window.location.search).get('webgl') === 'off') return false;
  // Без пробного контекста: его создание стоит десятки мс главного потока, а сцена всё равно создаст свой.
  // three.js работает только на WebGL2; если сам контекст не создастся — сцену поймает WebglBoundary
  return typeof WebGL2RenderingContext !== 'undefined';
}

/**
 * Поддержка WebGL: проверяется один раз за сессию — на той странице, куда зашли первой.
 * 'unknown' — ещё не проверено (SSR и первый кадр): ни сцену, ни фолбэк не монтируем.
 */
export function useWebgl() {
  const webgl = useExperience((s) => s.webgl);
  useEffect(() => {
    const { webgl: current, setWebgl } = useExperience.getState();
    if (current === 'unknown') setWebgl(detectWebGL() ? 'supported' : 'unsupported');
  }, []);
  return webgl;
}
