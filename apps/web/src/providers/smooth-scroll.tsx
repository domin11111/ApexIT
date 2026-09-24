'use client';

import { motion } from '@apex/ui/tokens';
import Lenis from 'lenis';
import { useEffect, type ReactNode } from 'react';
import { create } from 'zustand';
import { usePrefersReducedMotion } from '@/hooks/use-media-query';
import { gsap, ScrollTrigger } from '@/lib/gsap';

const useLenisStore = create<{ lenis: Lenis | null }>()(() => ({ lenis: null }));

/** Экземпляр Lenis для программного скролла (null — плавный скролл выключен). */
export const useLenis = () => useLenisStore((s) => s.lenis);

/**
 * Глобальный плавный скролл, синхронизированный с GSAP ScrollTrigger:
 * Lenis двигается в тике GSAP, а ScrollTrigger пересчитывается на каждое событие Lenis.
 * При prefers-reduced-motion остаётся нативный скролл.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (reducedMotion) return;

    const lenis = new Lenis({
      lerp: motion.lenis.lerp,
      wheelMultiplier: motion.lenis.wheelMultiplier,
      touchMultiplier: motion.lenis.touchMultiplier,
      autoRaf: false,
    });
    lenis.on('scroll', ScrollTrigger.update);

    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    useLenisStore.setState({ lenis });

    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
      useLenisStore.setState({ lenis: null });
    };
  }, [reducedMotion]);

  return children;
}
