'use client';

import type { ConfigurationPayload, CreateConfigurationResponse, ProductDetailDto } from '@apex/contracts';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { Suspense, useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useAfterLoad } from '@/hooks/use-after-load';
import { useMediaQuery, usePrefersReducedMotion } from '@/hooks/use-media-query';
import { useWebgl } from '@/hooks/use-webgl';
import { useRouter } from '@/i18n/navigation';
import { apiFetch } from '@/lib/api-client';
import {
  balancedMemoryCounts,
  boardOf,
  boardOptions,
  changeBoard,
  changeCpu,
  changeGpu,
  changeMemory,
  changeSocket,
  defaultPayload,
  evaluate,
  payloadKey,
  productsOf,
  supportsSocket,
  type ConfiguratorCatalog,
} from '@/lib/configurator-state';
import { modelSource } from '@/lib/model-source';
import { renderFor } from '@/lib/renders';
import type { SceneComponent } from '@/three/configurator/configurator-scene';
import { RDIMM_FILLER_URL } from '@/three/models/fillers';
import { RenderImage } from '../ui/render-image';
import { WebglBoundary } from '../experience/webgl-boundary';
import { StatusBadge } from '../ui/status-badge';
import { CountStepper } from './count-stepper';
import { SharedBuildLoader } from './shared-build-loader';
import { BuildSummary } from './summary';

const ConfiguratorScene = dynamic(() => import('@/three/configurator/configurator-scene'), { ssr: false });

type StepKey = 'platform' | 'cpu' | 'memory' | 'gpu';
const STEPS: StepKey[] = ['platform', 'cpu', 'memory', 'gpu'];

type Locale = 'ru' | 'en';

/**
 * Компонент для 3D-превью: реальная модель продукта (GLB), если она есть.
 * Модулей памяти в сборке до 48 — для них вместо полной модели (35 тыс. треугольников) облегчённая.
 */
const sceneComponent = (product: ProductDetailDto | undefined, count: number): SceneComponent | null => {
  if (!product) return null;
  const source = modelSource(product.models);
  return {
    preset: product.modelPreset,
    accent: product.accentColor,
    identity: { brand: product.brand, name: product.name, codename: product.codename },
    count,
    source: source && product.modelPreset === 'RDIMM' ? { url: RDIMM_FILLER_URL } : source,
  };
};

const numberOf = (product: ProductDetailDto | undefined, key: string) =>
  product?.specGroups.flatMap((g) => g.specs).find((s) => s.key === key)?.numericValue ?? null;

/**
 * Конфигуратор (F6): пошагово платформа → процессор → память → видеокарты.
 * Несовместимое недоступно для выбора и подписано причиной; итоги и проверка — тем же движком, что в API.
 */
