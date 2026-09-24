'use client';

import { useMemo, useRef } from 'react';
import { beat, type BEATS } from '@/story/clock';
import { useStoryFrame } from './story-scroll';

type BeatRef = { [S in keyof typeof BEATS]: { scene: S; beat: keyof (typeof BEATS)[S] } }[keyof typeof BEATS];

/**
 * Счётчик, синхронный с 3D: значение = итог × прогресс бита сцены.
 * Анимированные цифры скрыты от скринридеров; итог доступен сразу (sr-only) и объявляется
 * через aria-live один раз — когда счётчик доходит до конца.
 */
export function StoryCounter({
  at,
  value,
  locale,
  label,
  className = '',
}: {
  at: BeatRef;
  value: number;
  locale: string;
  label: string;
  className?: string;
}) {
  const digits = useRef<HTMLSpanElement>(null);
  const live = useRef<HTMLSpanElement>(null);
  const format = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }), [locale]);
  const final = `${format.format(value)} ${label}`;

  useStoryFrame((clock) => {
    const t = beat(clock, at.scene as never, at.beat as never);
    if (digits.current) digits.current.textContent = format.format(Math.round(value * t));
    if (t >= 1 && live.current && live.current.textContent !== final) live.current.textContent = final;
  });

  return (
    <span className={className}>
      <span ref={digits} aria-hidden className="font-mono tabular-nums">
        {format.format(value)}
      </span>
      <span className="sr-only">{final}</span>
      <span ref={live} aria-live="polite" className="sr-only" />
    </span>
  );
}
