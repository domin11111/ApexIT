'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { useExperience, type Quality } from '@/stores/experience';
import type { HeroModel } from '@/three/scenes/hero-scene';
import { StaticFallback } from './static-fallback';

// three.js и сцена — отдельный чанк: не блокируют LCP (заголовок hero — обычный HTML)
const HomeExperience = dynamic(() => import('@/three/home-experience'), { ssr: false });

function detectWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Потолок качества по устройству: телефоны и планшеты — без bloom (medium). */
function deviceCeiling(): Quality {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  return coarse || window.innerWidth < 768 ? 'medium' : 'high';
}

export function ExperienceSlot({ hero }: { hero: HeroModel }) {
  const webgl = useExperience((s) => s.webgl);
  const setWebgl = useExperience((s) => s.setWebgl);
  const setQuality = useExperience((s) => s.setQuality);

  useEffect(() => {
    const supported = detectWebGL();
    setWebgl(supported ? 'supported' : 'unsupported');
    if (supported) setQuality(deviceCeiling());
  }, [setWebgl, setQuality]);

  if (webgl === 'unsupported') return <StaticFallback accent={hero.accent} accentAlt={hero.accentAlt} />;
  if (webgl === 'unknown') return null;
  return <HomeExperience hero={hero} ceiling={deviceCeiling()} />;
}
