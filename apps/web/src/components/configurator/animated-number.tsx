'use client';

import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '@/hooks/use-media-query';
import { gsap } from '@/lib/gsap';

/**
 * Число, которое «доезжает» до нового значения при каждом изменении сборки.
 * Пишем прямо в textContent — без ре-рендеров на каждом кадре. Скринридер читает итог.
 */
export function AnimatedNumber({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const state = { n: shown.current };
    const tween = gsap.to(state, {
      n: value,
      duration: reducedMotion ? 0 : 0.7,
      ease: 'power3.out',
      onUpdate: () => {
        shown.current = state.n;
        el.textContent = format(state.n);
      },
    });
    return () => {
      tween.kill();
    };
  }, [value, format, reducedMotion]);

  return (
    <span className={className}>
      <span ref={ref} aria-hidden className="tabular-nums">
        {format(value)}
      </span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
