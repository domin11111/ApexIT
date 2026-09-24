'use client';

import { useTranslations } from 'next-intl';

/** Счётчик компонентов: − значение +, границы — лимиты платы. Значение объявляется скринридеру. */
export function CountStepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const t = useTranslations('configurator.stepper');
  const button =
    'grid size-9 place-items-center rounded-full border border-line text-body transition-colors hover:border-fg/40 hover:bg-white/5 disabled:pointer-events-none disabled:opacity-30';
  return (
    <div className="flex items-center gap-3" role="group" aria-label={label}>
      <button type="button" className={button} onClick={() => onChange(value - 1)} disabled={value <= min} aria-label={`${t('decrease')}: ${label}`}>
        <span aria-hidden>−</span>
      </button>
      <output aria-live="polite" className="min-w-[3ch] text-center font-mono text-h3 tabular-nums">
        {value}
      </output>
      <button type="button" className={button} onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={`${t('increase')}: ${label}`}>
        <span aria-hidden>+</span>
      </button>
    </div>
  );
}
