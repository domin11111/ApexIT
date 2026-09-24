import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Configurator } from '@/components/configurator/configurator';
import { RevealText } from '@/components/story/reveal-text';
import type { routing } from '@/i18n/routing';
import { getMotherboards, getPlatforms, getProduct, getProducts } from '@/lib/catalog';
import type { ConfiguratorCatalog } from '@/lib/configurator-state';

type Locale = (typeof routing.locales)[number];

export async function generateMetadata({ params }: PageProps<'/[locale]/configurator'>): Promise<Metadata> {
  const { locale } = (await params) as { locale: Locale };
  const t = await getTranslations({ locale, namespace: 'configurator' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: { canonical: locale === 'ru' ? '/configurator' : '/en/configurator', languages: { ru: '/configurator', en: '/en/configurator' } },
  };
}

/**
 * Страница конфигуратора собирается статически: каталог (платформы, платы, продукты) — в HTML,
 * сборка из ссылки ?c=… подгружается уже в браузере.
 */
export default async function ConfiguratorPage({ params }: PageProps<'/[locale]/configurator'>) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const t = await getTranslations('configurator');

  const platforms = await getPlatforms(locale);
  const boards = Object.fromEntries(await Promise.all(platforms.map(async (p) => [p.socket, await getMotherboards(p.socket, locale)] as const)));
  const { items } = await getProducts(locale);
  const products = await Promise.all(
    items.filter((p) => p.category === 'CPU' || p.category === 'MEMORY' || p.category === 'GPU').map((p) => getProduct(p.slug, locale)),
  );
  const catalog: ConfiguratorCatalog = { platforms, boards, products };

  return (
    <main id="content" className="mx-auto max-w-[var(--layout-max)] px-[var(--layout-gutter)] pb-24 pt-[calc(var(--layout-header-h)+2rem)]">
      <header className="mb-10 max-w-3xl">
        <p className="eyebrow mb-4">{t('eyebrow')}</p>
        <RevealText as="h1" className="text-h1">
          {t('title')}
        </RevealText>
        <p className="mt-5 text-body text-fg-secondary">{t('lead')}</p>
      </header>
      <Configurator catalog={catalog} locale={locale} />
    </main>
  );
}
