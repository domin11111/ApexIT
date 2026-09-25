import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadCollection } from '@apex/collection';
import type { AssetDto } from '@apex/contracts';
import { describe, expect, it } from 'vitest';
import { modelSource } from './model-source';

const publicDir = fileURLToPath(new URL('../../public', import.meta.url));

const asset = (variant: AssetDto['variant'], url: string, type: AssetDto['type'] = 'GLB'): AssetDto => ({
  id: url,
  type,
  variant,
  url,
  mimeType: 'model/gltf-binary',
  sizeBytes: null,
  meta: {},
});

describe('modelSource', () => {
  it('десктопный GLB — основной, мобильный — облегчённый', () => {
    expect(modelSource([asset('MOBILE', '/m-mobile.glb'), asset('DESKTOP', '/m.glb')])).toEqual({ url: '/m.glb', mobileUrl: '/m-mobile.glb' });
    expect(modelSource([asset('DESKTOP', '/m.glb')])).toEqual({ url: '/m.glb' });
  });

  it('без GLB — процедурная модель', () => {
    expect(modelSource([])).toBeUndefined();
    expect(modelSource([asset('DESKTOP', '/hero.webp', 'IMAGE')])).toBeUndefined();
  });
});

// Модели собирает tools/blender/build.py; размеры в коллекции должны совпадать с файлами,
// иначе после пересборки прогресс загрузки и мониторинг врут.
describe('GLB-модели коллекции', () => {
  const products = loadCollection().products.filter((p) => p.model);

  it('есть у всех продуктов презентации', () => {
    expect(products.map((p) => p.slug)).toEqual(['epyc-9996-venice', 'epyc-9965', 'micron-ddr5-512gb-rdimm', 'rtx-pro-6000-blackwell']);
  });

  it.each(products.map((p) => [p.slug, p.model!] as const))('%s: файлы и размеры совпадают', (_slug, model) => {
    expect(statSync(publicDir + model.url).size).toBe(model.sizeBytes);
    expect(statSync(publicDir + model.url.replace(/\.glb$/, '-mobile.glb')).size).toBe(model.mobileSizeBytes);
  });
});
