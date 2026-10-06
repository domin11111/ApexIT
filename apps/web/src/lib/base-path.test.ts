import { afterEach, describe, expect, it, vi } from 'vitest';

/** BASE_PATH читается при импорте — модуль грузим заново под каждое окружение. */
async function load(basePath: string) {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_BASE_PATH', basePath);
  return import('./base-path');
}

afterEach(() => vi.unstubAllEnvs());

describe('withBasePath / stripBasePath', () => {
  it('под префиксом: пути от корня получают его ровно один раз', async () => {
    const { withBasePath, stripBasePath } = await load('/app/components');
    expect(withBasePath('/models/a.glb')).toBe('/app/components/models/a.glb');
    expect(withBasePath('/app/components/models/a.glb')).toBe('/app/components/models/a.glb');
    expect(withBasePath('https://cdn.example/a.glb')).toBe('https://cdn.example/a.glb');
    expect(withBasePath('//cdn.example/a.glb')).toBe('//cdn.example/a.glb');
    // Похожий, но чужой путь — не наш префикс
    expect(withBasePath('/app/components-old/x')).toBe('/app/components/app/components-old/x');
    expect(stripBasePath('/app/components/compare')).toBe('/compare');
    expect(stripBasePath('/app/components')).toBe('/');
    expect(stripBasePath('/app/screener/')).toBe('/app/screener/');
  });

  it('без префикса (разработка, localhost) — всё как есть', async () => {
    const { withBasePath, stripBasePath } = await load('');
    expect(withBasePath('/models/a.glb')).toBe('/models/a.glb');
    expect(stripBasePath('/compare')).toBe('/compare');
  });
});
