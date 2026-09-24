'use client';

import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '@/hooks/use-media-query';
import { gsap, ScrollTrigger, useGSAP } from '@/lib/gsap';
import { scrollState, storyClock } from '@/stores/experience';
import { SCENES, type SceneId, type StoryClock } from '@/story/clock';

/**
 * Измеряет секции сторителлинга ([data-scene]) и пишет позицию/скорость скролла в scrollState.
 * Разметку пересчитывает ScrollTrigger при любом ресайзе (onRefresh).
 */
export function StoryScroll() {
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    scrollState.reduced = reducedMotion;
  }, [reducedMotion]);

  useGSAP(() => {
    const measure = () => {
      const vh = window.innerHeight;
      for (const element of document.querySelectorAll<HTMLElement>('[data-scene]')) {
        const id = element.dataset.scene as SceneId;
        if (!SCENES.includes(id)) continue;
        scrollState.marks[id] = { start: element.offsetTop / vh, length: element.offsetHeight / vh };
      }
      scrollState.screens = window.scrollY / vh;
    };
    measure();

    const trigger = ScrollTrigger.create({
      start: 0,
      end: 'max',
      onUpdate: (self) => {
        scrollState.screens = self.scroll() / window.innerHeight;
        scrollState.velocity = self.getVelocity() / window.innerHeight;
      },
      onRefresh: measure,
    });
    // Скорость затухает, когда скролл остановился (onUpdate больше не приходит)
    const decay = () => {
      scrollState.velocity *= 0.9;
    };
    gsap.ticker.add(decay);

    return () => {
      trigger.kill();
      gsap.ticker.remove(decay);
    };
  });

  return null;
}

/** Колбэк на каждый кадр GSAP с часами сторителлинга — для HTML-счётчиков, баров и блоков. */
export function useStoryFrame(callback: (clock: StoryClock) => void) {
  const latest = useRef(callback);
  useEffect(() => {
    latest.current = callback;
  });
  useEffect(() => {
    const tick = () => latest.current(storyClock());
    gsap.ticker.add(tick);
    tick();
    return () => gsap.ticker.remove(tick);
  }, []);
}
