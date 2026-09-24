'use client';

import type { IssueSeverity, ValidateConfigurationResponse } from '@apex/contracts';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo } from 'react';
import { Magnetic } from '../ui/magnetic';
import { AnimatedNumber } from './animated-number';

const SEVERITY_TONE: Record<IssueSeverity, string> = {
  error: 'text-[#ff6b61]',
  warning: 'text-badge-coming',
  info: 'text-fg-tertiary',
};

const POWER_PARTS = [
  { key: 'cpu', field: 'cpuPowerW', color: 'var(--accent)' },
  { key: 'gpu', field: 'gpuPowerW', color: '#76b900' },
  { key: 'memory', field: 'memoryPowerW', color: '#30d158' },
  { key: 'platform', field: 'platformOverheadW', color: '#48484a' },
] as const;

/** Итоги сборки: живые цифры, разбивка мощности, проверка совместимости и действия. */
export function BuildSummary({
  result,
  locale,
  saving,
  saveFailed,
  savedCode,
  copied,
  intent,
  onShare,
  onRequest,
}: {
  result: ValidateConfigurationResponse;
  locale: 'ru' | 'en';
  saving: boolean;
  saveFailed: boolean;
  savedCode: string | null;
  copied: boolean;
  intent: 'QUOTE' | 'INFO';
  onShare: () => void;
  onRequest: () => void;
}) {
  const t = useTranslations('configurator');
  const { totals, issues, valid } = result;

  const nf = useMemo(() => new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'en-US', { maximumFractionDigits: 1 }), [locale]);
  const integer = useCallback((n: number) => nf.format(Math.round(n)), [nf]);
  const capacity = useCallback(
    (gb: number) => (gb >= 1024 ? `${nf.format(Math.round(gb / 102.4) / 10)} ${t('units.tb')}` : `${Math.round(gb)} ${t('units.gb')}`),
    [nf, t],
  );
  const watts = useCallback((w: number) => `${nf.format(Math.round(w))} ${t('units.w')}`, [nf, t]);

  const stats = [
    { key: 'cores', value: totals.cores, format: integer },
    { key: 'threads', value: totals.threads, format: integer },
    { key: 'memory', value: totals.memoryGb, format: capacity },
    { key: 'vram', value: totals.vramGb, format: capacity },
  ] as const;

  return (
    <section aria-labelledby="summary-title" className="glass p-5">
      <h2 id="summary-title" className="eyebrow mb-4">
        {t('totals.title')}
      </h2>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
        {stats.map((stat) => (
          <div key={stat.key}>
            <dt className="text-caption text-fg-tertiary">{t(`totals.${stat.key}`)}</dt>
            <dd className="mt-1 font-mono text-h3">
              <AnimatedNumber value={stat.value} format={stat.format} />
            </dd>
          </div>
        ))}
      </dl>

      {/* Потребление: одна полоса, доли компонентов */}
      <div className="mt-6 border-t border-line pt-5">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-caption text-fg-tertiary">{t('totals.power')}</span>
          <AnimatedNumber value={totals.totalPowerW} format={watts} className="font-mono text-h3" />
        </div>
        <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-white/5" aria-hidden>
          {POWER_PARTS.map((part) => (
            <span
              key={part.key}
              className="h-full transition-[width] duration-700 ease-[var(--curve-out-expo)]"
              style={{ width: `${(totals[part.field] / Math.max(1, totals.totalPowerW)) * 100}%`, background: part.color }}
            />
          ))}
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-caption text-fg-tertiary">
          {POWER_PARTS.map((part) => (
            <li key={part.key} className="flex items-center gap-2">
              <span className="size-1.5 rounded-full" style={{ background: part.color }} aria-hidden />
              {t(`totals.breakdown.${part.key}`)} · {watts(totals[part.field])}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-small">{t('totals.psu', { value: watts(totals.recommendedPsuW) })}</p>
        <p className="mt-1 text-caption text-fg-tertiary">{t('totals.estimate')}</p>
      </div>

      {/* Совместимость: объяснения движка */}
      <div className="mt-6 border-t border-line pt-5">
        <h3 className="eyebrow mb-3">{t('issues.title')}</h3>
        <div aria-live="polite">
          {valid ? (
            <p className="flex items-center gap-2 text-small text-badge-available">
              <span className="size-1.5 rounded-full bg-current shadow-[0_0_10px_currentColor]" aria-hidden />
              {t('issues.ok')}
            </p>
          ) : null}
          {issues.length > 0 && (
            <ul className="mt-3 flex flex-col gap-3">
              {issues.map((issue, i) => (
                <li key={`${issue.code}-${issue.field}-${i}`} className="text-small">
                  <span className={`font-mono text-caption uppercase tracking-caption ${SEVERITY_TONE[issue.severity]}`}>
                    {t(`issues.${issue.severity}`)}
                  </span>
                  <p className="mt-1 text-fg-secondary">{issue.message}</p>
                  {issue.hint && <p className="mt-1 text-caption text-fg-tertiary">{issue.hint}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Действия: только для совместимой сборки */}
      <div className="mt-6 flex flex-col gap-3 border-t border-line pt-5">
        <Magnetic>
          <button
            type="button"
            onClick={onRequest}
            disabled={!valid || saving}
            className="inline-flex h-12 w-full items-center justify-center rounded-pill bg-fg px-6 text-small font-medium text-void transition-shadow hover:shadow-[var(--glow-accent)] disabled:pointer-events-none disabled:opacity-40"
          >
            {t(`actions.request.${intent}`)}
          </button>
        </Magnetic>
        <button
          type="button"
          onClick={onShare}
          disabled={!valid || saving}
          className="h-11 rounded-pill border border-line text-small text-fg-secondary transition-colors hover:border-fg/40 hover:text-fg disabled:pointer-events-none disabled:opacity-40"
        >
          {saving ? t('actions.saving') : copied ? t('actions.copied') : t('actions.save')}
        </button>
        <p className="min-h-5 text-center text-caption text-fg-tertiary" aria-live="polite">
          {!valid
            ? t('actions.invalid')
            : saveFailed
              ? t('actions.error')
              : savedCode
                ? t('actions.savedAs', { code: savedCode })
                : null}
        </p>
      </div>
    </section>
  );
}
