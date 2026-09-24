'use client';

import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { useEffect, useState, type CSSProperties } from 'react';
import { useMediaQuery, usePrefersReducedMotion } from '@/hooks/use-media-query';
import { Link } from '@/i18n/navigation';
import { useExperience } from '@/stores/experience';
import type { CompareModel } from '@/three/compare/compare-stage';

const CompareStage = dynamic(() => import('@/three/compare/compare-stage'), { ssr: false });

export type CompareItem = CompareModel & { title: string };

/** Подиум с моделями, подписи под ними и кнопка «скопировать ссылку» на это сравнение. */
export function CompareStagePanel({ items }: { items: CompareItem[] }) {
  const t = useTranslations('compare');
  const reducedMotion = usePrefersReducedMotion();
  const quality = useMediaQuery('(pointer: coarse), (max-width: 767px)') ? 'medium' : 'high';
  const webgl = useExperience((s) => s.webgl);
  const setWebgl = useExperience((s) => s.setWebgl);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (useExperience.getState().webgl !== 'unknown') return;
    const canvas = document.createElement('canvas');
    setWebgl(canvas.getContext('webgl2') ?? canvas.getContext('webgl') ? 'supported' : 'unsupported');
  }, [setWebgl]);

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch {
      // Нет доступа к буферу — ссылка и так в адресной строке
    }
  };

  return (
    <div>
      <div className="relative h-[42svh] min-h-[300px] overflow-hidden rounded-xl border border-line lg:h-[56vh]">
        {webgl !== 'unsupported' && (
          <CompareStage
            models={items.map(({ slug, preset, accent, identity }) => ({ slug, preset, accent, identity }))}
            quality={quality}
            reducedMotion={reducedMotion}
          />
        )}
        <p className="pointer-events-none absolute left-4 top-4 font-mono text-caption uppercase tracking-caption text-fg-tertiary" aria-hidden>
          {t('viewerHint')}
        </p>
        <p className="sr-only">{t('viewerLabel')}</p>
        <button
          type="button"
          onClick={() => void share()}
          className="glass absolute right-3 top-3 h-9 px-4 text-small text-fg-secondary hover:text-fg"
          aria-live="polite"
        >
          {copied ? t('copied') : t('share')}
        </button>
      </div>

      {/* Подписи — в тех же колонках, что и модели на подиуме */}
      <ul className="mt-4 grid grid-cols-[repeat(var(--cols),minmax(0,1fr))] gap-4 text-center" style={{ '--cols': items.length } as CSSProperties}>
        {items.map((item) => (
          <li key={item.slug}>
            <p className="text-body font-medium">{item.title}</p>
            <Link href={`/products/${item.slug}`} data-transition-label={item.title} className="mt-1 inline-block text-small text-fg-tertiary hover:text-accent">
              {t('open')} <span aria-hidden>→</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
