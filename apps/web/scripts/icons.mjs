// Иконки сайта из src/app/icon.svg: apple-icon.png (180 px) и favicon.ico (PNG 16/32/48 внутри ICO).
//   pnpm --filter @apex/web icons
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const app = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'src/app');
const svg = await readFile(join(app, 'icon.svg'));
const png = (size) => sharp(svg, { density: 384 }).resize(size, size).png().toBuffer();

await writeFile(join(app, 'apple-icon.png'), await png(180));

// ICO: заголовок, каталог записей (16 байт на размер) и PNG-данные подряд — формат с Windows Vista
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map(png));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const entries = sizes.map((size, i) => {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size, 0);
  entry.writeUInt8(size, 1);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(images[i].length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += images[i].length;
  return entry;
});
await writeFile(join(app, 'favicon.ico'), Buffer.concat([header, ...entries, ...images]));
console.log('✓ apple-icon.png, favicon.ico');
