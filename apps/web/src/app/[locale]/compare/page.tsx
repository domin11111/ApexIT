import { SpecGroupKey } from '@apex/contracts';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ComparePicker } from '@/components/compare/compare-picker';
import { CompareStagePanel } from '@/components/compare/compare-stage-panel';
import { CompareTable } from '@/components/compare/compare-table';
import { RevealText } from '@/components/story/reveal-text';
import type { routing } from '@/i18n/routing';
import { alternatesFor } from '@/lib/site';
import { getCompare, getProduct, getProducts } from '@/lib/catalog';
import { resolveSelection } from '@/lib/compare-selection';
import { modelSource } from '@/lib/model-source';

type Locale = (typeof routing.locales)[number];

export async function generateMetadata({ params }: PageProps<'/[locale]/compare'>): Promise<Metadata> {
  const { locale } = (await params) as { locale: Locale };
  const t = await getTranslations({ locale, namespace: 'compare' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: alternatesFor(locale, '/compare'),
  };
}

/** Сравнение (F5): выбор продуктов в адресе ?slugs=a,b — ссылкой можно поделиться как есть. */
export default async function ComparePage({ params, searchParams }: PageProps<'/[locale]/compare'>) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const t = await getTranslations('compare');

  const { items } = await getProducts(locale);
  const selection = resolveSelection(items, (await searchParams).slugs);
  const table = selection.length >= 2 ? await getCompare(selection, locale) : null;
  const selected = selection.flatMap((slug) => items.filter((p) => p.slug === slug));
  // Реальные модели (GLB) — из карточек продуктов; в списке продуктов их нет
  const details = table ? await Promise.all(selected.map((p) => getProduct(p.slug, locale))) : [];

  return (
    <main id="content" className="mx-auto max-w-[var(--layout-max)] px-[var(--layout-gutter)] pb-24 pt-[calc(var(--layout-header-h)+2rem)]">
      <header className="mb-10 max-w-3xl">
        <p className="eyebrow mb-4">{t('eyebrow')}</p>
        <RevealText as="h1" className="text-h1">
          {t('title')}
        </RevealText>
        <p className="mt-5 text-body text-fg-secondary">{t('lead')}</p>
      </header>

      <ComparePicker items={items} selection={selection} />

      {table ? (
        <>
          <div className="mt-10">
            <CompareStagePanel
              key={selection.join(',')}
              items={selected.map((p, i) => ({
                slug: p.slug,
                preset: p.modelPreset,
                accent: p.accentColor,
                identity: { brand: p.brand, name: p.name, codename: p.codename },
                source: details[i] ? modelSource(details[i].models) : undefined,
                title: `${p.brand} ${p.name}`,
              }))}
            />
          </div>
          <section aria-labelledby="specs-title" className="mt-16">
            <h2 id="specs-title" className="sr-only">
              {t('specs')}
            </h2>
            <CompareTable
              rows={table.rows}
              products={table.products}
              groupTitles={Object.fromEntries(SpecGroupKey.options.map((key) => [key, t(`groups.${key}`)]))}
              bestLabel={t('best')}
            />
          </section>
        </>
      ) : (
        <p className="glass mt-10 px-5 py-4 text-small text-fg-secondary">{t('needTwo')}</p>
      )}
    </main>
  );
}
