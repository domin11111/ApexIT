import { useTranslations } from 'next-intl';

/**
 * Без WebGL: тот же «зал» средствами CSS — луч сверху и силуэт экспоната.
 * Статичные рендеры моделей (AVIF) подставим сюда на этапе 8.
 */
export function StaticFallback({ accent, accentAlt }: { accent: string; accentAlt: string | null }) {
  const t = useTranslations('fallback');
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[var(--z-canvas)] overflow-hidden">
      <div
        className="absolute left-1/2 top-0 h-[75vh] w-[60vmin] -translate-x-1/2"
        style={{
          background: `radial-gradient(ellipse 50% 100% at 50% 0%, color-mix(in oklab, ${accentAlt ?? accent} 22%, rgba(230,236,255,0.18)) 0%, transparent 70%)`,
          clipPath: 'polygon(46% 0, 54% 0, 100% 100%, 0 100%)',
        }}
      />
      <div
        className="absolute left-1/2 top-[38vh] h-[22vmin] w-[24vmin] -translate-x-1/2 rounded-[1.2vmin]"
        style={{
          background: 'linear-gradient(160deg, #c7cad1 0%, #6b6f78 55%, #2a2c33 100%)',
          boxShadow: `0 0 80px -10px ${accent}`,
          transform: 'translateX(-50%) perspective(600px) rotateX(48deg)',
        }}
      />
      <p className="sr-only">{t('webgl')}</p>
    </div>
  );
}
