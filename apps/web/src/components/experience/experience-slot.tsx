'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { useAfterLoad } from '@/hooks/use-after-load';
import { useWebgl } from '@/hooks/use-webgl';
import { useExperience, type Quality } from '@/stores/experience';
import type { StoryModels } from '@/three/story/story-scene';
import { StaticFallback } from './static-fallback';
import { WebglBoundary } from './webgl-boundary';

// three.js и сцена — отдельный чанк: не блокируют LCP (заголовок hero — обычный HTML)
const HomeExperience = dynamic(() => import('@/three/home-experience'), { ssr: false });

/** Потолок качества по устройству: телефоны и планшеты — без bloom (medium). */
function deviceCeiling(): Quality {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  return coarse || window.innerWidth < 768 ? 'medium' : 'high';
}

export function ExperienceSlot({ models }: { models: StoryModels }) {
  const webgl = useWebgl();
  // Чанк three.js (~1 МБ) запрашивается после первой отрисовки: hero-текст (LCP) не ждёт его загрузки
  const mount = useAfterLoad();
  const setQuality = useExperience((s) => s.setQuality);

  useEffect(() => {
    if (webgl === 'supported') setQuality(deviceCeiling());
  }, [webgl, setQuality]);

  if (webgl === 'unsupported') return <StaticFallback models={models} />;
  if (webgl === 'unknown' || !mount) return null;
  return (
    <WebglBoundary>
      <HomeExperience models={models} ceiling={deviceCeiling()} />
    </WebglBoundary>
  );
}
