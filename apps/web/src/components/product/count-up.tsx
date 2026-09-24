'use client';

import { useRef } from 'react';
import { usePrefersReducedMotion } from '@/hooks/use-media-query';
import { parseDisplayNumber } from '@/lib/display-number';
import { gsap, useGSAP } from '@/lib/gsap';

/**
 * Крупная цифра характеристики, которая «собирается» при появлении на экране:
 * анимируется только число, префикс и единицы остаются как в данных. Текст для скринридеров — итоговый.
 */
export function CountUp({ value, locale, className }: { value: string; locale: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const parsed = parseDisplayNumber(value);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || !parsed || reducedMotion) return;
      const format = new Intl.NumberFormat(locale, {
        minimumFractionDigits: parsed.decimals,
        maximumFractionDigits: parsed.decimals,
        useGrouping: parsed.grouped,
      });
      const state = { n: 0 };
      gsap.to(state, {
        n: parsed.number,
        duration: 1.6,
        ease: 'expo.out',
        scrollTrigger: { trigger: el, start: 'top 85%', once: true },
        onUpdate: () => {
          el.textContent = `${parsed.prefix}${format.format(state.n)}${parsed.suffix}`;
        },
      });
    },
    { dependencies: [value, reducedMotion] },
  );

  return (
    <span className={className}>
      <span ref={ref} aria-hidden className="tabular-nums">
        {value}
      </span>
      <span className="sr-only">{value}</span>
    </span>
  );
}
