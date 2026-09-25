import type { Render } from '@/lib/renders';

/**
 * Рендер модели: AVIF с запасным WebP, ширина по srcset.
 * Файлы уже оптимизированы при сборке (scripts/renders.mjs), поэтому next/image не нужен.
 * priority — картинка первого экрана (кандидат LCP): грузится сразу и с высоким приоритетом.
 */
export function RenderImage({
  render,
  alt,
  sizes,
  priority = false,
  className,
}: {
  render: Render;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <picture>
      <source type="image/avif" srcSet={render.avif} sizes={sizes} />
      <img
        src={render.src}
        srcSet={render.webp}
        sizes={sizes}
        width={render.width}
        height={render.height}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
        className={className}
      />
    </picture>
  );
}
