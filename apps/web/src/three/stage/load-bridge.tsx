'use client';

import { useProgress } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { useExperience } from '@/stores/experience';

/**
 * Передаёт прелоадеру реальный прогресс загрузки 3D-ассетов (useProgress из drei).
 * Если грузить нечего (процедурные модели) — сообщаем 100% после первого отрисованного кадра.
 *
 * Подписка — без хука: useGLTF начинает загрузку во время рендера модели, и менеджер загрузки
 * обновляет стор прогресса синхронно. Хук useProgress здесь дал бы setState посреди чужого рендера,
 * поэтому читаем стор напрямую и переносим обновление на следующий кадр.
 */
export function LoadBridge() {
  const setSceneProgress = useExperience((s) => s.setSceneProgress);
  const firstFrame = useRef(false);

  useEffect(() => {
    let raf = 0;
    const push = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const { active, total, progress } = useProgress.getState();
        if (total > 0) setSceneProgress(active ? progress / 100 : 1);
      });
    };
    push();
    const unsubscribe = useProgress.subscribe(push);
    return () => {
      unsubscribe();
      cancelAnimationFrame(raf);
    };
  }, [setSceneProgress]);

  useFrame(() => {
    if (firstFrame.current) return;
    firstFrame.current = true;
    if (useProgress.getState().total === 0) setSceneProgress(1);
  });

  return null;
}
