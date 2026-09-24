import type { SpecDto, SpecGroupDto } from '@apex/contracts';
import { useTranslations } from 'next-intl';
import { RevealText } from '../story/reveal-text';
import { CountUp } from './count-up';

/**
 * Характеристики: крупные анимированные цифры ключевых показателей, затем все группы
 * (Вычисления / Кэш / Память / Питание / Интерфейсы …) обычной таблицей — реальный HTML-текст.
 */
export function SpecSection({ groups, highlights, locale }: { groups: SpecGroupDto[]; highlights: SpecDto[]; locale: string }) {
  const t = useTranslations('product.specs');
  return (
    <section aria-labelledby="specs-title" className="mx-auto max-w-[var(--layout-max)] px-[var(--layout-gutter)] py-[var(--layout-section-y)]">
      <p className="eyebrow mb-4">{t('eyebrow')}</p>
      <RevealText id="specs-title" className="text-h1">
        {t('title')}
      </RevealText>

      <dl className="mt-12 grid grid-cols-2 gap-6 border-y border-line py-10 md:grid-cols-4">
        {highlights.map((spec) => (
          <div key={spec.key}>
            <dd className="text-accent-gradient text-stat font-medium leading-none">
              <CountUp value={spec.value} locale={locale} />
            </dd>
            <dt className="mt-3 text-small text-fg-secondary">{spec.label}</dt>
          </div>
        ))}
      </dl>

      <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((group) => (
          <section key={group.key} aria-labelledby={`group-${group.key}`} className="glass p-6">
            <h3 id={`group-${group.key}`} className="eyebrow mb-4">
              {group.title}
            </h3>
            <dl className="divide-y divide-line">
              {group.specs.map((spec) => (
                <div key={spec.key} className="grid grid-cols-[minmax(6.5rem,1fr)_minmax(0,max-content)] gap-4 py-2.5">
                  <dt className="text-small text-fg-secondary">
                    {spec.label}
                    {spec.note && <span className="mt-1 block text-caption text-fg-tertiary">{spec.note}</span>}
                  </dt>
                  <dd className={`text-right font-mono text-small tabular-nums ${spec.highlight ? 'text-accent' : ''}`}>{spec.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </section>
  );
}
