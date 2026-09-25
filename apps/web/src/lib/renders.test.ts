import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadCollection } from '@apex/collection';
import { describe, expect, it } from 'vitest';
import { renderFor } from './renders';

const publicDir = fileURLToPath(new URL('../../public', import.meta.url));
const files = (set: string) => set.split(', ').map((entry) => entry.split(' ')[0]!);

describe('renderFor', () => {
  it('у каждого продукта коллекции есть постер, и все его файлы на месте', () => {
    for (const product of loadCollection().products) {
      const render = renderFor(product.slug);
      expect(render, product.slug).not.toBeNull();
      for (const url of [...files(render!.avif), ...files(render!.webp), render!.src]) {
        expect(statSync(`${publicDir}${url}`).size, url).toBeGreaterThan(0);
      }
    }
  });

  it('srcset на две ширины, пропорции из манифеста', () => {
    const render = renderFor('epyc-9996-venice', 'exploded')!;
    expect(render.avif).toBe('/renders/epyc-9996-venice-exploded-800.avif 800w, /renders/epyc-9996-venice-exploded-1600.avif 1600w');
    expect(render.width / render.height).toBeCloseTo(4 / 3);
  });

  it('нет рендера — null (сцена или фолбэк обходятся без постера)', () => {
    expect(renderFor('no-such-product')).toBeNull();
    expect(renderFor('rtx-pro-6000-blackwell', 'top')).toBeNull();
  });
});
