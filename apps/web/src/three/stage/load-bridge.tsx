'use client';

import { useProgress } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { useExperience } from '@/stores/experience';

/**
 * Передаёт прелоадеру реальный прогресс загрузки 3D-ассетов (useProgress из drei).
 * Если грузить нечего (процедурные модели) — сообщаем 100% после первого отрисованного кадра.
 */
export function LoadBridge() {
  const { active, total, progress } = useProgress();
  const setSceneProgress = useExperience((s) => s.setSceneProgress);
  const firstFrame = useRef(false);

  useEffect(() => {
    if (total > 0) setSceneProgress(active ? progress / 100 : 1);
  }, [active, total, progress, setSceneProgress]);

  useFrame(() => {
    if (firstFrame.current) return;
    firstFrame.current = true;
    if (useProgress.getState().total === 0) setSceneProgress(1);
  });

  return null;
}
