/**
 * Дизайн-токены APEX // Compute Collection — концепция «тёмный выставочный зал».
 *
 * Этот файл — единый источник истины. Кто его использует:
 *  - tokens.css — CSS-зеркало (`:root` + `@theme` для Tailwind 4); синхронность проверяет tokens.test.ts;
 *  - 3D-сцена — Three.js не читает CSS-переменные, поэтому цвета и материалы берёт отсюда;
 *  - @apex/collection — акцентные цвета продуктов для сидов БД.
 *
 * Контраст (WCAG 2.2) в комментариях посчитан относительно --bg-void (#050507).
 * Тёмная тема — единственная.
 */

export const color = {
  bgVoid: '#050507',
  bgElevated: '#0c0d12',
  /** Используется вместе с backdrop-filter: blur(var(--glass-blur)) */
  bgGlass: 'rgba(255, 255, 255, 0.03)',
  borderSubtle: 'rgba(255, 255, 255, 0.08)',
  borderStrong: 'rgba(255, 255, 255, 0.16)',
  /** 18.7 : 1 */
  textPrimary: '#f5f5f7',
  /** 6.25 : 1 — AA для любого кегля */
  textSecondary: '#8e8e93',
  /** 4.9 : 1 — самый тёмный цвет, допустимый для мелкого текста (сноски, подписи осей) */
  textTertiary: '#7c7c80',
  /**
   * 2.23 : 1 — НЕ для текста. Только разделители, декор и неактивные контролы
   * (WCAG 1.4.3 не требует контраста для disabled-состояний).
   */
  textMuted: '#48484a',
  /** «Ювелирные» детали: контакты, риски шкал, тонкие обводки. 8.42 : 1 */
  goldContact: '#c9a227',
} as const;

/**
 * Акценты продуктов: свет в 3D-сцене, градиенты, цифры.
 * solid — основной цвет, alt — второй цвет градиента.
 *
 * Контраст solid: epyc9965 5.74, venice 5.58, memory 10.07, gpu 8.45.
 * ⚠ Фиолетовый конец venice (#5e5ce6) даёт 4.02 : 1 — AA только для крупного текста
 * (≥ 24px или ≥ 18.66px bold). Градиент — для крупных цифр и заголовков, мелкий текст — solid.
 */
export const accents = {
  epyc9965: { solid: '#ff3b30' },
  venice: { solid: '#0a84ff', alt: '#5e5ce6' },
  memory: { solid: '#30d158' },
  gpu: { solid: '#76b900' },
} as const satisfies Record<string, { solid: string; alt?: string }>;

export type AccentKey = keyof typeof accents;

/** [основной, второй] цвет акцента; для одноцветных акцентов оба совпадают. */
export function accentPair(key: AccentKey): readonly [string, string] {
  const accent: { solid: string; alt?: string } = accents[key];
  return [accent.solid, accent.alt ?? accent.solid];
}

/** Стиль для React: перекрашивает всё, что внутри, в акцент конкретного продукта из БД. */
export function accentStyle(solid: string, alt?: string | null): Record<'--accent' | '--accent-alt', string> {
  return { '--accent': solid, '--accent-alt': alt ?? solid };
}

/** Цвета бейджей статуса (enum ProductStatus в @apex/contracts). */
export const badge = {
  available: '#30d158',
  coming: '#409cff',
  preview: color.goldContact,
} as const;

/**
 * Типографика. Inter с осью оптического размера (opsz 14–32) закрывает и текст, и «Inter Display»:
 * при `font-optical-sizing: auto` крупные заголовки автоматически получают дисплейное начертание.
 * Space Grotesk отклонён — в нём нет кириллицы.
 * --ff-inter / --ff-jetbrains выставляет next/font; второй аргумент var() — фолбэк до загрузки.
 */