export function Configurator({ catalog, locale }: { catalog: ConfiguratorCatalog; locale: Locale }) {
  const t = useTranslations('configurator');
  const router = useRouter();
  const [payload, setPayload] = useState<ConfigurationPayload>(() => defaultPayload(catalog));
  const [step, setStep] = useState<StepKey>('platform');
  const [saved, setSaved] = useState<{ code: string; key: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [urlReady, setUrlReady] = useState(false);

  const reducedMotion = usePrefersReducedMotion();
  const quality = useMediaQuery('(pointer: coarse), (max-width: 767px)') ? 'medium' : 'high';
  const webgl = useWebgl();
  // До WebGL-сцены (и без неё) — рендер платы из Blender
  const poster = renderFor('board-sp7');
  const mountScene = useAfterLoad();

  const result = useMemo(() => evaluate(catalog, payload, locale), [catalog, payload, locale]);
  const limits = result.limits;
  const bySlug = useMemo(() => new Map(catalog.products.map((p) => [p.slug, p])), [catalog]);
  const cpu = bySlug.get(payload.cpu.slug);
  const memoryProducts = productsOf(catalog, 'MEMORY');
  const gpuProducts = productsOf(catalog, 'GPU');
  const memory = payload.memory ? bySlug.get(payload.memory.slug) : memoryProducts[0];
  const gpu = payload.gpu ? bySlug.get(payload.gpu.slug) : gpuProducts[0];

  // ── Ссылка на сборку: ?c=код ──────────────────────────────────────────────
  const key = payloadKey(payload);
  const isSaved = saved?.key === key;
  // Сборку изменили после сохранения — старый код из адреса убираем, чтобы им не поделились по ошибке
  useEffect(() => {
    if (!urlReady || isSaved) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has('c')) return;
    url.searchParams.delete('c');
    window.history.replaceState(null, '', url);
  }, [urlReady, isSaved]);

  const onLoaded = useCallback(
    (loaded: ConfigurationPayload | null, code: string | null) => {
      if (loaded && code) {
        // Сохранённая сборка могла устареть относительно каталога — подрезаем под текущие лимиты
        const next = changeBoard(catalog, loaded, loaded.motherboardId);
        setPayload(next);
        setSaved({ code, key: payloadKey(next) });
      }
      setUrlReady(true);
    },
    [catalog],
  );

  const save = useMutation({
    mutationFn: (body: ConfigurationPayload) =>
      apiFetch<CreateConfigurationResponse>('/configurations', { method: 'POST', body }),
  });

  const persist = async () => {
    if (isSaved) return saved.code;
    const { shareCode } = await save.mutateAsync(payload);
    setSaved({ code: shareCode, key });
    const url = new URL(window.location.href);
    url.searchParams.set('c', shareCode);
    window.history.replaceState(null, '', url);
    return shareCode;
  };

  const onShare = async () => {
    await persist();
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch {
      // Буфер обмена недоступен (нет разрешения) — ссылка всё равно в адресной строке
    }
  };

  const intent = result.orderable ? 'QUOTE' : 'INFO';
  const onRequest = async () => {
    const code = await persist();
    router.push({ pathname: '/request', query: { configuration: code, intent } });
  };

  // ── Шаги ──────────────────────────────────────────────────────────────────
  const update = (next: ConfigurationPayload) => setPayload(next);
  const platform = catalog.platforms.find((p) => p.socket === payload.socket)!;
  const boards = useMemo(() => boardOptions(catalog, payload, locale), [catalog, payload, locale]);
  const nf = useMemo(() => new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'en-US', { maximumFractionDigits: 1 }), [locale]);
  const capacity = (gb: number) => (gb >= 1024 ? `${nf.format(gb / 1024)} ${t('units.tb')}` : `${nf.format(gb)} ${t('units.gb')}`);

  const summaries: Record<StepKey, string> = {
    platform: [platform.socket, boards.find((b) => b.board.id === payload.motherboardId)?.board.model ?? t('platform.anyBoard')].join(' · '),
    cpu: cpu ? `${payload.cpu.count} × ${cpu.name}` : '—',
    memory: payload.memory && memory ? `${payload.memory.count} × ${capacity(numberOf(memory, 'memory.capacity') ?? 0)}` : t('memory.none'),
    gpu: payload.gpu && gpu ? `${payload.gpu.count} × ${gpu.name}` : t('gpu.none'),
  };
  const errorFields = new Set(result.issues.filter((i) => i.severity === 'error').map((i) => i.field));
  const stepHasError: Record<StepKey, boolean> = {
    platform: errorFields.has('socket') || errorFields.has('motherboard'),
    cpu: errorFields.has('cpu'),
    memory: errorFields.has('memory'),
    gpu: errorFields.has('gpu'),
  };

  const accent = cpu?.accentColor ?? '#ffffff';
  // Плата в превью: выбранная — как есть; «любая подходящая» — по числу процессоров и слотам платформы
  const board = boardOf(catalog, payload);
  const sceneLayout = board
    ? { sockets: board.sockets, dimmsPerSocket: Math.ceil(board.dimmSlots / board.sockets), gpuSlots: limits.gpuSlots }
    : { sockets: payload.cpu.count, dimmsPerSocket: platform.memoryChannels * (platform.dimmsPerChannel ?? 1), gpuSlots: limits.gpuSlots };

  return (
    <div style={{ '--accent': accent, '--accent-alt': cpu?.accentColorAlt ?? accent } as CSSProperties}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] lg:items-start">
        {/* ── 3D-превью ─────────────────────────────────────────────────── */}
        <div className="relative h-[46svh] min-h-[320px] overflow-hidden rounded-xl border border-line lg:sticky lg:top-[calc(var(--layout-header-h)+1rem)] lg:h-[calc(100svh-var(--layout-header-h)-2rem)]">
          {poster && (
            <RenderImage
              render={poster}
              alt=""
              sizes="(min-width: 1024px) 60vw, 100vw"
              priority
              className="absolute inset-0 size-full object-contain"
            />
          )}
          {webgl === 'supported' && mountScene && (
            <WebglBoundary>
              <ConfiguratorScene
                layout={sceneLayout}
                accent={accent}
                cpu={sceneComponent(cpu, payload.cpu.count)}
                memory={sceneComponent(memory, payload.memory?.count ?? 0)}
                gpu={sceneComponent(gpu, payload.gpu?.count ?? 0)}
                quality={quality}
                reducedMotion={reducedMotion}
              />
            </WebglBoundary>
          )}
          <p className="pointer-events-none absolute left-4 top-4 font-mono text-caption uppercase tracking-caption text-fg-tertiary" aria-hidden>
            <span className="pointer-coarse:hidden">{t('viewerHint')}</span>
            <span className="hidden pointer-coarse:inline">{t('viewerHintTouch')}</span>
          </p>
          <p className="sr-only">{t('viewerLabel')}</p>
        </div>

        {/* ── Шаги и итоги ──────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4">
          <Suspense fallback={null}>
            <SharedBuildLoader onLoaded={onLoaded} />
          </Suspense>

          <ol className="flex flex-col gap-3">
            {STEPS.map((key, index) => (
              <Step
                key={key}
                index={index}
                title={t(`steps.${key}`)}
                summary={summaries[key]}
                open={step === key}
                error={stepHasError[key]}
                onOpen={() => setStep(key)}
                onNext={index < STEPS.length - 1 ? () => setStep(STEPS[index + 1]!) : undefined}
                nextLabel={t('next')}
              >
                {key === 'platform' && (
                  <div className="flex flex-col gap-5">
                    <div role="radiogroup" aria-label={t('steps.platform')} className="flex flex-col gap-2">
                      {catalog.platforms.map((p) => (
                        <Choice key={p.socket} checked={p.socket === payload.socket} onSelect={() => update(changeSocket(catalog, payload, p.socket))}>
                          <span className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-h3">{p.socket}</span>
                            <StatusBadge status={p.status} window={p.availabilityWindow} locale={locale} />
                          </span>
                          <span className="mt-1 block text-small text-fg-secondary">{p.cpuFamily}</span>
                          <span className="mt-2 block font-mono text-caption text-fg-tertiary">
                            {t('platform.channels', { count: p.memoryChannels })} · {t('platform.pcie', { gen: p.pcieGen })} ·{' '}
                            {t('platform.tdp', { tdp: p.maxCpuTdpW })}
                          </span>
                        </Choice>
                      ))}
                    </div>

                    <fieldset>
                      <legend className="eyebrow mb-3">{t('platform.board')}</legend>
                      <div role="radiogroup" aria-label={t('platform.board')} className="flex flex-col gap-2">
                        <Choice compact checked={payload.motherboardId === null} onSelect={() => update(changeBoard(catalog, payload, null))}>
                          <span className="font-medium">{t('platform.anyBoard')}</span>
                          <span className="block text-caption text-fg-tertiary">{t('platform.anyBoardNote')}</span>
                        </Choice>
                        {boards.map(({ board, fits, reason }) => (
                          <Choice
                            key={board.id}
                            compact
                            checked={payload.motherboardId === board.id}
                            disabled={!fits}
                            onSelect={() => update(changeBoard(catalog, payload, board.id))}
                          >
                            <span className="flex items-baseline justify-between gap-3">
                              <span className="font-medium">
                                {board.vendor} {board.model}
                              </span>
                              <span className="shrink-0 font-mono text-caption text-fg-tertiary">
                                {t('platform.boardSpec', { sockets: board.sockets, slots: board.dimmSlots })}
                              </span>
                            </span>
                            {reason ? (
                              <span className="mt-1 block text-caption text-[#ff6b61]">{reason}</span>
                            ) : (
                              board.isPlaceholder && <span className="mt-1 block text-caption text-badge-coming">{t('platform.pending')}</span>
                            )}
                          </Choice>
                        ))}
                      </div>
                    </fieldset>
                  </div>
                )}

                {key === 'cpu' && (
                  <div className="flex flex-col gap-5">
                    <div role="radiogroup" aria-label={t('steps.cpu')} className="flex flex-col gap-2">
                      {productsOf(catalog, 'CPU').map((product) => {
                        const fits = supportsSocket(product, payload.socket);
                        return (
                          <Choice
                            key={product.slug}
                            checked={product.slug === payload.cpu.slug}
                            disabled={!fits}
                            onSelect={() => update(changeCpu(catalog, payload, { slug: product.slug }))}
                          >
                            <span className="flex items-baseline justify-between gap-3">
                              <span className="font-medium">
                                {product.brand} {product.name}
                              </span>
                              <StatusBadge status={product.status} window={product.availabilityWindow} locale={locale} />
                            </span>
                            <span className="mt-1 block font-mono text-caption text-fg-tertiary">
                              {t('cpu.spec', { cores: numberOf(product, 'cpu.cores') ?? 0, tdp: numberOf(product, 'cpu.tdp') ?? 0 })}
                            </span>
                            {!fits && (
                              <span className="mt-1 block text-caption text-[#ff6b61]">
                                {t('cpu.requires', { socket: product.compatibility.map((c) => c.socket).join(' / ') })}
                              </span>
                            )}
                          </Choice>
                        );
                      })}
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-small text-fg-secondary">{t('cpu.count')}</span>
                      <div role="radiogroup" aria-label={t('cpu.count')} className="flex rounded-pill border border-line p-0.5">
                        {[1, 2].map((count) => (
                          <button
                            key={count}
                            type="button"
                            role="radio"
                            aria-checked={payload.cpu.count === count}
                            disabled={count > limits.sockets}
                            onClick={() => update(changeCpu(catalog, payload, { count }))}
                            className="h-9 rounded-pill px-5 font-mono text-small text-fg-secondary transition-colors hover:text-fg disabled:pointer-events-none disabled:opacity-30 aria-checked:bg-fg aria-checked:text-void"
                          >
                            {count}P
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {key === 'memory' && memory && (
                  <div className="flex flex-col gap-4">
                    <p className="text-small">
                      <span className="font-medium">
                        {memory.brand} {memory.name}
                      </span>{' '}
                      <StatusBadge status={memory.status} window={memory.availabilityWindow} locale={locale} />
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <CountStepper
                        label={t('memory.count')}
                        value={payload.memory?.count ?? 0}
                        min={0}
                        max={limits.memorySlots}
                        onChange={(count) => update(changeMemory(catalog, payload, memory.slug, count))}
                      />
                      <p className="text-right font-mono text-caption text-fg-tertiary">
                        {t('memory.slots', { used: payload.memory?.count ?? 0, total: limits.memorySlots })}
                        <br />
                        <span className="text-small text-fg">{capacity(result.totals.memoryGb)}</span>
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {balancedMemoryCounts(catalog, payload).map((count, i) => (
                        <button
                          key={count}
                          type="button"
                          aria-pressed={payload.memory?.count === count}
                          onClick={() => update(changeMemory(catalog, payload, memory.slug, count))}
                          className="h-8 rounded-pill border border-line px-3 text-caption text-fg-secondary transition-colors hover:text-fg aria-pressed:border-accent aria-pressed:text-fg"
                        >
                          {t(i === 0 ? 'memory.balanced' : 'memory.doubled', { count })}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {key === 'gpu' && gpu && (
                  <div className="flex flex-col gap-4">
                    <p className="text-small">
                      <span className="font-medium">
                        {gpu.brand} {gpu.name}
                      </span>{' '}
                      <StatusBadge status={gpu.status} window={gpu.availabilityWindow} locale={locale} />
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <CountStepper
                        label={t('gpu.count')}
                        value={payload.gpu?.count ?? 0}
                        min={0}
                        max={limits.gpuSlots}
                        onChange={(count) => update(changeGpu(catalog, payload, gpu.slug, count))}
                      />
                      <p className="text-right font-mono text-caption text-fg-tertiary">
                        {t('gpu.slots', { used: payload.gpu?.count ?? 0, total: limits.gpuSlots })}
                        <br />
                        <span className="text-small text-fg">{capacity(result.totals.vramGb)}</span>
                      </p>
                    </div>
                  </div>
                )}
              </Step>
            ))}
          </ol>

          <BuildSummary
            result={result}
            locale={locale}
            saving={save.isPending}
            saveFailed={save.isError}
            savedCode={isSaved ? saved.code : null}
            copied={copied}
            intent={intent}
            onShare={() => void onShare().catch(() => undefined)}
            onRequest={() => void onRequest().catch(() => undefined)}
          />
        </div>
      </div>
    </div>
  );
}

/** Шаг-аккордеон: заголовок с номером и выбранным вариантом, содержимое — только у открытого шага. */
function Step({
  index,
  title,
  summary,
  open,
  error,
  onOpen,
  onNext,
  nextLabel,
  children,
}: {
  index: number;
  title: string;
  summary: string;
  open: boolean;
  error: boolean;
  onOpen: () => void;
  onNext?: () => void;
  nextLabel: string;
  children: ReactNode;
}) {
  const id = `step-${index}`;
  return (
    <li className={`glass transition-colors ${open ? '' : 'hover:bg-white/[0.04]'}`}>
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={onOpen}
          className="flex w-full items-center gap-4 p-5 text-left"
        >
          <span className={`font-mono text-caption ${error ? 'text-[#ff6b61]' : 'text-accent'}`}>0{index + 1}</span>
          <span className="flex-1">
            <span className="block text-body font-medium">{title}</span>
            {!open && <span className="mt-0.5 block truncate text-small text-fg-tertiary">{summary}</span>}
          </span>
          {error && <span className="size-2 rounded-full bg-[#ff6b61] shadow-[0_0_10px_#ff6b61]" aria-hidden />}
          <span aria-hidden className={`text-fg-tertiary transition-transform ${open ? 'rotate-180' : ''}`}>
            ▾
          </span>
        </button>
      </h2>
      {open && (
        <div id={id} className="px-5 pb-5">
          {children}
          {onNext && (
            <button type="button" onClick={onNext} className="mt-5 text-small font-medium text-fg-secondary hover:text-fg">
              {nextLabel} <span aria-hidden>→</span>
            </button>
          )}
        </div>
      )}
    </li>
  );
}

/** Вариант выбора: карточка-радио с подписью причины, если вариант недоступен. */
function Choice({
  checked,
  disabled = false,
  compact = false,
  onSelect,
  children,
}: {
  checked: boolean;
  disabled?: boolean;
  compact?: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-disabled={disabled}
      onClick={() => {
        if (!disabled && !checked) onSelect();
      }}
      className={`block w-full rounded-lg border text-left transition-colors ${compact ? 'px-4 py-3' : 'p-4'} ${
        checked ? 'border-accent bg-white/[0.05] shadow-[inset_0_0_0_1px_var(--accent)]' : 'border-line hover:border-fg/30'
      } ${disabled ? 'cursor-not-allowed opacity-60 hover:border-line' : ''}`}
    >
      {children}
    </button>
  );
}
