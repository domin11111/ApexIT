import { setRequestLocale } from 'next-intl/server';
import { ExperienceSlot } from '@/components/experience/experience-slot';
import { HeroSection } from '@/components/hero/hero-section';
import { TeaserSection } from '@/components/hero/teaser-section';
import { getProduct } from '@/lib/catalog';
import type { routing } from '@/i18n/routing';

/** Главная-презентация. Этап 3 — сцена hero; сцены 2–7 добавит этап 4. */
export default async function HomePage({ params }: PageProps<'/[locale]'>) {
  const { locale } = (await params) as { locale: (typeof routing.locales)[number] };
  setRequestLocale(locale);

  const venice = await getProduct('epyc-9996-venice', locale);

  return (
    <main id="content">
      <ExperienceSlot
        hero={{
          preset: venice.modelPreset,
          accent: venice.accentColor,
          accentAlt: venice.accentColorAlt,
          identity: { brand: venice.brand, name: venice.name, codename: venice.codename },
        }}
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
      <TeaserSection />
    </main>
  );
}