export const typography = {
  family: {
    display: "var(--ff-inter, 'Inter'), system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    body: "var(--ff-inter, 'Inter'), system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    mono: "var(--ff-jetbrains, 'JetBrains Mono'), ui-monospace, 'SF Mono', Consolas, monospace",
  },
  size: {
    /** До 160px на больших экранах; ограничен и высотой, чтобы на ноутбуках оставалось место экспонату */
    hero: 'clamp(3.5rem, min(10vw, 13vh), 10rem)',
    display: 'clamp(2.75rem, 7vw, 6rem)',
    h1: 'clamp(2.25rem, 4.5vw, 4rem)',
    h2: 'clamp(1.75rem, 3vw, 2.75rem)',
    h3: 'clamp(1.25rem, 2vw, 1.75rem)',
    /** 18 → 19px */
    lead: 'clamp(1.125rem, 1rem + 0.35vw, 1.1875rem)',
    /** 17 → 18px */
    body: 'clamp(1.0625rem, 1rem + 0.2vw, 1.125rem)',
    small: '0.9375rem',
    caption: '0.75rem',
    /** Анимированные счётчики (моноширинный, tabular-nums) */
    statXl: 'clamp(4rem, 13vw, 11rem)',
    stat: 'clamp(2.5rem, 5vw, 4.5rem)',
  },
  leading: { hero: '0.92', display: '0.98', heading: '1.08', body: '1.6' },
  tracking: { heading: '-0.03em', caption: '0.14em' },
  weight: { heading: '700', display: '800' },
} as const;

export const layout = {
  maxWidth: '1440px',
  /** Боковой отступ: 16px на телефоне → 48px на десктопе */
  gutter: 'clamp(1rem, 4vw, 3rem)',
  sectionY: 'clamp(6rem, 14vh, 12rem)',
  headerHeight: '72px',
} as const;

export const corner = {
  sm: '8px',
  md: '14px',
  lg: '24px',
  xl: '32px',
  pill: '999px',
} as const;

export const motion = {
  curve: {
    outExpo: 'cubic-bezier(0.16, 1, 0.3, 1)',
    inOutQuart: 'cubic-bezier(0.76, 0, 0.24, 1)',
    premium: 'cubic-bezier(0.22, 1, 0.36, 1)',
  },
  duration: {
    fast: '180ms',
    base: '320ms',
    slow: '700ms',
    reveal: '1100ms',
    curtain: '900ms',
  },
  /** Те же кривые в терминах GSAP */
  gsap: { outExpo: 'expo.out', inOutQuart: 'quart.inOut', premium: 'power3.out' },
  /** Шаг stagger для появления текста, секунды */
  stagger: { words: 0.06, letters: 0.025 },
  lenis: { lerp: 0.085, wheelMultiplier: 1, touchMultiplier: 1.4 },
  /** Прелоадер не должен длиться дольше — дальше показываем сайт с плейсхолдерами */
  preloaderMaxMs: 2500,
} as const;

export const effects = {
  glassBlur: '20px',
  /** Film grain поверх всего, 3–4% */
  grainOpacity: '0.035',
  borderGradient:
    'linear-gradient(135deg, rgba(255, 255, 255, 0.18) 0%, rgba(255, 255, 255, 0.02) 45%, rgba(255, 255, 255, 0.08) 100%)',
  glowAccent: '0 0 48px -8px color-mix(in oklab, var(--accent) 45%, transparent)',
  cursorSize: '14px',
  cursorSizeActive: '56px',
} as const;

export const zIndex = {
  canvas: 0,
  content: 10,
  header: 50,
  overlay: 80,
  cursor: 90,
  preloader: 100,
  /** Зерно выше всего, но с pointer-events: none */
  grain: 110,
} as const;

/** Совпадают с брейкпоинтами Tailwind по умолчанию */
export const breakpoints = { sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536 } as const;

/** Токены 3D-сцены (React Three Fiber). */
export const scene = {
  clearColor: color.bgVoid,
  toneMapping: 'ACESFilmic',
  exposure: 1,
  materials: {
    /** Крышка IHS: полированный никель */
    ihsMetal: { color: '#c7cad1', roughness: 0.25, metalness: 1, clearcoat: 0.3, clearcoatRoughness: 0.2 },
    /** Органическая подложка корпуса CPU */
    substrate: { color: '#12141b', roughness: 0.55, metalness: 0.15, clearcoat: 0.6, clearcoatRoughness: 0.35 },
    /** Открытые кристаллы (CCD, I/O, GPU) */
    silicon: { color: '#1a1c28', roughness: 0.18, metalness: 0.7, clearcoat: 1, clearcoatRoughness: 0.05 },
    goldContact: { color: color.goldContact, roughness: 0.3, metalness: 1 },
    /** Текстолит плат и модулей памяти */
    pcb: { color: '#0b0f0d', roughness: 0.7, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.4 },
  },
  /** Пресеты переключателя освещения на странице продукта. rim окрашивается в акцент продукта. */
  lighting: {
    studio: { environmentIntensity: 0.6, key: 3.2, fill: 0.8, rim: 2.4, tint: '#ffffff' },
    serverRoom: { environmentIntensity: 0.35, key: 2.0, fill: 0.4, rim: 3.2, tint: '#9ecbff' },
    neon: { environmentIntensity: 0.2, key: 1.2, fill: 0.2, rim: 5.0, tint: '#ff4fd8' },
  },
  /**
   * Selective bloom по яркости: порог 1 в HDR-буфере — светятся только эмиссивные элементы
   * с toneMapped: false (дорожки, импульсы, кристаллы), а блики на металле — нет.
   */
  bloom: { intensity: 1.15, luminanceThreshold: 1, luminanceSmoothing: 0.25, mipmapBlur: true },
} as const;

