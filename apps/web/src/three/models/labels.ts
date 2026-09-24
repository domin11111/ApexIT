import { CanvasTexture, Mesh, MeshPhysicalMaterial, PlaneGeometry, SRGBColorSpace, type Texture } from 'three';
import { hasDom } from '../shared';

/** Надпись на модели: маркировка на крышке процессора, шильдик видеокарты, наклейка модуля памяти. */
export type LabelLine = { text: string; size: number; weight?: number; tracking?: number; mono?: boolean };

/** Реальное имя шрифта из next/font (переменная --ff-*), иначе системный. */
function family(variable: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value ? `${value}, ${fallback}` : fallback;
}

/**
 * Текстура надписи: белый текст на прозрачном фоне, строки по центру.
 * Шрифт мог ещё не загрузиться — перерисовываем после document.fonts.ready.
 */
export function labelTexture(lines: LabelLine[], aspect: number, { align = 'center' }: { align?: CanvasTextAlign } = {}): Texture | null {
  if (!hasDom()) return null;
  const height = 256;
  const width = Math.round(height * aspect);
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  const context = element.getContext('2d');
  if (!context) return null;
  const texture = new CanvasTexture(element);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;

  const draw = () => {
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#ffffff';
    context.textAlign = align;
    context.textBaseline = 'middle';
    const total = lines.reduce((sum, line) => sum + line.size * 1.25, 0);
    let y = (height - total) / 2;
    const x = align === 'left' ? height * 0.06 : align === 'right' ? width - height * 0.06 : width / 2;
    for (const line of lines) {
      const font = line.mono ? family('--ff-jetbrains', 'ui-monospace, monospace') : family('--ff-inter', 'system-ui, sans-serif');
      context.font = `${line.weight ?? 600} ${line.size}px ${font}`;
      context.letterSpacing = `${line.tracking ?? 0}px`;
      y += line.size * 0.625;
      context.fillText(line.text, x, y);
      y += line.size * 0.625;
    }
    texture.needsUpdate = true;
  };

  draw();
  void document.fonts?.ready.then(draw);
  return texture;
}

/**
 * Надпись как тонкая плоскость над поверхностью. Материал металлический и шероховатый —
 * выглядит как лазерная гравировка на крышке, а не как наклейка.
 */
export function engravedLabel(
  name: string,
  lines: LabelLine[],
  [w, h]: [number, number],
  { color = '#d9dce3', roughness = 0.62, metalness = 0.9, opacity = 0.55 }: { color?: string; roughness?: number; metalness?: number; opacity?: number } = {},
): Mesh | null {
  const texture = labelTexture(lines, w / h);
  if (!texture) return null;
  const mesh = new Mesh(
    new PlaneGeometry(w, h),
    new MeshPhysicalMaterial({ color, roughness, metalness, alphaMap: texture, transparent: true, opacity, depthWrite: false }),
  );
  mesh.name = name;
  return mesh;
}

/** Бумажная наклейка с чёрным текстом (модуль памяти). */
export function stickerLabel(name: string, lines: LabelLine[], [w, h]: [number, number]): Mesh | null {
  const texture = labelTexture(lines, w / h, { align: 'left' });
  if (!texture) return null;
  const paper = new Mesh(new PlaneGeometry(w, h), new MeshPhysicalMaterial({ color: '#e9e7e1', roughness: 0.85 }));
  paper.name = name;
  const print = new Mesh(
    new PlaneGeometry(w, h),
    new MeshPhysicalMaterial({ color: '#1a1b1f', roughness: 0.9, alphaMap: texture, transparent: true, depthWrite: false }),
  );
  print.position.z = 0.0004;
  paper.add(print);
  return paper;
}
