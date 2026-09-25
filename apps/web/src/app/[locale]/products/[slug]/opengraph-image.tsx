import type { routing } from '@/i18n/routing';
import { getProduct, getProducts } from '@/lib/catalog';
import { OG_SIZE, ogImage } from '@/lib/og';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'APEX // Compute Collection';

type Locale = (typeof routing.locales)[number];

export async function generateStaticParams() {
  const { items } = await getProducts('ru');
  return items.map((product) => ({ slug: product.slug }));
}

/** OG-картинка продукта: рендер модели из Blender, название, слоган в цвете продукта. */
export default async function ProductOgImage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = (await params) as { locale: Locale; slug: string };
  const product = await getProduct(slug, locale);
  return ogImage({
    eyebrow: product.headline,
    title: `${product.brand} ${product.name}${product.codename ? ` «${product.codename}»` : ''}`,
    subtitle: product.tagline,
    accent: product.accentColor,
    render: product.slug,
  });
}
