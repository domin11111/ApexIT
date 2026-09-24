import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { BEATS } from '@/story/clock';
import { num, val, type StoryData, type StoryProduct } from '@/story/data';
import { GlowCard } from '../ui/glow-card';
import { Magnetic } from '../ui/magnetic';
import { StatusBadge } from '../ui/status-badge';
import { RevealText } from './reveal-text';
import { StoryBars } from './story-bars';
import { StoryCounter } from './story-counter';
import { StoryFade } from './story-fade';
import { StorySection } from './story-section';

type SceneProps = { locale: 'ru' | 'en' };

const accentOf = (p: StoryProduct): [string, string | null] => [p.accentColor, p.accentColorAlt];
const fullName = (p: StoryProduct) => `${p.brand} ${p.name}${p.codename ? ` «${p.codename}»` : ''}`;

// ── Сцена 2. Чиплеты ──────────────────────────────────────────────────────────
export function ChipletsScene({ product, locale }: SceneProps & { product: StoryProduct }) {
  const t = useTranslations('story.chiplets');
  return (
    <StorySection id="chiplets" labelledBy="chiplets-title" accent={accentOf(product)}>
      <div className="flex h-full max-w-[30rem] flex-col justify-between md:justify-center md:gap-14">
        <div>
          <p className="eyebrow mb-5">
            {fullName(product)} · {val(product, 'cpu.architecture')}
          </p>
          <RevealText id="chiplets-title" className="text-h1">
            {t('title')}
          </RevealText>
          <p className="mt-6 hidden text-body text-fg-secondary sm:block">{t('body')}</p>
        </div>
        <div>
          <p className="text-accent-gradient text-stat-xl font-medium">
            <StoryCounter at={{ scene: 'chiplets', beat: 'cores' }} value={num(product, 'cpu.cores', 256)} label={t('counter')} locale={locale} />
          </p>
          <p className="eyebrow mt-2">{t('counter')}</p>
          <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-1 font-mono text-small text-fg-secondary">
            <li>L3 {val(product, 'cpu.l3Cache')}</li>
            <li>{val(product, 'cpu.process').split('·')[0]}</li>
            <li>{val(product, 'cpu.ccdLayout')}</li>
          </ul>
        </div>
      </div>
    </StorySection>
  );
}

// ── Сцена 3. Поколения ────────────────────────────────────────────────────────
export function GenerationsScene({ venice, turin, bars }: { venice: StoryProduct; turin: StoryProduct; bars: StoryData['bars'] }) {
  const t = useTranslations('story.generations');
  return (
    <StorySection id="generations" labelledBy="generations-title" accent={accentOf(venice)}>
      <div className="flex h-full flex-col justify-between">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow mb-5">{t('eyebrow')}</p>
          <RevealText id="generations-title" className="text-h1">
            {t('title')}
          </RevealText>
          <p className="mt-5 hidden text-body text-fg-secondary sm:block">{t('body')}</p>
        </div>
        <div className="mx-auto w-full max-w-3xl">
          <div className="mb-2 flex justify-between font-mono text-caption uppercase tracking-caption">
            <span style={{ color: turin.accentColor }}>{bars.names[0]}</span>
            <span style={{ color: venice.accentColor }}>{bars.names[1]}</span>
          </div>
          <StoryBars rows={bars.rows} names={bars.names} accents={[turin.accentColor, venice.accentColor]} />
        </div>
      </div>
    </StorySection>
  );
}

// ── Сцена 4. Память ───────────────────────────────────────────────────────────
export function MemoryScene({ product, locale }: SceneProps & { product: StoryProduct }) {
  const t = useTranslations('story.memory');
  const { ghosts, merge } = BEATS.memory;
  return (
    <StorySection id="memory" labelledBy="memory-title" accent={accentOf(product)}>
      <div className="flex h-full max-w-[30rem] flex-col justify-between md:justify-center md:gap-14">
        <div>
          <p className="eyebrow mb-5">{fullName(product)}</p>
          <RevealText id="memory-title" className="text-h1">
            {product.tagline}
          </RevealText>
          <p className="mt-6 hidden text-body text-fg-secondary sm:block">{t('body')}</p>
        </div>

        <div className="relative min-h-[11rem]">
          {/* Сначала — объём модуля, затем — сравнение энергопотребления */}
          <StoryFade scene="memory" show={[0, 0.01]} hide={[ghosts[0] - 0.08, ghosts[0]]} className="absolute inset-x-0 top-0">
            <p className="text-accent-gradient text-stat-xl font-medium">
              <StoryCounter at={{ scene: 'memory', beat: 'capacity' }} value={num(product, 'memory.capacity', 512)} label={t('counter')} locale={locale} />
            </p>
            <p className="eyebrow mt-2">{t('counter')}</p>
          </StoryFade>

          <StoryFade scene="memory" show={ghosts} hide={[merge[0], merge[0] + 0.08]} className="absolute inset-x-0 top-0">
            <p className="eyebrow">{t('before')}</p>
            <p className="mt-2 font-mono text-stat text-fg-secondary tabular-nums">{val(product, 'memory.powerBaseline')}</p>
          </StoryFade>

          <StoryFade scene="memory" show={[merge[0] + 0.08, merge[1]]} className="absolute inset-x-0 top-0">
            <p className="eyebrow">{t('after')}</p>
            <p className="text-accent-gradient mt-2 font-mono text-stat font-medium tabular-nums">{val(product, 'memory.power')}</p>
            <p className="mt-3 font-mono text-small text-fg-secondary">
              {val(product, 'memory.powerSaving')} {t('saving')}
            </p>
          </StoryFade>
        </div>
      </div>
    </StorySection>
  );
}

