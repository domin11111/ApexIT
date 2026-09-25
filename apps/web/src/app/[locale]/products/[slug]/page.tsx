import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CompatibilitySection, type RelatedProduct } from '@/components/product/compatibility-section';
import { ProductHero } from '@/components/product/product-hero';
import { Scenarios, type Scenario } from '@/components/product/scenarios';
import { SpecSection } from '@/components/product/spec-section';
import type { routing } from '@/i18n/routing';
import { getMotherboards, getProduct, getProducts } from '@/lib/catalog';
import { modelSource } from '@/lib/model-source';
import { JsonLd } from '@/components/seo/json-ld';
import { absoluteUrl, alternatesFor, localizedPath } from '@/lib/site';

type Locale = (typeof routing.locales)[number];
type Params = { locale: Locale; slug: string };

/** Страницы продуктов собираются статически (SSG) для всех продуктов коллекции. */
export async function generateStaticParams() {
  const { items } = await getProducts('ru');
  return items.map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({ params }: PageProps<'/[locale]/products/[slug]'>): Promise<Metadata> {
  const { locale, slug } = (await params) as Params;
  const product = await getProduct(slug, locale);
  const title = `${product.brand} ${product.name}${product.codename ? ` «${product.codename}»` : ''}`;
  return {
    title,
    description: `${product.tagline} ${product.description}`.slice(0, 300),
    alternates: alternatesFor(locale, `/products/${slug}`),
    openGraph: {
      title,
      description: product.tagline,
      type: 'website',
      url: alternatesFor(locale, `/products/${slug}`).canonical,
    },
    twitter: { card: 'summary_large_image', title, description: product.tagline },
  };
}

/** Убирает «до», «up to», «≈» — значение подставляется внутрь предложения. */
const bare = (value = '') => value.replace(/^(до|up to|≈)\s+/i, '');

export default async function ProductPage({ params }: PageProps<'/[locale]/products/[slug]'>) {
  const { locale, slug } = (await params) as Params;
  setRequestLocale(locale);
  const t = await getTranslations('product');

  const product = await getProduct(slug, locale);
  const { items } = await getProducts(locale);
  const others = await Promise.all(items.filter((p) => p.slug !== slug).map((p) => getProduct(p.slug, locale)));

  const specs = new Map(product.specGroups.flatMap((g) => g.specs).map((s) => [s.key, s]));
  const value = (key: string) => specs.get(key)?.value ?? '';
  const numeric = (key: string) => specs.get(key)?.numericValue ?? null;

  // ── Совместимость ─────────────────────────────────────────────────────────
  const sockets = product.compatibility.map((c) => c.socket);
  const platforms = await Promise.all(
    product.compatibility.map(async (compatibility) => ({
      compatibility,
      boards: await getMotherboards(compatibility.socket, locale),
    })),
  );
  // Одна карточка на продукт — со всеми общими платформами
  const related: RelatedProduct[] = others.flatMap((other) => {
    const summary = items.find((p) => p.slug === other.slug);
    const shared = other.compatibility.filter((c) => sockets.includes(c.socket)).map(({ socket, level }) => ({ socket, level }));
    return summary && shared.length > 0 ? [{ product: summary, platforms: shared }] : [];
  });

  // ── Сценарии «Для чего создан» — с цифрами продукта ───────────────────────
  const keys = ['ai', 'virtualization', 'hpc', 'databases'] as const;
  const values = {
    cores: value('cpu.cores'),
    threads: value('cpu.threads'),
    l3: value('cpu.l3Cache'),
    bandwidth: bare(value('cpu.memBandwidth') || value('gpu.memoryBandwidth')),
    channels: value('cpu.memChannels'),
    capacity: value('memory.capacity'),
    system: bare(value('memory.maxSystemCapacity')),
    speed: bare(value('memory.speed')),
    power: value('memory.power'),
    saving: value('memory.powerSaving'),
    vram: value('gpu.vram'),
    cuda: value('gpu.cudaCores'),
  };
  const category = product.category === 'MOTHERBOARD' ? null : product.category;
  const scenarios: Scenario[] = category
    ? keys.map((key) => ({
        key,
        title: t(`scenarios.${category}.${key}.title`),
        body: t(`scenarios.${category}.${key}.body`, values),
      }))
    : [];

  // ── Разметка для поисковиков ─────────────────────────────────────────────
  const url = absoluteUrl(localizedPath(locale, `/products/${slug}`));
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Product',
        '@id': `${url}#product`,
        url,
        name: `${product.brand} ${product.name}`,
        brand: { '@type': 'Brand', name: product.brand },
        description: product.description,
        sku: product.slug,
        category: product.category,
        image: absoluteUrl(`/renders/${product.slug}-hero-1600.webp`),
        additionalProperty: product.highlights.map((spec) => ({ '@type': 'PropertyValue', name: spec.label, value: spec.value })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: t('breadcrumb'), item: absoluteUrl(localizedPath(locale, '/')) },
          { '@type': 'ListItem', position: 2, name: `${product.brand} ${product.name}`, item: url },
        ],
      },
    ],
  };

  return (
    <main
      id="content"
      // Акцент продукта красит всю страницу: цифры, бейджи, подсветки
      style={{ '--accent': product.accentColor, '--accent-alt': product.accentColorAlt ?? product.accentColor } as CSSProperties}
    >
      <ProductHero
        locale={locale}
        product={{
          slug: product.slug,
          brand: product.brand,
          name: product.name,
          codename: product.codename,
          headline: product.headline,
          tagline: product.tagline,
          description: product.description,
          status: product.status,
          availabilityWindow: product.availabilityWindow,
          availabilityNote: product.availabilityNote,
          accentColor: product.accentColor,
          modelPreset: product.modelPreset,
          modelSource: modelSource(product.models),
          hotspots: product.hotspots,
          highlights: product.highlights.map(({ key, label, value: v }) => ({ key, label, value: v })),
        }}
      />
      <SpecSection groups={product.specGroups} highlights={product.highlights} locale={locale} />
      {scenarios.length > 0 && <Scenarios title={t('scenarios.title')} items={scenarios} accent={product.accentColor} />}
      <CompatibilitySection
        platforms={platforms}
        related={related}
        subject={{ category: product.category, tdpW: numeric('cpu.tdp'), capacityGb: numeric('memory.capacity') }}
      />
      <JsonLd data={jsonLd} />
    </main>
  );
}
