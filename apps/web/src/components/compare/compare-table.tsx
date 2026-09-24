'use client';

import type { CompareRow, ProductSummaryDto } from '@apex/contracts';
import { useRef, type CSSProperties } from 'react';
import { usePrefersReducedMotion } from '@/hooks/use-media-query';
import { gsap, ScrollTrigger, useGSAP } from '@/lib/gsap';

/**
 * Таблица сравнения: строки по группам характеристик, лучшее значение подсвечено,
 * бары — доля от максимума в строке, «вырастают» при появлении на экране.
 * На телефоне подпись строки занимает всю ширину, значения — колонками под ней.
 */
export function CompareTable({
  rows,
  products,
  groupTitles,
  bestLabel,
}: {
  rows: CompareRow[];
  products: ProductSummaryDto[];
  groupTitles: Record<string, string>;
  bestLabel: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  useGSAP(
    () => {
      if (reducedMotion) return;
      const bars = gsap.utils.toArray<HTMLElement>('[data-bar]');
      gsap.set(bars, { scaleX: 0 });
      ScrollTrigger.batch(bars, {
        start: 'top 92%',
        once: true,
        onEnter: (batch) => gsap.to(batch, { scaleX: 1, duration: 1.1, ease: 'expo.out', stagger: 0.04 }),
      });
    },
    { scope: root, dependencies: [rows, reducedMotion], revertOnUpdate: true },
  );

  // Группы — в порядке первого появления
  const groups: Array<{ key: string; rows: CompareRow[] }> = [];
  for (const row of rows) {
    const group = groups.find((g) => g.key === row.groupKey);
    if (group) group.rows.push(row);
    else groups.push({ key: row.groupKey, rows: [row] });
  }

  const columns = { '--cols': products.length } as CSSProperties;
  const grid = 'grid gap-x-4 grid-cols-[repeat(var(--cols),minmax(0,1fr))] md:grid-cols-[minmax(10rem,1.3fr)_repeat(var(--cols),minmax(0,1fr))]';

  return (
    <div ref={root} style={columns}>
      {/* Шапка с названиями — прилипает под навигацией */}
      <div className={`${grid} sticky top-[var(--layout-header-h)] z-10 border-b border-line bg-void/85 py-4 backdrop-blur-md`}>
        <span className="hidden md:block" aria-hidden />
        {products.map((product) => (
          <span key={product.slug} className="flex items-center gap-2 text-small font-medium">
            <span className="size-2 shrink-0 rounded-full" style={{ background: product.accentColor }} aria-hidden />
            <span className="truncate">{product.name}</span>
          </span>
        ))}
      </div>

      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`group-${group.key}`} className="mt-10">
          <h3 id={`group-${group.key}`} className="eyebrow mb-2">
            {groupTitles[group.key] ?? group.key}
          </h3>
          <dl className="divide-y divide-line">
            {group.rows.map((row) => (
              <div key={row.key} className={`${grid} gap-y-2 py-4`}>
                <dt className="col-span-full text-small text-fg-secondary md:col-span-1">{row.label}</dt>
                {row.cells.map((cell, i) => {
                  const product = products[i]!;
                  return (
                    <dd key={product.slug} className="min-w-0">
                      <span className={`block font-mono text-small tabular-nums ${cell.isBest ? 'text-fg' : 'text-fg-secondary'}`}>
                        {cell.value ?? '—'}
                        {cell.isBest && (
                          <span className="ml-2 font-mono text-caption uppercase tracking-caption" style={{ color: product.accentColor }}>
                            {bestLabel}
                          </span>
                        )}
                      </span>
                      {cell.ratio !== null && (
                        <span className="mt-2 block h-1 overflow-hidden rounded-full bg-white/5" aria-hidden>
                          <span
                            data-bar
                            className="block h-full origin-left rounded-full"
                            style={{
                              width: `${cell.ratio * 100}%`,
                              background: product.accentColor,
                              opacity: cell.isBest ? 1 : 0.45,
                              boxShadow: cell.isBest ? `0 0 12px ${product.accentColor}` : undefined,
                            }}
                          />
                        </span>
                      )}
                    </dd>
                  );
                })}
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