// ── Сцена 5. GPU ──────────────────────────────────────────────────────────────
export function GpuScene({ product, locale }: SceneProps & { product: StoryProduct }) {
  const t = useTranslations('story.gpu');
  const counters = [
    { beat: 'vram', value: num(product, 'gpu.vram', 96), label: t('vram') },
    { beat: 'cuda', value: num(product, 'gpu.cudaCores', 24064), label: t('cuda') },
    { beat: 'bandwidth', value: num(product, 'gpu.memoryBandwidth', 1792), label: t('bandwidth') },
  ] as const;
  return (
    <StorySection id="gpu" labelledBy="gpu-title" accent={accentOf(product)}>
      <div className="flex h-full max-w-[34rem] flex-col justify-between md:justify-center md:gap-14">
        <div>
          <p className="eyebrow mb-5">{fullName(product)}</p>
          <RevealText id="gpu-title" className="text-h1">
            {product.tagline}
          </RevealText>
          <p className="mt-6 hidden text-body text-fg-secondary sm:block">{t('body')}</p>
        </div>
        <dl className="grid grid-cols-3 gap-4">
          {counters.map((counter) => (
            <div key={counter.beat}>
              <dd className="text-accent-gradient text-h2 font-medium">
                <StoryCounter at={{ scene: 'gpu', beat: counter.beat }} value={counter.value} label={counter.label} locale={locale} />
              </dd>
              <dt className="eyebrow mt-1 normal-case tracking-normal">{counter.label}</dt>
            </div>
          ))}
        </dl>
      </div>
    </StorySection>
  );
}

// ── Сцена 6. Сборка ───────────────────────────────────────────────────────────
export function AssemblyScene({ venice }: { venice: StoryProduct }) {
  const t = useTranslations('story.assembly');
  return (
    <StorySection id="assembly" labelledBy="assembly-title" accent={accentOf(venice)}>
      <div className="flex h-full max-w-[30rem] flex-col justify-between">
        <div>
          <p className="eyebrow mb-5">{t('eyebrow')}</p>
          <RevealText id="assembly-title" className="text-h1">
            {t('title')}
          </RevealText>
          <p className="mt-6 hidden text-body text-fg-secondary sm:block">{t('body')}</p>
        </div>
        <StoryFade scene="assembly" show={BEATS.assembly.cta}>
          <Magnetic>
            <Link
              href="/configurator"
              className="inline-flex h-14 items-center gap-3 rounded-pill bg-fg px-8 text-body font-medium text-void transition-[box-shadow] duration-[var(--dur-base)] hover:shadow-[var(--glow-accent)]"
            >
              {t('cta')} <span aria-hidden>→</span>
            </Link>
          </Magnetic>
        </StoryFade>
      </div>
    </StorySection>
  );
}

// ── Сцена 7. Каталог, контакты, дисклеймер ────────────────────────────────────
export function CollectionFooter({ data, locale }: SceneProps & { data: StoryData }) {
  const t = useTranslations('story.footer');
  return (
    <footer
      data-scene="footer"
      aria-labelledby="collection-title"
      className="relative z-[var(--z-content)] bg-gradient-to-b from-transparent via-void/85 to-void pt-[30vh]"
    >
      <div className="mx-auto max-w-[var(--layout-max)] px-[var(--layout-gutter)] pb-12">
        <RevealText id="collection-title" className="text-h1">
          {t('title')}
        </RevealText>

        <ul className="mt-12 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {data.collection.map((product) => (
            <li key={product.slug}>
              <GlowCard accent={product.accentColor} className="flex h-full flex-col gap-4 p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <span className="font-mono text-caption uppercase tracking-caption" style={{ color: product.accentColor }}>
                    {product.headline}
                  </span>
                  <StatusBadge status={product.status} window={product.availabilityWindow} locale={locale} />
                </div>
                <h3 className="text-h3">
                  {product.brand} {product.name}
                </h3>
                <p className="text-small text-fg-secondary">{product.tagline}</p>
                <dl className="mt-auto grid grid-cols-2 gap-3 border-t border-line pt-4">
                  {product.highlights.slice(0, 2).map((spec) => (
                    <div key={spec.key}>
                      <dt className="text-caption text-fg-tertiary">{spec.label}</dt>
                      <dd className="font-mono text-small tabular-nums">{spec.value}</dd>
                    </div>
                  ))}
                </dl>
                <Link href={`/products/${product.slug}`} data-transition-label={`${product.brand} ${product.name}`} className="text-small font-medium after:absolute after:inset-0 hover:text-accent">
                  {t('details')} <span aria-hidden>→</span>
                </Link>
              </GlowCard>
            </li>
          ))}
        </ul>

        <div className="mt-20 grid gap-10 border-t border-line pt-10 md:grid-cols-[1fr_2fr]">
          <div>
            <p className="eyebrow mb-4">{t('contacts')}</p>
            <p className="flex flex-col gap-1 text-body">
              <a href={`mailto:${t('email')}`} className="hover:text-accent">
                {t('email')}
              </a>
              <span className="text-fg-secondary">{t('telegram')}</span>
            </p>
          </div>
          <div className="text-small text-fg-tertiary">
            <p>{t('disclaimer')}</p>
            <p className="mt-6 font-mono text-caption">{t('rights')}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
