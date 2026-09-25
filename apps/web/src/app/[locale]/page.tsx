import { setRequestLocale } from 'next-intl/server';
import { ExperienceSlot } from '@/components/experience/experience-slot';
import { HeroSection } from '@/components/hero/hero-section';
import {
  AssemblyScene,
  ChipletsScene,
  CollectionFooter,
  GenerationsScene,
  GpuScene,
  MemoryScene,
} from '@/components/story/scenes';
import { StoryRail } from '@/components/story/story-rail';
import { StoryScroll } from '@/components/story/story-scroll';
import type { routing } from '@/i18n/routing';
import { getCompare, getProduct, getProducts } from '@/lib/catalog';
import { modelSource } from '@/lib/model-source';
import { toBars, toStoryProduct, type StoryData } from '@/story/data';
import type { StoryModel } from '@/three/story/story-scene';
import type { ProductDetailDto } from '@apex/contracts';
import { JsonLd } from '@/components/seo/json-ld';
import { SITE_NAME, SITE_URL, absoluteUrl, localizedPath } from '@/lib/site';

const model = (p: ProductDetailDto): StoryModel => ({
  slug: p.slug,
  preset: p.modelPreset,
  accent: p.accentColor,
  accentAlt: p.accentColorAlt,
  identity: { brand: p.brand, name: p.name, codename: p.codename },
  source: modelSource(p.models),
});

/** Главная-презентация: скролл-сторителлинг из семи сцен над единой WebGL-сценой. */
export default async function HomePage({ params }: PageProps<'/[locale]'>) {
  const { locale } = (await params) as { locale: (typeof routing.locales)[number] };
  setRequestLocale(locale);

  const [venice, turin, memory, gpu, compare, list] = await Promise.all([
    getProduct('epyc-9996-venice', locale),
    getProduct('epyc-9965', locale),
    getProduct('micron-ddr5-512gb-rdimm', locale),
    getProduct('rtx-pro-6000-blackwell', locale),
    // Порядок колонок: старшее поколение слева, новое — справа
    getCompare(['epyc-9965', 'epyc-9996-venice'], locale),
    getProducts(locale),
  ]);

  const data: StoryData = {
    venice: toStoryProduct(venice),
    turin: toStoryProduct(turin),
    memory: toStoryProduct(memory),
    gpu: toStoryProduct(gpu),
    bars: toBars(compare, ['cpu.cores', 'cpu.l3Cache', 'cpu.memBandwidth']),
    collection: list.items,
  };

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}#org`,
        name: SITE_NAME,
        url: SITE_URL,
        logo: absoluteUrl('/icon.svg'),
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}#site`,
        name: SITE_NAME,
        url: absoluteUrl(localizedPath(locale, '/')),
        inLanguage: locale,
        publisher: { '@id': `${SITE_URL}#org` },
      },
      {
        '@type': 'ItemList',
        name: 'The Compute Collection 2026',
        itemListElement: list.items.map((p, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: `${p.brand} ${p.name}`,
          url: absoluteUrl(localizedPath(locale, `/products/${p.slug}`)),
        })),
      },
    ],
  };

  return (
    <main id="content">
      <JsonLd data={jsonLd} />
      <StoryScroll />
      <StoryRail />
      <ExperienceSlot
        models={{ venice: model(venice), turin: model(turin), memory: model(memory), gpu: model(gpu) }}
      />
      <HeroSection
        locale={locale}
        product={{
          brand: venice.brand,
          name: venice.name,
          codename: venice.codename,
          tagline: venice.tagline,
          status: venice.status,
          availabilityWindow: venice.availabilityWindow,
        }}
      />
      <ChipletsScene product={data.venice} locale={locale} />
      <GenerationsScene venice={data.venice} turin={data.turin} bars={data.bars} />
      <MemoryScene product={data.memory} locale={locale} />
      <GpuScene product={data.gpu} locale={locale} />
      <AssemblyScene venice={data.venice} />
      <CollectionFooter data={data} locale={locale} />
    </main>
  );
}
