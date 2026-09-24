import { useTranslations } from 'next-intl';

/** Заглушка сцены 2 — её заменит скролл-сторителлинг этапа 4. Нужна, чтобы hero было куда уходить. */
export function TeaserSection() {
  const t = useTranslations('teaser');
  return (
    <section
      aria-labelledby="teaser-title"
      className="relative z-[var(--z-content)] flex min-h-[110vh] items-center"
    >
      <div className="mx-auto w-full max-w-[var(--layout-max)] px-[var(--layout-gutter)]">
        <p className="eyebrow mb-6">{t('eyebrow')}</p>
        <h2 id="teaser-title" className="max-w-[18ch] text-display">
          {t('title')}
        </h2>
        <p className="mt-8 max-w-[34rem] text-lead text-fg-secondary">{t('body')}</p>
      </div>
    </section>
  );
}
