import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';
import { hasDom, random } from '../shared';

/*
 * Процедурные текстуры на canvas. В Node (тесты) их нет — модели собираются без текстур.
 */

function canvas(width: number, height: number) {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  const context = element.getContext('2d');
  if (!context) throw new Error('2D canvas недоступен');
  return { element, context };
}

/**
 * Кристалл с сеткой ядер: блоки ядер светлее, между ними — «шина» и кэш.
 * Используется и как map, и как emissiveMap — при подсветке загораются именно ядра.
 */
export function coreGridTexture(cols: number, rows: number): Texture | null {
  if (!hasDom()) return null;
  const size = 256;
  const { element, context } = canvas(size, Math.round((size * rows) / cols / 2) * 2);
  const { width, height } = element;
  context.fillStyle = '#05060a';
  context.fillRect(0, 0, width, height);

  // Центральная полоса — общий кэш L3
  const cacheBand = height * 0.12;
  context.fillStyle = '#1b1e2c';
  context.fillRect(0, height / 2 - cacheBand / 2, width, cacheBand);

  const gap = 6;
  const cellW = (width - gap * (cols + 1)) / cols;
  const cellH = (height - cacheBand - gap * (rows + 2)) / rows;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const x = gap + c * (cellW + gap);
      const y = gap + r * (cellH + gap) + (r >= rows / 2 ? cacheBand + gap : 0);
      const gradient = context.createLinearGradient(x, y, x + cellW, y + cellH);
      gradient.addColorStop(0, '#9aa6c8');
      gradient.addColorStop(1, '#6f7ba3');
      context.fillStyle = gradient;
      context.fillRect(x, y, cellW, cellH);
      // Внутренняя структура ядра
      context.fillStyle = 'rgba(5, 6, 10, 0.55)';
      context.fillRect(x + cellW * 0.12, y + cellH * 0.55, cellW * 0.76, cellH * 0.08);
    }
  }
  const texture = new CanvasTexture(element);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** I/O-кристалл: полосы контроллеров памяти и PCIe по краям, логика в центре. */
export function ioDieTexture(): Texture | null {
  if (!hasDom()) return null;
  const { element, context } = canvas(256, 256);
  context.fillStyle = '#06070b';
  context.fillRect(0, 0, 256, 256);
  context.fillStyle = '#5d6788';
  for (let i = 0; i < 12; i++) {
    context.fillRect(8 + i * 20, 8, 14, 34);
    context.fillRect(8 + i * 20, 214, 14, 34);
  }
  context.fillStyle = '#39405a';
  context.fillRect(24, 60, 208, 136);
  context.fillStyle = '#7a86ad';
  context.fillRect(40, 80, 80, 96);
  context.fillRect(136, 80, 80, 96);
  const texture = new CanvasTexture(element);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * Карта нормалей мелкого оребрения (корпус RTX PRO 6000 Server Edition): частые параллельные
 * канавки поперёк длины. Одна полоса текстуры — 16 канавок; повтор задаёт материал.
 */
export function groovesNormalTexture(): Texture | null {
  if (!hasDom()) return null;
  const { element, context } = canvas(256, 4);
  const period = 16;
  for (let x = 0; x < 256; x++) {
    // Профиль канавки: наклон нормали по X меняется от −1 к +1 внутри периода
    const phase = (x % period) / period;
    const slope = Math.sin(phase * Math.PI * 2);
    const r = Math.round(128 + slope * 90);
    context.fillStyle = `rgb(${r}, 128, 255)`;
    context.fillRect(x, 0, 1, 4);
  }
  const texture = new CanvasTexture(element);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

/**
 * Кристалл GB202: блоки GPC с сетками SM в бирюзово-зелёной гамме, по центру — полоса кэша L2,
 * по краям — физические интерфейсы памяти. Используется как map и emissiveMap.
 */
export function gpuDieTexture(): Texture | null {
  if (!hasDom()) return null;
  const width = 320;
  const height = 272;
  const { element, context } = canvas(width, height);
  context.fillStyle = '#0a1614';
  context.fillRect(0, 0, width, height);

  // Интерфейсы памяти по периметру
  context.fillStyle = '#6f7a58';
  for (let i = 0; i < 16; i++) {
    context.fillRect(10 + i * 19, 4, 14, 10);
    context.fillRect(10 + i * 19, height - 14, 14, 10);
  }

  // Полоса L2 по центру
  const l2Top = height / 2 - 14;
  const l2 = context.createLinearGradient(0, l2Top, 0, l2Top + 28);
  l2.addColorStop(0, '#8c8f55');
  l2.addColorStop(1, '#5c6a3c');
  context.fillStyle = l2;
  context.fillRect(18, l2Top, width - 36, 28);

  // 12 GPC: 6 колонок × 2 ряда, в каждом 2 × 4 SM
  const gpcW = (width - 36 - 5 * 6) / 6;
  const gpcH = (height - 28 - 28 - 28) / 2;
  for (let col = 0; col < 6; col++) {
    for (let row = 0; row < 2; row++) {
      const gx = 18 + col * (gpcW + 6);
      const gy = row === 0 ? 20 : l2Top + 28 + 8;
      context.fillStyle = '#123a33';
      context.fillRect(gx, gy, gpcW, gpcH);
      for (let sx = 0; sx < 2; sx++) {
        for (let sy = 0; sy < 4; sy++) {
          const smW = (gpcW - 9) / 2;
          const smH = (gpcH - 15) / 4;
          const x = gx + 3 + sx * (smW + 3);
          const y = gy + 3 + sy * (smH + 3);
          const sm = context.createLinearGradient(x, y, x + smW, y + smH);
          sm.addColorStop(0, '#5fbf9a');
          sm.addColorStop(1, '#2f8f78');
          context.fillStyle = sm;
          context.fillRect(x, y, smW, smH);
          // Tensor-ядра — светлая полоса внутри SM
          context.fillStyle = 'rgba(214, 240, 170, 0.7)';
          context.fillRect(x + smW * 0.15, y + smH * 0.6, smW * 0.7, smH * 0.18);
        }
      }
    }
  }
  const texture = new CanvasTexture(element);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Текстолит с разводкой: тонкие трассы и переходные отверстия, почти в цвет основы. */
export function laminateTexture(seed: number, base = '#10131a', line = '#1b2230'): Texture | null {
  if (!hasDom()) return null;
  const rnd = random(seed);
  const size = 1024;
  const { element, context } = canvas(size, size);
  context.fillStyle = base;
  context.fillRect(0, 0, size, size);
  context.strokeStyle = line;
  context.lineCap = 'square';

  for (let i = 0; i < 260; i++) {
    let x = rnd() * size;
    let y = rnd() * size;
    context.lineWidth = rnd() < 0.8 ? 1.5 : 3;
    context.beginPath();
    context.moveTo(x, y);
    for (let s = 0; s < 4; s++) {
      const horizontal = rnd() < 0.5;
      const length = 20 + rnd() * 120;
      const diagonal = rnd() < 0.3 ? length * 0.3 : 0;
      x += horizontal ? length : diagonal;
      y += horizontal ? diagonal : length;
      context.lineTo(x, y);
    }
    context.stroke();
    context.fillStyle = '#2a3242';
    context.beginPath();
    context.arc(x, y, 3, 0, Math.PI * 2);
    context.fill();
  }
  const texture = new CanvasTexture(element);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}
