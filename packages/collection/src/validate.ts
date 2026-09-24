import { ENGINE_SPEC_KEYS, SPEC_KEYS } from '@apex/contracts';
import { z } from 'zod';
import { motherboards } from './motherboards';
import { platforms } from './platforms';
import { products } from './products';
import { SeedMotherboard, SeedPlatform, SeedProduct } from './schema';

export const Collection = z.object({
  products: z.array(SeedProduct),
  platforms: z.array(SeedPlatform),
  motherboards: z.array(SeedMotherboard),
});
export type Collection = z.output<typeof Collection>;

const duplicates = (values: string[]) => [...new Set(values.filter((v, i) => values.indexOf(v) !== i))];

/**
 * Разбирает данные коллекции через Zod и проверяет связи, которых схема сама не видит:
 * уникальность ключей, категории характеристик, ссылки на платформы, числа для движка конфигуратора.
 * Бросает ошибку со списком всех проблем сразу.
 */
export function loadCollection(): Collection {
  const data = Collection.parse({ products, platforms, motherboards });
  const problems: string[] = [];
  const sockets = new Set(data.platforms.map((p) => p.socket));

  for (const slug of duplicates(data.products.map((p) => p.slug))) problems.push(`дубликат slug «${slug}»`);
  for (const socket of duplicates(data.platforms.map((p) => p.socket))) problems.push(`дубликат платформы ${socket}`);
  for (const board of duplicates(data.motherboards.map((b) => `${b.vendor} ${b.model}`))) {
    problems.push(`дубликат платы «${board}»`);
  }

  for (const product of data.products) {
    const at = `[${product.slug}]`;
    const specs = product.specGroups.flatMap((g) => g.specs);

    for (const key of duplicates(product.specGroups.map((g) => g.key))) problems.push(`${at} дубликат группы ${key}`);
    for (const key of duplicates(specs.map((s) => s.key))) problems.push(`${at} дубликат характеристики ${key}`);
    for (const key of duplicates(product.hotspots.map((h) => h.key))) problems.push(`${at} дубликат хотспота ${key}`);

    for (const spec of specs) {
      const meta = SPEC_KEYS[spec.key];
      if (meta.category !== product.category) {
        problems.push(`${at} ${spec.key} относится к категории ${meta.category}, а не ${product.category}`);
      }
    }

    for (const key of ENGINE_SPEC_KEYS[product.category]) {
      if (specs.find((s) => s.key === key)?.numericValue === undefined) {
        problems.push(`${at} движку конфигуратора нужно числовое значение ${key}`);
      }
    }

    for (const { socket } of product.compatibility) {
      if (!sockets.has(socket)) problems.push(`${at} неизвестная платформа ${socket}`);
    }

    if (product.status === 'COMING_SOON' && !product.availabilityWindow) {
      problems.push(`${at} для COMING_SOON нужен availabilityWindow — он выводится в бейдже`);
    }
  }

  for (const board of data.motherboards) {
    if (!sockets.has(board.socket)) problems.push(`[${board.vendor} ${board.model}] неизвестная платформа ${board.socket}`);
  }

  if (problems.length > 0) {
    throw new Error(`Данные коллекции некорректны:\n  • ${problems.join('\n  • ')}`);
  }
  return data;
}
