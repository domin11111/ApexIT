import { timingSafeEqual } from 'node:crypto';
import { revalidatePath, revalidateTag } from 'next/cache';

/**
 * Вебхук ревалидации ISR (B4): API вызывает его после публикации и правок каталога в админке.
 * Данные каталога помечены тегом 'catalog' — сбрасываем его сразу (expire: 0), а не «когда-нибудь»,
 * и пересобираем статические страницы, чтобы правка была видна на следующем же запросе.
 */
const ALLOWED_TAGS = new Set(['catalog']);

function sameSecret(given: string | null, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!sameSecret(request.headers.get('x-revalidate-secret'), process.env.REVALIDATE_SECRET)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as { tags?: unknown };
  const tags = Array.isArray(body.tags) ? body.tags.filter((tag): tag is string => typeof tag === 'string' && ALLOWED_TAGS.has(tag)) : [];
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
  revalidatePath('/', 'layout');
  return Response.json({ revalidated: tags, at: new Date().toISOString() });
}
