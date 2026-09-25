'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

type TurnstileApi = {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let scriptLoading: Promise<TurnstileApi> | undefined;

/** Скрипт Cloudflare грузится один раз и только на странице с формой. */
function loadTurnstile(): Promise<TurnstileApi> {
  scriptLoading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile не загрузился')));
    script.onerror = () => {
      scriptLoading = undefined;
      reject(new Error('Turnstile недоступен'));
    };
    document.head.append(script);
  });
  return scriptLoading;
}

export type TurnstileHandle = { reset: () => void };

/**
 * Виджет Cloudflare Turnstile. Для большинства посетителей проверка невидима;
 * токен одноразовый — после ошибки отправки виджет сбрасывается и выдаёт новый.
 */
export const Turnstile = forwardRef<TurnstileHandle, { siteKey: string; locale: string; onToken: (token: string) => void }>(
  function Turnstile({ siteKey, locale, onToken }, ref) {
    const container = useRef<HTMLDivElement>(null);
    const widget = useRef<string | null>(null);
    const callback = useRef(onToken);
    useEffect(() => {
      callback.current = onToken;
    }, [onToken]);

    useImperativeHandle(ref, () => ({
      reset: () => {
        if (widget.current && window.turnstile) window.turnstile.reset(widget.current);
        callback.current('');
      },
    }));

    useEffect(() => {
      let cancelled = false;
      loadTurnstile()
        .then((api) => {
          if (cancelled || !container.current) return;
          widget.current = api.render(container.current, {
            sitekey: siteKey,
            theme: 'dark',
            language: locale,
            appearance: 'interaction-only',
            callback: (token: string) => callback.current(token),
            'expired-callback': () => callback.current(''),
            'error-callback': () => callback.current(''),
          });
        })
        .catch(() => callback.current(''));
      return () => {
        cancelled = true;
        if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
        widget.current = null;
      };
    }, [siteKey, locale]);

    return <div ref={container} className="min-h-0" />;
  },
);
