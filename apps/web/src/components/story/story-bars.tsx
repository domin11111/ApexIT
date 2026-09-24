'use client';

import { useRef } from 'react';
import { beat } from '@/story/clock';
import { useStoryFrame } from './story-scroll';

export type BarRow = {
  key: string;
  label: string;
  cells: Array<{ value: string | null; ratio: number | null; isBest: boolean }>;
};

/**
 * Анимированные бары сравнения поколений. Длина — доля от лучшего значения (ratio из /compare),
 * рост идёт по биту generations.bars с задержкой между строками.
 * Сами значения — обычный текст таблицы (доступен скринридерам и поисковикам).
 */
export function StoryBars({ rows, names, accents }: { rows: BarRow[]; names: [string, string]; accents: [string, string] }) {
  const bars = useRef<HTMLSpanElement[]>([]);

  useStoryFrame((clock) => {
    const t = beat(clock, 'generations', 'bars');
    bars.current.forEach((bar, i) => {
      const row = Math.floor(i / 2);
      const local = Math.min(1, Math.max(0, (t - row * 0.15) / 0.7));
      const eased = 1 - Math.pow(1 - local, 3);
      bar.style.transform = `scaleX(${Number(bar.dataset.ratio ?? 0) * eased})`;
    });
  });

  return (
    <table className="w-full border-separate border-spacing-y-4 text-small">
      <thead className="sr-only">
        <tr>
          <th scope="col" />
          <th scope="col">{names[0]}</th>
          <th scope="col">{names[1]}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, r) => (
          <tr key={row.key} className="grid gap-2 md:grid-cols-[10rem_1fr]">
            <th scope="row" className="text-left font-normal text-fg-secondary">
              {row.label}
            </th>
            <td className="grid gap-1.5">
              {row.cells.map((cell, c) => (
                <span key={c} className="grid grid-cols-[1fr_auto] items-center gap-3">
                  <span className="relative h-1.5 overflow-hidden rounded-pill bg-line">
                    <span
                      ref={(el) => {
                        if (el) bars.current[r * 2 + c] = el;
                      }}
                      data-ratio={cell.ratio ?? 0}
                      className="absolute inset-0 origin-left rounded-pill"
                      style={{
                        transform: 'scaleX(0)',
                        background: accents[c],
                        boxShadow: cell.isBest ? `0 0 16px ${accents[c]}` : undefined,
                      }}
                    />
                  </span>
                  <span className={`font-mono tabular-nums ${cell.isBest ? 'text-fg' : 'text-fg-secondary'}`}>
                    {cell.value ?? '—'}
                  </span>
                </span>
              ))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
