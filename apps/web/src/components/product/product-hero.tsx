'use client';

import type { HotspotDto, ModelPreset, ProductStatus } from '@apex/contracts';
import { isOrderable } from '@apex/contracts/status';
import type { LightingPreset } from '@apex/ui/tokens';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMediaQuery } from '@/hooks/use-media-query';
import { Link } from '@/i18n/navigation';
import { useExperience } from '@/stores/experience';
import { Magnetic } from '../ui/magnetic';
import { StatusBadge } from '../ui/status-badge';

const ProductViewer = dynamic(() => import('@/three/viewer/product-viewer'), { ssr: false });

export type ProductHeroData = {
  slug: string;
  brand: string;
  name: string;
  codename: string | null;
  headline: string;
  tagline: string;
  description: string;
  status: ProductStatus;
  availabilityWindow: string | null;
  availabilityNote: string | null;
  accentColor: string;
  modelPreset: ModelPreset;
  hotspots: HotspotDto[];
  highlights: Array<{ key: string; label: string; value: string }>;
};

const LIGHTING: Array<{ id: LightingPreset; label: 'lightingStudio' | 'lightingServerRoom' | 'lightingNeon' }> = [
  { id: 'studio', label: 'lightingStudio' },
  { id: 'serverRoom', label: 'lightingServerRoom' },
  { id: 'neon', label: 'lightingNeon' },
];

