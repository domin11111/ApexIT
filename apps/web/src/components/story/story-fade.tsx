'use client';

import { useRef, type ReactNode } from 'react';
import { active, span, type SceneId } from '@/story/clock';
import { useStoryFrame } from './story-scroll';

/**
 * Блок, который проявляется в окне [показ] внутри сцены и гаснет в окне [скрытие].
 * Окна — доли закреплённой фазы сцены, как биты режиссёра.
 */
export function StoryFade({
  scene,
  show,
  hide,
  className = '',
  children,
}: {
  scene: SceneId;
  show: readonly [number, number];
  hide?: readonly [number, number];
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useStoryFrame((clock) => {
    const el = ref.current;
    if (!el) return;
    const t = active(clock, scene);
    const visibility = span(t, show) * (hide ? 1 - span(t, hide) : 1);
    el.style.opacity = String(visibility);
    el.style.transform = `translateY(${(1 - visibility) * 14}px)`;
    el.style.visibility = visibility < 0.01 ? 'hidden' : 'visible';
  });

  return (
    <div ref={ref} className={className} style={{ opacity: 0 }}>
      {children}
    </div>
  );
}