export type LightingPreset = keyof typeof scene.lighting;

/**
 * Плоская карта CSS-переменных для `:root` в tokens.css.
 * Имена не пересекаются с пространствами имён Tailwind 4 (--color-*, --radius-*, --ease-* …),
 * чтобы маппинг в `@theme inline` не порождал циклических ссылок.
 */
export const cssVariables = {
  '--bg-void': color.bgVoid,
  '--bg-elevated': color.bgElevated,
  '--bg-glass': color.bgGlass,
  '--border-subtle': color.borderSubtle,
  '--border-strong': color.borderStrong,
  '--text-primary': color.textPrimary,
  '--text-secondary': color.textSecondary,
  '--text-tertiary': color.textTertiary,
  '--text-muted': color.textMuted,
  '--gold-contact': color.goldContact,

  '--accent-epyc9965': accents.epyc9965.solid,
  '--accent-venice-from': accents.venice.solid,
  '--accent-venice-to': accents.venice.alt,
  '--accent-venice': `linear-gradient(135deg, ${accents.venice.solid} 0%, ${accents.venice.alt} 100%)`,
  '--accent-memory': accents.memory.solid,
  '--accent-gpu': accents.gpu.solid,
  '--accent': 'var(--accent-venice-from)',
  '--accent-alt': 'var(--accent-venice-to)',

  '--badge-available': badge.available,
  '--badge-coming': badge.coming,
  '--badge-preview': badge.preview,

  '--ff-display': typography.family.display,
  '--ff-body': typography.family.body,
  '--ff-mono': typography.family.mono,
  '--fs-hero': typography.size.hero,
  '--fs-display': typography.size.display,
  '--fs-h1': typography.size.h1,
  '--fs-h2': typography.size.h2,
  '--fs-h3': typography.size.h3,
  '--fs-lead': typography.size.lead,
  '--fs-body': typography.size.body,
  '--fs-small': typography.size.small,
  '--fs-caption': typography.size.caption,
  '--fs-stat-xl': typography.size.statXl,
  '--fs-stat': typography.size.stat,
  '--lh-hero': typography.leading.hero,
  '--lh-display': typography.leading.display,
  '--lh-heading': typography.leading.heading,
  '--lh-body': typography.leading.body,
  '--ls-heading': typography.tracking.heading,
  '--ls-caption': typography.tracking.caption,
  '--fw-heading': typography.weight.heading,
  '--fw-display': typography.weight.display,

  '--layout-max': layout.maxWidth,
  '--layout-gutter': layout.gutter,
  '--layout-section-y': layout.sectionY,
  '--layout-header-h': layout.headerHeight,

  '--corner-sm': corner.sm,
  '--corner-md': corner.md,
  '--corner-lg': corner.lg,
  '--corner-xl': corner.xl,
  '--corner-pill': corner.pill,

  '--curve-out-expo': motion.curve.outExpo,
  '--curve-in-out-quart': motion.curve.inOutQuart,
  '--curve-premium': motion.curve.premium,
  '--dur-fast': motion.duration.fast,
  '--dur-base': motion.duration.base,
  '--dur-slow': motion.duration.slow,
  '--dur-reveal': motion.duration.reveal,
  '--dur-curtain': motion.duration.curtain,

  '--glass-blur': effects.glassBlur,
  '--grain-opacity': effects.grainOpacity,
  '--border-gradient': effects.borderGradient,
  '--glow-accent': effects.glowAccent,
  '--cursor-size': effects.cursorSize,
  '--cursor-size-active': effects.cursorSizeActive,

  '--z-canvas': String(zIndex.canvas),
  '--z-content': String(zIndex.content),
  '--z-header': String(zIndex.header),
  '--z-overlay': String(zIndex.overlay),
  '--z-cursor': String(zIndex.cursor),
  '--z-preloader': String(zIndex.preloader),
  '--z-grain': String(zIndex.grain),
} as const satisfies Record<`--${string}`, string>;

export type CssVariable = keyof typeof cssVariables;
