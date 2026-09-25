import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

/*
 * OpenGraph-картинки 1200×630: рендер модели из Blender (public/renders/og) + название и слоган.
 * Генерируются при сборке и кэшируются как статика.
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;

/**
 * Inter с нужными глифами (кириллица) из Google Fonts: без браузерного User-Agent сервис отдаёт TTF,
 * который понимает Satori. Нет сети — вернётся null, и картинка соберётся встроенным шрифтом.
 */
async function interFont(weight: 400 | 600, text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (
      await fetch(`https://fonts.googleapis.com/css2?family=Inter:wght@${weight}&text=${encodeURIComponent(text)}`, {
        signal: AbortSignal.timeout(5000),
      })
    ).text();
    const url = /src: url\((.+?)\) format\('(opentype|truetype)'\)/.exec(css)?.[1];
    if (!url) return null;
    return await (await fetch(url, { signal: AbortSignal.timeout(5000) })).arrayBuffer();
  } catch {
    return null;
  }
}

async function background(name: string): Promise<string | null> {
  try {
    const jpeg = await readFile(join(process.cwd(), 'public/renders/og', `${name}.jpg`));
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
  } catch {
    return null;
  }
}

export async function ogImage({
  eyebrow,
  title,
  subtitle,
  accent,
  render,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  accent: string;
  /** Ключ рендера в public/renders/og */
  render: string;
}) {
  const text = `${eyebrow}${title}${subtitle}APEX // Compute Collection`;
  const [regular, semibold, image] = await Promise.all([interFont(400, text), interFont(600, text), background(render)]);
  const fonts = [
    ...(regular ? [{ name: 'Inter', data: regular, weight: 400 as const, style: 'normal' as const }] : []),
    ...(semibold ? [{ name: 'Inter', data: semibold, weight: 600 as const, style: 'normal' as const }] : []),
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: '#050507',
          color: '#f5f5f7',
          fontFamily: fonts.length ? 'Inter' : undefined,
          position: 'relative',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori рисует только <img> */}
        {image && <img src={image} width={1200} height={630} style={{ position: 'absolute', inset: 0 }} alt="" />}
        {/* Светящаяся «дорожка» цвета продукта у нижнего края */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 0 0 72px', width: 560, height: '100%' }}>
          <div style={{ fontSize: 20, letterSpacing: 4, color: accent, textTransform: 'uppercase', fontWeight: 600 }}>{eyebrow}</div>
          <div style={{ fontSize: 60, lineHeight: 1.05, fontWeight: 600, marginTop: 24, letterSpacing: -1.5 }}>{title}</div>
          <div style={{ fontSize: 28, lineHeight: 1.3, color: '#b9b9bf', marginTop: 24 }}>{subtitle}</div>
          <div style={{ fontSize: 18, letterSpacing: 3, color: '#8e8e93', marginTop: 48 }}>APEX // COMPUTE COLLECTION</div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts },
  );
}
