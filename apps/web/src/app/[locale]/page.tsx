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
import { toBars, toStoryProduct, type StoryData, type StoryProduct } from '@/story/data';
import type { StoryModel } from '@/three/story/story-scene';

const model = (p: StoryProduct): StoryModel => ({
  preset: p.modelPreset,
  accent: p.accentColor,
  accentAlt: p.accentColorAlt,
  identity: { brand: p.brand, name: p.name, codename: p.codename },
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

  return (
    <main id="content">
      <StoryScroll />
      <StoryRail />
      <ExperienceSlot
        models={{ venice: model(data.venice), turin: model(data.turin), memory: model(data.memory), gpu: model(data.gpu) }}
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
