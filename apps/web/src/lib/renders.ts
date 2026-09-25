import manifest from '../../public/renders/renders.json';

/*
 * Статичные рендеры моделей из Blender (scripts/renders.mjs → public/renders).
 * Постеры 3D-сцен (LCP-картинка до загрузки WebGL), фолбэк без WebGL, JSON-LD и OpenGraph.
 */

export type RenderView = 'hero' | 'exploded' | 'top';

export type Render = {
  width: number;
  height: number;
  /** srcset AVIF и WebP: 800w и 1600w */
  avif: string;
  webp: string;
  /** Запасной src для браузеров без srcset */
  src: string;
};

const sizes = manifest as Record<string, { width: number; height: number }>;

/** Рендер по ключу (slug продукта или board-sp7) и виду; null — рендера нет. */
export function renderFor(key: string, view: RenderView = 'hero'): Render | null {
  const id = `${key}-${view}`;
  const size = sizes[id];
  if (!size) return null;
  const set = (ext: string) => `/renders/${id}-800.${ext} 800w, /renders/${id}-1600.${ext} 1600w`;
  return { ...size, avif: set('avif'), webp: set('webp'), src: `/renders/${id}-1600.webp` };
}
