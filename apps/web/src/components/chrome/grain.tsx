// Шум feTurbulence в оттенках серого — плёночное зерно поверх всего сайта
const NOISE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

/** Film grain 3–4%: слой вдвое больше экрана, дрожит шагами (без плавности — как плёнка). */
export function Grain() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed -left-1/2 -top-1/2 z-[var(--z-grain)] h-[200%] w-[200%] opacity-[var(--grain-opacity)] motion-safe:animate-[grain-shift_0.9s_steps(4)_infinite]"
      style={{ backgroundImage: NOISE }}
    />
  );
}
