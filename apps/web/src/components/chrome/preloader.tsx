'use client';

import { motion as tokens } from '@apex/ui/tokens';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '@/hooks/use-media-query';
import { gsap, useGSAP } from '@/lib/gsap';
import { useLenis } from '@/providers/smooth-scroll';
import { useExperience } from '@/stores/experience';
import { LogoMark } from './logo-mark';

/** Кольцо рисуется не быстрее этого — иначе на быстром соединении анимацию не успеть увидеть. */
const MIN_DRAW_MS = 800;

/**
 * Прелоадер: тонкая линия-«дорожка» рисуется по кругу, счётчик показывает реальный прогресс
 * загрузки 3D-ассетов → кольцо превращается в логотип коллекции → шторка уходит вверх.
 * Не дольше 2,5 с: если ассеты ещё грузятся, сайт открывается с плейсхолдерами.
 */
export function Preloader() {
  const t = useTranslations('preloader');
  const phase = useExperience((s) => s.phase);
  const setPhase = useExperience((s) => s.setPhase);
  const reducedMotion = usePrefersReducedMotion();
  const lenis = useLenis();
  const root = useRef<HTMLDivElement>(null);

  // Премьера всегда начинается с hero: браузер не восстанавливает прежнюю позицию скролла
  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
  }, []);

  // Пока экран закрыт — скролл заблокирован
  useEffect(() => {
    if (phase === 'ready') return;
    const html = document.documentElement;
    html.style.overflow = 'hidden';
    lenis?.stop();
    return () => {
      html.style.overflow = '';
      lenis?.start();
    };
  }, [phase, lenis]);

  useGSAP(
    () => {
      const el = root.current;
      if (!el || useExperience.getState().phase !== 'loading') return;
      const ring = el.querySelector<SVGCircleElement>('[data-ring]');
      const counter = el.querySelector<HTMLElement>('[data-counter]');
      const wordmark = el.querySelector<HTMLElement>('[data-wordmark]');
      const started = performance.now();
      let last = started;
      const shown = { value: 0 };
      let leaving = false;

      const leave = () => {
        leaving = true;
        gsap.ticker.remove(tick);
        if (reducedMotion) {
          setPhase('revealing');
          gsap.to(el, { autoAlpha: 0, duration: 0.2, onComplete: () => setPhase('ready') });
          return;
        }
        gsap
          .timeline({ defaults: { ease: 'expo.out' } })
          .to('[data-pin]', { scale: 1, autoAlpha: 1, duration: 0.35, transformOrigin: '30% 70%' })
          .to('[data-counter]', { autoAlpha: 0, y: -8, duration: 0.3 }, '<')
          // Кольцо уезжает влево ровно на половину надписи — логотип целиком оказывается по центру
          .to('[data-mark]', { x: -((wordmark?.offsetWidth ?? 0) / 2) * 0.72, scale: 0.72, duration: 0.6 }, '-=0.1')
          .fromTo('[data-wordmark]', { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 0.6 }, '<0.1')
          .add(() => setPhase('revealing'), '+=0.05')
          .to(el, { yPercent: -100, duration: 0.8, ease: 'expo.inOut' })
          .add(() => setPhase('ready'));
      };

      const tick = () => {
        const { sceneProgress, webgl } = useExperience.getState();
        const now = performance.now();
        const elapsed = now - started;
        const dt = (now - last) / 1000;
        last = now;
        const loaded = webgl === 'unsupported' ? 1 : sceneProgress;
        // Выход должен успеть уложиться в 2,5 с — к этому моменту считаем загрузку завершённой
        const target = elapsed >= tokens.preloaderMaxMs - 1300 ? 1 : Math.min(loaded, elapsed / MIN_DRAW_MS);
        // Сглаживание по реальному времени: не зависит от частоты кадров (и троттлинга вкладки)
        shown.value += (target - shown.value) * (1 - Math.exp(-dt * 9));
        if (target - shown.value < 0.004) shown.value = target;
        ring?.style.setProperty('stroke-dashoffset', String(1 - shown.value));
        if (counter) counter.textContent = String(Math.round(shown.value * 100)).padStart(3, '0');
        if (shown.value >= 1 && !leaving) leave();
      };

      gsap.set('[data-pin]', { scale: 0, autoAlpha: 0 });
      gsap.ticker.add(tick);
      return () => gsap.ticker.remove(tick);
    },
    { scope: root, dependencies: [reducedMotion] },
  );

  if (phase === 'ready') return null;

  return (
    <div
      ref={root}
      role="progressbar"
      aria-label={t('label')}
      aria-busy="true"
      className="preloader fixed inset-0 z-[var(--z-preloader)] grid place-items-center bg-void"
    >
      <div className="relative" data-mark>
        <LogoMark
          className="size-24 text-accent"
          ringProps={{ 'data-ring': true, strokeDasharray: 1, strokeDashoffset: 1, transform: 'rotate(-90 24 24)' } as React.SVGProps<SVGCircleElement>}
        />
        {/* Надпись вне потока: пока рисуется кольцо, оно строго по центру */}
        <span
          data-wordmark
          className="absolute left-full top-1/2 -translate-y-1/2 whitespace-nowrap pl-5 font-display text-h3 font-semibold"
          style={{ clipPath: 'inset(0 100% 0 0)' }}
        >
          APEX <span className="text-fg-secondary">{'// Compute Collection'}</span>
        </span>
      </div>
      <span data-counter className="absolute bottom-[12vh] font-mono text-small tabular-nums text-fg-secondary">
        000
      </span>
    </div>
  );
}
