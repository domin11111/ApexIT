'use client';

import type { Locale, ProductStatus } from '@apex/contracts';
import { motion } from '@apex/ui/tokens';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '@/hooks/use-media-query';
import { gsap, SplitText, useGSAP } from '@/lib/gsap';
import { useLenis } from '@/providers/smooth-scroll';
import { useExperience } from '@/stores/experience';
import { StatusBadge } from '../ui/status-badge';

export type HeroProduct = {
  brand: string;
  name: string;
  codename: string | null;
  tagline: string;
  status: ProductStatus;
  availabilityWindow: string | null;
};

/**
 * Сцена 1 (HTML-слой): заголовок появляется по буквам из-под маски, затем подзаголовок,
 * бейдж экспоната в луче и индикатор скролла. Текст — настоящий HTML (SEO, доступность),
 * 3D-сцена лежит под ним на фиксированном canvas.
 */
export function HeroSection({ product, locale }: { product: HeroProduct; locale: Locale }) {
  const t = useTranslations('hero');
  const root = useRef<HTMLElement>(null);
  const phase = useExperience((s) => s.phase);
  const reducedMotion = usePrefersReducedMotion();
  const lenis = useLenis();
  const intro = useRef<gsap.core.Timeline | null>(null);

  // Готовим интро заранее (пока открыт прелоадер): буквы уже спрятаны под маской
  useGSAP(
    () => {
      if (reducedMotion) return;
      // Слова — неразрывные обёртки, буквы внутри: иначе перенос строки может пройти посреди слова
      const split = SplitText.create('[data-split]', { type: 'words,chars', mask: 'chars', aria: 'none' });
      intro.current = gsap
        .timeline({ paused: true, defaults: { ease: motion.gsap.outExpo } })
        .from(split.chars, { yPercent: 115, duration: 1.3, stagger: motion.stagger.letters })
        .from('[data-year]', { yPercent: 115, duration: 1.3 }, 0.35)
        .from('[data-fade]', { y: 24, autoAlpha: 0, duration: 1, stagger: 0.12 }, 0.5)
        // Подзаголовок — самый крупный текст первого экрана (кандидат LCP): только сдвиг, без прозрачности,
        // чтобы браузер засчитал его отрисовку сразу, а не после прелоадера
        .from('[data-rise]', { y: 24, duration: 1 }, 0.55);

      // Уход hero при скролле: текст поднимается и гаснет (3D-сцену ведёт режиссёр по StoryScroll)
      gsap.to('[data-hero-content]', {
        yPercent: -18,
        autoAlpha: 0,
        ease: 'none',
        scrollTrigger: { trigger: root.current, start: 'top top', end: 'bottom top', scrub: true },
      });
      return () => split.revert();
    },
    { scope: root, dependencies: [reducedMotion] },
  );

  useEffect(() => {
    if (phase !== 'loading') intro.current?.play();
  }, [phase]);

  const scrollNext = () => {
    const next = root.current?.nextElementSibling;
    if (next instanceof HTMLElement) {
      if (lenis) lenis.scrollTo(next, { duration: 1.6 });
      else next.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
    }
  };

  const fullName = `${product.brand} ${product.name}${product.codename ? ` «${product.codename}»` : ''}`;

  return (
    <section ref={root} data-scene="hero" aria-labelledby="hero-title" className="relative z-[var(--z-content)] h-[100svh] min-h-[620px]">
      {/* Затемнение под подписями: светящиеся дорожки не должны съедать контраст текста */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[38%] bg-gradient-to-t from-void via-void/70 to-transparent" />
      {/* Композиция «премьеры»: заголовок сверху, экспонат в луче по центру (3D), подписи снизу */}
      <div
        data-hero-content
        className="relative mx-auto flex h-full max-w-[var(--layout-max)] flex-col justify-between px-[var(--layout-gutter)] pb-[clamp(1.5rem,5vh,3.5rem)] pt-[calc(var(--layout-header-h)+clamp(1rem,4vh,3rem))]"
      >
        <div className="text-center">
          <p data-fade className="eyebrow mb-5">
            {t('eyebrow')}
          </p>
          <h1 id="hero-title" aria-label={`${t('titleLine1')} ${t('titleLine2')}`} className="text-hero font-display">
            <span aria-hidden className="block" data-split>
              {t('titleLine1')}
            </span>
            <span aria-hidden className="block">
              <span data-split>{t('titleLine2').replace(/\s*\d{4}$/, '')}</span>{' '}
              <span className="inline-block overflow-hidden align-bottom">
                <span data-year className="text-accent-gradient inline-block font-mono font-medium tracking-[-0.06em]">
                  {t('titleLine2').match(/\d{4}$/)?.[0]}
                </span>
              </span>
            </span>
          </h1>
        </div>

        <div className="grid items-end gap-6 md:grid-cols-[1fr_auto_1fr]">
          <p data-rise className="max-w-[26rem] text-body text-fg-secondary">
            {t('subtitle')}
          </p>

          <button
            type="button"
            data-fade
            onClick={scrollNext}
            className="hidden flex-col items-center gap-3 font-mono text-caption uppercase tracking-caption text-fg-secondary transition-colors hover:text-fg md:flex"
          >
            {t('scroll')}
            <span className="relative block h-10 w-px overflow-hidden bg-line">
              <span className="absolute inset-x-0 top-0 block h-1/3 bg-fg motion-safe:animate-[scroll-cue_1.8s_var(--curve-in-out-quart)_infinite]" />
            </span>
          </button>

          <div data-fade className="glass hidden max-w-xs flex-col gap-2.5 justify-self-end p-5 sm:flex">
            <span className="eyebrow">{t('featured')}</span>
            <span className="font-display text-body font-semibold">{fullName}</span>
            <span className="text-small text-fg-secondary">{product.tagline}</span>
            <StatusBadge status={product.status} window={product.availabilityWindow} locale={locale} />
          </div>
        </div>
      </div>
    </section>
  );
}
