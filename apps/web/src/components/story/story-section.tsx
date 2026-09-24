import type { CSSProperties, ReactNode } from 'react';
import { SCENE_LENGTH, type SceneId } from '@/story/clock';

/**
 * Секция сторителлинга: высота — несколько экранов, внутри «липкий» экран с текстом.
 * Пока секция закреплена, скролл двигает только 3D-хореографию; на телефонах секции короче.
 * Разметку (data-scene) измеряет StoryScroll — режиссёр работает с реальными позициями.
 */
export function StorySection({
  id,
  labelledBy,
  accent,
  children,
  className = '',
}: {
  id: SceneId;
  labelledBy: string;
  /** Акцент продукта из БД: [основной, второй] — перекрашивает градиенты и свечение секции */
  accent: [string, string | null];
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      data-scene={id}
      aria-labelledby={labelledBy}
      style={{ '--len': SCENE_LENGTH[id], '--accent': accent[0], '--accent-alt': accent[1] ?? accent[0] } as CSSProperties}
      className="relative z-[var(--z-content)] h-[calc(var(--len)*82svh)] md:h-[calc(var(--len)*100svh)]"
    >
      <div className={`sticky top-0 h-[100svh] overflow-hidden ${className}`}>
        <div className="mx-auto h-full max-w-[var(--layout-max)] px-[var(--layout-gutter)] pb-[clamp(1.5rem,6vh,4rem)] pt-[calc(var(--layout-header-h)+clamp(1rem,5vh,3rem))]">
          {children}
        </div>
      </div>
    </section>
  );
}
