'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { renderFor, type Render, type RenderView } from '@/lib/renders';
import type { StoryModels } from '@/three/story/story-scene';
import { RenderImage } from '../ui/render-image';

/**
 * Без WebGL: тот же «зал» — луч сверху и статичный рендер экспоната (Blender, AVIF/WebP).
 * Рендер следует за сторителлингом: секция посередине экрана выбирает свой экспонат.
 */
export function StaticFallback({ models }: { models: StoryModels }) {
  const t = useTranslations('fallback');
  const [scene, setScene] = useState('hero');
  const accent = models.venice.accentAlt ?? models.venice.accent;

  const shots: Array<[scene: string, key: string, view: RenderView]> = [
    ['hero', models.venice.slug, 'hero'],
    ['chiplets', models.venice.slug, 'exploded'],
    ['generations', models.turin.slug, 'hero'],
    ['memory', models.memory.slug, 'hero'],
    ['gpu', models.gpu.slug, 'hero'],
    ['assembly', 'board-sp7', 'top'],
  ];
  const renders = shots.flatMap(([id, key, view]) => {
    const render = renderFor(key, view);
    return render ? [{ id, render }] : [];
  });

  // Какая секция пересекает середину экрана — та и «в луче»
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.scene;
          if (entry.isIntersecting && id) setScene(id);
        }
      },
      { rootMargin: '-50% 0px -50% 0px' },
    );
    for (const el of document.querySelectorAll('[data-scene]')) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const active = renders.some((r) => r.id === scene) ? scene : 'hero';

  return (
    <div className="pointer-events-none fixed inset-0 z-[var(--z-canvas)] overflow-hidden">
      <div
        aria-hidden
        className="absolute left-1/2 top-0 h-[75vh] w-[60vmin] -translate-x-1/2"
        style={{
          background: `radial-gradient(ellipse 50% 100% at 50% 0%, color-mix(in oklab, ${accent} 22%, rgba(230,236,255,0.18)) 0%, transparent 70%)`,
          clipPath: 'polygon(46% 0, 54% 0, 100% 100%, 0 100%)',
        }}
      />
      {renders.map(({ id, render }: { id: string; render: Render }) => (
        <div
          key={id}
          aria-hidden
          className={`absolute bottom-[16svh] left-1/2 w-[min(92vw,62svh)] -translate-x-1/2 mix-blend-lighten transition-opacity duration-700 ${id === active ? 'opacity-100' : 'opacity-0'}`}
        >
          <RenderImage
            render={render}
            alt=""
            sizes="(min-width: 768px) 62vh, 92vw"
            priority={id === 'hero'}
            className="h-auto w-full"
          />
        </div>
      ))}
      <p className="sr-only">{t('webgl')}</p>
    </div>
  );
}
