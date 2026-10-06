'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { create } from 'zustand';
import { usePrefersReducedMotion } from '@/hooks/use-media-query';
import { BASE_PATH, stripBasePath } from '@/lib/base-path';
import { gsap, ScrollTrigger } from '@/lib/gsap';
import { useLenis } from '@/providers/smooth-scroll';
import { useExperience } from '@/stores/experience';
import { LogoMark } from './logo-mark';

/**
 * Состояние перехода живёт вне компонента: при смене языка сегмент [locale] монтируется заново,
 * и новая шторка должна знать, что страница закрыта и её пора открывать.
 */
const useCurtain = create<{ from: string | null; label: string | null }>()(() => ({ from: null, label: null }));

const HIDDEN_BELOW = 'inset(100% 0% 0% 0%)';
const COVERED = 'inset(0% 0% 0% 0%)';
const HIDDEN_ABOVE = 'inset(0% 0% 100% 0%)';
/** Если навигация не завершилась (ошибка сети), шторка всё равно уходит */
const SAFETY_MS = 10_000;

/** Ссылка, которую ведём через шторку: внутренняя, на другую страницу, обычный клик. */
function transitionTarget(event: MouseEvent): HTMLAnchorElement | null {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if ((anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download') || anchor.dataset.transition === 'off') return null;
  const url = new URL(anchor.href);
  // Смена только query или якоря — не переход между страницами
  if (url.origin !== location.origin || url.pathname === location.pathname) return null;
  // На общем домене соседние приложения — тот же origin, но не наши страницы: туда обычным переходом
  if (BASE_PATH && url.pathname !== BASE_PATH && !url.pathname.startsWith(`${BASE_PATH}/`)) return null;
  return anchor;
}

/**
 * Переход между страницами (F8): шторка поднимается снизу и закрывает экран → роутер меняет страницу →
 * скролл сбрасывается в начало, ScrollTrigger пересчитывается → шторка уходит вверх.
 *
 * Клики перехватываются на window в фазе захвата — раньше, чем React вызовет onClick у next/link:
 * Link видит defaultPrevented и не навигирует сам. Так через шторку идут все ссылки сайта без обёрток;
 * отключить для конкретной ссылки — data-transition="off", подпись на шторке — data-transition-label.
 */
export function PageTransition() {
  const router = useRouter();
  const pathname = usePathname();
  const lenis = useLenis();
  const reducedMotion = usePrefersReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  // Шторка, смонтированная посреди перехода (смена языка), стартует закрытой
  const [initiallyCovered] = useState(() => useCurtain.getState().from !== null);
  const label = useCurtain((s) => s.label);

  // ── Новая страница отрисована — открыть экран ─────────────────────────────
  const reveal = useEffectEvent(() => {
    const el = root.current;
    useCurtain.setState({ from: null });
    window.scrollTo(0, 0);
    lenis?.scrollTo(0, { immediate: true, force: true });
    lenis?.start();
    if (!el) return;
    // Новая разметка уже в DOM: пересчитываем триггеры до того, как её станет видно
    requestAnimationFrame(() => ScrollTrigger.refresh());
    gsap.to(el, {
      clipPath: HIDDEN_ABOVE,
      duration: 0.7,
      delay: 0.1,
      ease: 'power3.inOut',
      onComplete: () => {
        gsap.set(el, { clipPath: HIDDEN_BELOW, visibility: 'hidden' });
        useCurtain.setState({ label: null });
      },
    });
  });

  // ── Закрыть экран и перейти ───────────────────────────────────────────────
  useEffect(() => {
    if (reducedMotion) return;
    let safety = 0;

    const onClick = (event: MouseEvent) => {
      if (useExperience.getState().phase !== 'ready') return;
      const anchor = transitionTarget(event);
      if (!anchor) return;
      event.preventDefault();
      if (useCurtain.getState().from !== null || !root.current) return;

      // В href уже есть basePath, а router.push добавит его ещё раз — снимаем
      const href = stripBasePath(anchor.getAttribute('href') ?? anchor.href);
      useCurtain.setState({ from: location.pathname, label: anchor.dataset.transitionLabel ?? null });
      lenis?.stop();
      gsap.fromTo(
        root.current,
        { clipPath: HIDDEN_BELOW, visibility: 'visible' },
        {
          clipPath: COVERED,
          duration: 0.55,
          ease: 'power3.inOut',
          // Страница уже закрыта — прокрутку можно сбросить, пользователь этого не увидит
          onComplete: () => router.push(href, { scroll: false }),
        },
      );
      window.clearTimeout(safety);
      safety = window.setTimeout(() => {
        if (useCurtain.getState().from !== null) reveal();
      }, SAFETY_MS);
    };

    window.addEventListener('click', onClick, { capture: true });
    return () => {
      window.removeEventListener('click', onClick, { capture: true });
      window.clearTimeout(safety);
    };
  }, [reducedMotion, lenis, router]);

  useEffect(() => {
    const { from } = useCurtain.getState();
    if (from !== null && from !== pathname) reveal();
  }, [pathname]);

  return (
    <div
      ref={root}
      aria-hidden
      className="fixed inset-0 z-[var(--z-overlay)] grid place-items-center bg-void"
      style={{ clipPath: initiallyCovered ? COVERED : HIDDEN_BELOW, visibility: initiallyCovered ? 'visible' : 'hidden' }}
    >
      {/* Светящаяся кромка шторки — как дорожка на плате */}
      <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent to-transparent" />
      <div className="flex flex-col items-center gap-4">
        <LogoMark className="size-10 text-fg" />
        {label && <p className="font-mono text-caption uppercase tracking-caption text-fg-secondary">{label}</p>}
      </div>
    </div>
  );
}
