'use client';

import { useRef } from 'react';
import { usePrefersReducedMotion } from '@/hooks/use-media-query';
import { gsap, useGSAP } from '@/lib/gsap';
import { RevealText } from '../story/reveal-text';

export type Scenario = { key: string; title: string; body: string };

/**
 * «Для чего создан»: секция закрепляется, а карточки сценариев едут по горизонтали вместе со скроллом.
 * При prefers-reduced-motion и на узких экранах — обычная горизонтальная прокрутка без закрепления.
 */
export function Scenarios({ title, items, accent }: { title: string; items: Scenario[]; accent: string }) {
  const section = useRef<HTMLElement>(null);
  const track = useRef<HTMLOListElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  useGSAP(
    () => {
      if (reducedMotion) return;
      const mm = gsap.matchMedia();
      mm.add('(min-width: 768px)', () => {
        const el = track.current;
        if (!el) return;
        const distance = () => Math.max(0, el.scrollWidth - el.clientWidth);
        gsap.to(el, {
          x: () => -distance(),
          ease: 'none',
          scrollTrigger: {
            trigger: section.current,
            start: 'top top',
            end: () => `+=${distance() + window.innerHeight * 0.4}`,
            pin: true,
            scrub: 0.6,
            invalidateOnRefresh: true,
          },
        });
      });
      return () => mm.revert();
    },
    { dependencies: [reducedMotion] },
  );

  return (
    <section ref={section} aria-labelledby="scenarios-title" className="flex min-h-[100svh] flex-col justify-center overflow-hidden py-16">
      <div className="mx-auto w-full max-w-[var(--layout-max)] px-[var(--layout-gutter)]">
        <RevealText id="scenarios-title" className="text-h1">
          {title}
        </RevealText>
      </div>
      <ol
        ref={track}
        className="mt-12 flex snap-x gap-5 overflow-x-auto px-[var(--layout-gutter)] pb-4 md:overflow-visible md:pl-[max(var(--layout-gutter),calc((100vw-var(--layout-max))/2+var(--layout-gutter)))]"
      >
        {items.map((item, i) => (
          <li key={item.key} className="glass w-[min(82vw,26rem)] shrink-0 snap-start p-8 md:w-[30rem] md:p-10">
            <span className="font-mono text-caption" style={{ color: accent }}>
              0{i + 1}
            </span>
            <h3 className="mt-6 text-h2">{item.title}</h3>
            <p className="mt-4 text-body text-fg-secondary">{item.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
