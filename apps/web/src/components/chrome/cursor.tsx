'use client';

import { useEffect, useRef } from 'react';
import { useFinePointer, usePrefersReducedMotion } from '@/hooks/use-media-query';
import { gsap } from '@/lib/gsap';

const INTERACTIVE = 'a, button, [role="button"], label, select, summary, [data-cursor]';

/**
 * Собственный курсор: круг, который плавно следует за указателем и увеличивается над интерактивом.
 * Только для мыши/тачпада и без prefers-reduced-motion — иначе остаётся системный курсор.
 */
export function Cursor() {
  const finePointer = useFinePointer();
  const reducedMotion = usePrefersReducedMotion();
  const enabled = finePointer && !reducedMotion;
  const dot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = dot.current;
    if (!enabled || !el) return;
    const html = document.documentElement;
    html.dataset.cursor = 'custom';

    const xTo = gsap.quickTo(el, 'x', { duration: 0.35, ease: 'power3' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.35, ease: 'power3' });
    const onMove = (event: PointerEvent) => {
      xTo(event.clientX);
      yTo(event.clientY);
      el.dataset.visible = 'true';
    };
    const onOver = (event: PointerEvent) => {
      el.dataset.active = String(Boolean((event.target as Element | null)?.closest?.(INTERACTIVE)));
    };
    const onLeave = () => {
      el.dataset.visible = 'false';
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerover', onOver, { passive: true });
    html.addEventListener('pointerleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerover', onOver);
      html.removeEventListener('pointerleave', onLeave);
      delete html.dataset.cursor;
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      ref={dot}
      aria-hidden
      data-visible="false"
      data-active="false"
      className="pointer-events-none fixed left-0 top-0 z-[var(--z-cursor)] -ml-[7px] -mt-[7px] size-[var(--cursor-size)] rounded-full border border-fg/80 mix-blend-difference transition-[scale,opacity,background-color] duration-[var(--dur-base)] ease-[var(--curve-out-expo)] data-[active=true]:scale-400 data-[active=true]:bg-fg data-[visible=false]:opacity-0"
    />
  );
}
