'use client';

import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import { useLenis } from '@/providers/smooth-scroll';
import { scrollState } from '@/stores/experience';
import { currentScene, SCENES, type SceneId } from '@/story/clock';
import { useStoryFrame } from './story-scroll';

/** Тонкая линия прогресса справа с метками глав; клик по метке — переход к главе. */
export function StoryRail() {
  const t = useTranslations('story');
  const lenis = useLenis();
  const fill = useRef<HTMLSpanElement>(null);
  const dots = useRef<Partial<Record<SceneId, HTMLButtonElement>>>({});

  useStoryFrame((clock) => {
    const last = clock.marks.footer;
    const total = Math.max(1, last.start + last.length - 1);
    if (fill.current) fill.current.style.transform = `scaleY(${Math.min(1, clock.screens / total)})`;
    const current = currentScene(clock);
    for (const id of SCENES) {
      const dot = dots.current[id];
      if (!dot) continue;
      dot.style.top = `${(clock.marks[id].start / total) * 100}%`;
      dot.dataset.active = String(id === current);
      if (id === current) dot.setAttribute('aria-current', 'step');
      else dot.removeAttribute('aria-current');
    }
  });

  const goTo = (id: SceneId) => {
    const top = scrollState.marks[id].start * window.innerHeight;
    if (lenis) lenis.scrollTo(top, { duration: 1.8 });
    else window.scrollTo({ top, behavior: 'smooth' });
  };

  return (
    <nav
      aria-label={t('rail')}
      className="fixed right-[clamp(0.75rem,2vw,1.75rem)] top-1/2 z-[var(--z-header)] hidden h-[42vh] -translate-y-1/2 lg:block"
    >
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-line" aria-hidden />
      <span
        ref={fill}
        aria-hidden
        className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 origin-top bg-accent"
        style={{ transform: 'scaleY(0)' }}
      />
      {SCENES.map((id) => (
        <button
          key={id}
          type="button"
          ref={(el) => {
            if (el) dots.current[id] = el;
          }}
          onClick={() => goTo(id)}
          aria-label={t(`scenes.${id}`)}
          data-active="false"
          className="group absolute left-1/2 flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
        >
          <span className="size-1.5 rounded-full bg-fg-tertiary transition-[background-color,scale] duration-[var(--dur-base)] group-hover:bg-fg group-data-[active=true]:scale-150 group-data-[active=true]:bg-accent" />
          <span className="pointer-events-none absolute right-6 whitespace-nowrap font-mono text-caption uppercase tracking-caption text-fg-secondary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            {t(`scenes.${id}`)}
          </span>
        </button>
      ))}
    </nav>
  );
}
