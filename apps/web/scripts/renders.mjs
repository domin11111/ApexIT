// Рендеры Cycles из tools/blender (--preview) → лёгкие картинки для сайта.
//
//   pnpm --filter @apex/web renders [-- <папка с превью>]
//
// По умолчанию берёт tools/blender/.build/previews (там их оставляет build.py; папка вне git).
// Результат — public/renders: AVIF и WebP в двух ширинах (постер 3D-просмотра, фолбэк без WebGL,
// карточки коллекции) и JPEG 1200×630 для OpenGraph. Готовые файлы коммитятся, исходники PNG — нет.
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultSource = resolve(webRoot, '../../tools/blender/.build/previews');
const source = resolve(process.argv[2] ?? defaultSource);
const out = join(webRoot, 'public/renders');

/** Имя модели в tools/blender → ключ на сайте (slug продукта или служебное имя) */
const TARGETS = {
  'cpu-epyc-9996-sp7': 'epyc-9996-venice',
  'cpu-epyc-9965-sp5': 'epyc-9965',
  'rdimm-micron-512gb': 'micron-ddr5-512gb-rdimm',
  'gpu-rtx-pro-6000-se': 'rtx-pro-6000-blackwell',
  'board-sp7': 'board-sp7',
};
/** Какие виды нужны сайту: hero — всем, exploded — фолбэку сцены с разборкой */
const VIEWS = new Set(['hero', 'exploded', 'top']);
const WIDTHS = [800, 1600];

async function collect(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await collect(path)));
    else if (entry.name.endsWith('.png')) files.push(path);
  }
  return files;
}

await mkdir(join(out, 'og'), { recursive: true });
const manifest = {};

for (const file of await collect(source)) {
  const match = /^(.+)_([a-z]+)\.png$/.exec(basename(file));
  if (!match) continue;
  const [, model, view] = match;
  const key = TARGETS[model];
  if (!key || !VIEWS.has(view)) continue;

  const image = sharp(file);
  const { width, height } = await image.metadata();
  const name = `${key}-${view}`;
  for (const w of WIDTHS) {
    const resized = image.clone().resize({ width: w, withoutEnlargement: true });
    await resized.clone().avif({ quality: 52, effort: 6 }).toFile(join(out, `${name}-${w}.avif`));
    await resized.clone().webp({ quality: 80, effort: 6 }).toFile(join(out, `${name}-${w}.webp`));
  }
  // OpenGraph: 1200×630, модель вписана в правую часть чёрного кадра — слева место для текста
  if (view === 'hero') {
    const product = await image.clone().resize({ width: 760, height: 570, fit: 'contain', background: '#000000' }).toBuffer();
    await sharp({ create: { width: 1200, height: 630, channels: 3, background: '#050507' } })
      .composite([{ input: product, left: 420, top: 30 }])
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(join(out, 'og', `${key}.jpg`));
  }
  manifest[name] = { width, height };
  const size = (await stat(join(out, `${name}-1600.avif`))).size;
  console.log(`✓ ${name} ← ${basename(file)} (${Math.round(size / 1024)} КБ AVIF 1600)`);
}

await writeFile(join(out, 'renders.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Готово: ${Object.keys(manifest).length} рендеров → ${out}`);