/** Первый экран страницы продукта: 3D-модель с хотспотами и панелью управления + описание и CTA. */
export function ProductHero({ product, locale }: { product: ProductHeroData; locale: 'ru' | 'en' }) {
  const t = useTranslations('product');
  const [exploded, setExploded] = useState(false);
  const [lighting, setLighting] = useState<LightingPreset>('studio');
  const [active, setActive] = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  // Телефоны и планшеты — без bloom (medium)
  const quality = useMediaQuery('(pointer: coarse), (max-width: 767px)') ? 'medium' : 'high';
  const webgl = useExperience((s) => s.webgl);
  const panel = useRef<HTMLDivElement>(null);

  // Прямой заход на страницу продукта: проверяем WebGL здесь, а не только на главной
  const setWebgl = useExperience((s) => s.setWebgl);
  useEffect(() => {
    if (useExperience.getState().webgl !== 'unknown') return;
    const canvas = document.createElement('canvas');
    setWebgl(canvas.getContext('webgl2') ?? canvas.getContext('webgl') ? 'supported' : 'unsupported');
  }, [setWebgl]);

  const activeHotspot = product.hotspots.find((h) => h.key === active) ?? null;

  const selectHotspot = (key: string) => {
    const hotspot = product.hotspots.find((h) => h.key === key);
    if (!hotspot) return;
    // Деталь под крышкой — сначала разбираем модель, крышка — собираем обратно
    if (hotspot.visibility === 'EXPLODED') setExploded(true);
    if (hotspot.visibility === 'ASSEMBLED') setExploded(false);
    setActive(key);
  };

  const close = useCallback(() => {
    setActive(null);
    setResetSignal((n) => n + 1);
  }, []);

  // Escape закрывает панель детали; фокус — на панель, чтобы скринридер прочёл описание
  useEffect(() => {
    if (!active) return;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, close]);

  // PREVIEW нельзя заказать — только запросить информацию (правило B3)
  const primaryIntent = isOrderable(product.status) ? 'QUOTE' : 'INFO';
  const fullName = `${product.brand} ${product.name}${product.codename ? ` «${product.codename}»` : ''}`;

  return (
    <section
      aria-labelledby="product-title"
      className="relative mx-auto grid max-w-[var(--layout-max)] gap-8 px-[var(--layout-gutter)] pb-16 pt-[calc(var(--layout-header-h)+1.5rem)] lg:min-h-[100svh] lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-center"
    >
      {/* ── 3D ─────────────────────────────────────────────────────────── */}
      <div className="relative order-first lg:order-last">
        <div className="relative h-[52svh] min-h-[340px] overflow-hidden rounded-xl border border-line sm:h-[58svh] sm:min-h-[380px] lg:h-[78vh]">
          {webgl !== 'unsupported' && (
            <ProductViewer
              model={{ preset: product.modelPreset, accent: product.accentColor, identity: { brand: product.brand, name: product.name, codename: product.codename } }}
              hotspots={product.hotspots}
              exploded={exploded}
              lighting={lighting}
              activeHotspot={active}
              onHotspot={selectHotspot}
              resetSignal={resetSignal}
              quality={quality}
            />
          )}
          <p className="pointer-events-none absolute left-4 top-4 font-mono text-caption uppercase tracking-caption text-fg-tertiary" aria-hidden>
            <span className="pointer-coarse:hidden">{t('viewer.hint')}</span>
            <span className="hidden pointer-coarse:inline">{t('viewer.hintTouch')}</span>
          </p>
          <p className="sr-only">{t('viewer.label')}</p>

          {/* Описание выбранной детали */}
          {activeHotspot && (
            <div
              ref={panel}
              tabIndex={-1}
              role="dialog"
              aria-labelledby="hotspot-title"
              className="glass absolute right-3 top-3 z-10 w-[min(22rem,calc(100%-1.5rem))] p-5 outline-none"
            >
              <p className="eyebrow mb-2">
                {product.hotspots.indexOf(activeHotspot) + 1} / {product.hotspots.length}
              </p>
              <h2 id="hotspot-title" className="text-h3">
                {activeHotspot.title}
              </h2>
              <p className="mt-3 text-small text-fg-secondary">{activeHotspot.body}</p>
              <button type="button" onClick={close} className="mt-4 text-small font-medium hover:text-accent">
                {t('viewer.close')} <span aria-hidden>×</span>
              </button>
            </div>
          )}
        </div>

        {/* Панель управления моделью: на телефоне — под окном просмотра, чтобы не закрывать модель; с sm — поверх */}
        <div className="glass mt-3 flex flex-wrap items-center justify-center gap-2 p-2 sm:absolute sm:bottom-3 sm:left-1/2 sm:z-10 sm:mt-0 sm:w-max sm:-translate-x-1/2 sm:flex-nowrap">
          <button
            type="button"
            aria-pressed={exploded}
            onClick={() => setExploded((v) => !v)}
            className="h-9 rounded-pill px-4 text-small font-medium transition-colors hover:bg-white/5 aria-pressed:bg-fg aria-pressed:text-void"
          >
            {exploded ? t('viewer.assemble') : t('viewer.explode')}
          </button>
          <div role="radiogroup" aria-label={t('viewer.lighting')} className="flex rounded-pill border border-line p-0.5 max-sm:order-last">
            {LIGHTING.map((preset) => (
              <button
                key={preset.id}
                type="button"
                role="radio"
                aria-checked={lighting === preset.id}
                onClick={() => setLighting(preset.id)}
                className="h-8 rounded-pill px-3 text-small text-fg-secondary transition-colors hover:text-fg aria-checked:bg-white/10 aria-checked:text-fg"
              >
                {t(`viewer.${preset.label}`)}
              </button>
            ))}
          </div>
          <button type="button" onClick={close} className="h-9 rounded-pill px-4 text-small text-fg-secondary hover:text-fg">
            {t('viewer.reset')}
          </button>
        </div>
      </div>

      {/* ── Описание ───────────────────────────────────────────────────── */}
      <div>
        <nav aria-label="breadcrumb" className="mb-6 font-mono text-caption uppercase tracking-caption text-fg-tertiary">
          <Link href="/" className="hover:text-fg">
            {t('breadcrumb')}
          </Link>
          <span aria-hidden> / </span>
          <span aria-current="page" className="text-fg-secondary">
            {product.name}
          </span>
        </nav>
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <span className="font-mono text-caption uppercase tracking-caption text-accent">{product.headline}</span>
          <StatusBadge status={product.status} window={product.availabilityWindow} locale={locale} />
        </div>
        <h1 id="product-title" className="text-h1">
          {fullName}
        </h1>
        <p className="text-accent-gradient mt-4 text-h3 font-semibold">{product.tagline}</p>
        <p className="mt-6 text-body text-fg-secondary">{product.description}</p>
        {product.availabilityNote && <p className="mt-4 text-small text-fg-tertiary">{product.availabilityNote}</p>}

        <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-6">
          {product.highlights.map((spec) => (
            <div key={spec.key}>
              <dt className="text-caption text-fg-tertiary">{spec.label}</dt>
              <dd className="mt-1 font-mono text-body tabular-nums">{spec.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Magnetic>
            <Link
              href={{ pathname: '/request', query: { product: product.slug, intent: primaryIntent } }}
              className="inline-flex h-12 items-center rounded-pill bg-fg px-6 text-small font-medium text-void transition-shadow hover:shadow-[var(--glow-accent)]"
            >
              {t(`cta.${primaryIntent}`)}
            </Link>
          </Magnetic>
          <Link href={{ pathname: '/compare', query: { slugs: product.slug } }} className="text-small text-fg-secondary hover:text-fg">
            {t('cta.compare')} <span aria-hidden>→</span>
          </Link>
        </div>
        {primaryIntent === 'INFO' && <p className="mt-4 max-w-sm text-small text-fg-tertiary">{t('cta.previewNote')}</p>}

        {/* Детали модели списком — доступный дубль маркеров на 3D */}
        <details className="mt-8 text-small">
          <summary className="cursor-pointer text-fg-secondary hover:text-fg">{t('viewer.hotspots')}</summary>
          <ol className="mt-3 space-y-2">
            {product.hotspots.map((hotspot, i) => (
              <li key={hotspot.key}>
                <button type="button" onClick={() => selectHotspot(hotspot.key)} className="text-left hover:text-accent">
                  <span className="font-mono text-fg-tertiary">{i + 1}.</span> {hotspot.title}
                </button>
              </li>
            ))}
          </ol>
        </details>
      </div>
    </section>
  );
}
