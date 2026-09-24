'use client';

import type { CSSProperties, PointerEvent, ReactNode } from 'react';

/**
 * Карточка со свечением границы, которое следует за курсором:
 * позиция указателя пишется в --mx/--my, радиальный градиент в цвете акцента рисует ::before.
 */
export function GlowCard({ accent, className = '', children }: { accent: string; className?: string; children: ReactNode }) {
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty('--my', `${event.clientY - rect.top}px`);
  };

  return (
    <div
      onPointerMove={onPointerMove}
      style={{ '--accent': accent } as CSSProperties}
      className={`glass group relative overflow-hidden before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-[radial-gradient(360px_circle_at_var(--mx,50%)_var(--my,50%),color-mix(in_oklab,var(--accent)_24%,transparent),transparent_65%)] before:opacity-0 before:transition-opacity before:duration-[var(--dur-slow)] hover:before:opacity-100 ${className}`}
    >
      {children}
    </div>
  );
}
