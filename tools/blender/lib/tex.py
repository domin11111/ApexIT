"""
Генерация текстур на numpy + PIL: шум, карты нормалей из высот, ORM, текст маркировки,
DataMatrix-подобные коды и штрихкоды. Все массивы — float32 0…1, (H, W) или (H, W, C).
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONTS = Path('C:/Windows/Fonts')


# ── Базовое ──────────────────────────────────────────────────────────────────


def rng(seed: int) -> np.random.Generator:
    return np.random.default_rng(seed)


def value_noise(h: int, w: int, cell: float, seed: int = 0) -> np.ndarray:
    """Гладкий шум: случайная сетка с шагом cell пикселей, бикубически растянутая."""
    gh, gw = max(2, int(h / cell) + 2), max(2, int(w / cell) + 2)
    grid = rng(seed).random((gh, gw)).astype(np.float32)
    img = Image.fromarray(grid).resize((int(gw * cell), int(gh * cell)), Image.BICUBIC)
    return np.asarray(img, dtype=np.float32)[:h, :w]


def fbm(h: int, w: int, cell: float, octaves: int = 4, seed: int = 0, gain: float = 0.5) -> np.ndarray:
    out = np.zeros((h, w), np.float32)
    amp, total = 1.0, 0.0
    for o in range(octaves):
        out += amp * value_noise(h, w, max(1.0, cell / 2**o), seed + o * 17)
        total += amp
        amp *= gain
    return out / total


def _box(a: np.ndarray, r: int, axis: int) -> np.ndarray:
    pad = [(0, 0)] * a.ndim
    pad[axis] = (r + 1, r)
    c = np.cumsum(np.pad(a, pad, mode='edge'), axis=axis, dtype=np.float64)
    n = a.shape[axis]
    hi = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis)
    lo = np.take(c, np.arange(0, n), axis=axis)
    return ((hi - lo) / (2 * r + 1)).astype(np.float32)


def blur(a: np.ndarray, radius: float) -> np.ndarray:
    """Приближение гаусса тремя проходами box-фильтра (радиус ≈ sigma)."""
    if radius <= 0:
        return a
    r = max(1, int(round(radius * 0.9)))
    out = a.astype(np.float32)
    for _ in range(3):
        out = _box(_box(out, r, 0), r, 1)
    return out


def lerp(a, b, t):
    return a + (b - a) * t


def mix_rgb(base: np.ndarray, color, mask: np.ndarray) -> np.ndarray:
    """base (H,W,3) ← color там, где mask (H,W)."""
    c = np.asarray(color, np.float32).reshape(1, 1, -1)
    return base * (1 - mask[..., None]) + c * mask[..., None]


def hex_rgb(h: str) -> tuple[float, float, float]:
    h = h.lstrip('#')
    return tuple(int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))


def normal_from_height(height: np.ndarray, strength: float) -> np.ndarray:
    """Tangent-space normal map (OpenGL, +Y вверх — как в glTF). strength — «глубина» в пикселях."""
    gy, gx = np.gradient(height.astype(np.float32))
    nx, ny, nz = -gx * strength, gy * strength, np.ones_like(height)
    n = np.stack([nx, ny, nz], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def save(arr: np.ndarray, path: Path, mode: str | None = None) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    a = np.clip(arr, 0, 1)
    img = Image.fromarray((a * 255 + 0.5).astype(np.uint8), mode)
    img.save(path)
    return path


def orm(ao: np.ndarray | float, rough: np.ndarray | float, metal: np.ndarray | float, shape: tuple[int, int]) -> np.ndarray:
    h, w = shape
    chans = [np.broadcast_to(np.asarray(c, np.float32), (h, w)) for c in (ao, rough, metal)]
    return np.stack(chans, -1)


# ── Рисование в масках PIL ───────────────────────────────────────────────────


class Canvas:
    """Маска 'L' с суперсэмплингом: рисуем в ss× разрешении, отдаём float (H, W)."""

    def __init__(self, w: int, h: int, ss: int = 2):
        self.w, self.h, self.ss = w, h, ss
        self.img = Image.new('L', (w * ss, h * ss), 0)
        self.d = ImageDraw.Draw(self.img)

    def rect(self, x0, y0, x1, y1, fill=255, radius=0.0):
        s = self.ss
        if radius > 0:
            self.d.rounded_rectangle([x0 * s, y0 * s, x1 * s - 1, y1 * s - 1], radius=radius * s, fill=fill)
        else:
            self.d.rectangle([x0 * s, y0 * s, x1 * s - 1, y1 * s - 1], fill=fill)

    def ellipse(self, cx, cy, r, fill=255):
        s = self.ss
        self.d.ellipse([(cx - r) * s, (cy - r) * s, (cx + r) * s, (cy + r) * s], fill=fill)

    def poly(self, pts, fill=255):
        s = self.ss
        self.d.polygon([(x * s, y * s) for x, y in pts], fill=fill)

    def line(self, pts, width, fill=255):
        s = self.ss
        self.d.line([(x * s, y * s) for x, y in pts], fill=fill, width=max(1, int(width * s)), joint='curve')

    def text(self, x, y, text, font: str, size: float, fill=255, anchor='la', tracking: float = 0.0, stretch: float = 1.0):
        """Текст; tracking — доп. интервал в долях кегля; stretch — сжатие по горизонтали (<1 — уже)."""
        s = self.ss
        f = ImageFont.truetype(str(FONTS / font), max(1, int(size * s)))
        if tracking == 0 and stretch == 1.0:
            self.d.text((x * s, y * s), text, font=f, fill=fill, anchor=anchor)
            return
        # Посимвольно с трекингом, затем горизонтальное сжатие через отдельный слой
        widths = [f.getlength(ch) for ch in text]
        total = sum(widths) + tracking * size * s * (len(text) - 1)
        asc, desc = f.getmetrics()
        layer = Image.new('L', (int(total) + 4, asc + desc + 4), 0)
        ld = ImageDraw.Draw(layer)
        cx = 2
        for ch, wch in zip(text, widths):
            ld.text((cx, 2), ch, font=f, fill=fill)
            cx += wch + tracking * size * s
        if stretch != 1.0:
            layer = layer.resize((max(1, int(layer.width * stretch)), layer.height), Image.LANCZOS)
        ox = x * s
        oy = y * s
        if anchor[0] == 'm':
            ox -= layer.width / 2
        elif anchor[0] == 'r':
            ox -= layer.width
        if anchor[1] == 'm':
            oy -= (asc + desc) / 2 + 2
        elif anchor[1] in 'sb':
            oy -= asc + 2
        self.img.paste(Image.new('L', layer.size, fill), (int(ox), int(oy)), layer)

    def paste_mask(self, mask: Image.Image, x, y, w=None, h=None):
        s = self.ss
        if w or h:
            ar = mask.width / mask.height
            w = w or h * ar
            h = h or w / ar
            mask = mask.resize((max(1, int(w * s)), max(1, int(h * s))), Image.LANCZOS)
        else:
            mask = mask.resize((mask.width * s, mask.height * s), Image.LANCZOS)
        self.img.paste(Image.new('L', mask.size, 255), (int(x * s), int(y * s)), mask)

    def array(self) -> np.ndarray:
        img = self.img.resize((self.w, self.h), Image.LANCZOS) if self.ss > 1 else self.img
        return np.asarray(img, np.float32) / 255


def datamatrix(cv: Canvas, x: float, y: float, size: float, n: int = 16, seed: int = 0):
    """Узнаваемый 2D-код: сплошная L-рамка слева/снизу, пунктир сверху/справа, случайные модули."""
    cell = size / n
    r = rng(seed)
    for i in range(n):
        for j in range(n):
            on = False
            if j == 0 or i == n - 1:
                on = True
            elif i == 0:
                on = j % 2 == 0
            elif j == n - 1:
                on = i % 2 == 1
            else:
                on = r.random() < 0.5
            if on:
                cv.rect(x + j * cell, y + i * cell, x + (j + 1) * cell, y + (i + 1) * cell)


def barcode(cv: Canvas, x: float, y: float, w: float, h: float, seed: int = 0):
    r = rng(seed)
    cx = x
    unit = w / 95
    while cx < x + w - unit * 2:
        bw = unit * r.integers(1, 4)
        cv.rect(cx, y, min(cx + bw, x + w), y + h)
        cx += bw + unit * r.integers(1, 4)


def logo_mask(name: str, height_px: int) -> Image.Image:
    from svgraster import rasterize

    return rasterize(name, max(8, int(height_px)), ss=4)
