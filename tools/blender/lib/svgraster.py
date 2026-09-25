"""SVG → маска PIL (L, 0…255) с суперсэмплингом: логотипы для запекания в текстуры."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw
from svgelements import SVG, Path as SvgPath, Shape

LOGOS = Path(__file__).resolve().parent.parent / 'logos'


def _polygons(shape: SvgPath, scale: float) -> list[list[tuple[float, float]]]:
    """Контуры фигуры, аппроксимированные ломаными (в пикселях итоговой маски × scale)."""
    polys: list[list[tuple[float, float]]] = []
    for sub in shape.as_subpaths():
        sub = SvgPath(sub)
        length = sub.length(error=1e-3)
        if not length:
            continue
        n = max(16, int(length * scale / 1.5))
        pts = [sub.point(i / n) for i in range(n + 1)]
        polys.append([(p.x * scale, p.y * scale) for p in pts if p is not None])
    return polys


def rasterize(name: str, height_px: int, ss: int = 4, pad: int = 0) -> Image.Image:
    """
    Растеризует logos/<name>.svg в маску высотой height_px (ширина — по пропорциям).
    Заливка even-odd: буквы с «дырками» (A, D, R) рисуются корректно.
    """
    svg = SVG.parse(str(LOGOS / f'{name}.svg'), reify=True)
    shapes = [e for e in svg.elements() if isinstance(e, Shape)]
    bbox = None
    for e in shapes:
        b = SvgPath(e).bbox()
        if b is None:
            continue
        bbox = b if bbox is None else (min(bbox[0], b[0]), min(bbox[1], b[1]), max(bbox[2], b[2]), max(bbox[3], b[3]))
    x0, y0, x1, y1 = bbox
    scale = (height_px - 2 * pad) * ss / (y1 - y0)
    w = int((x1 - x0) * scale + 2 * pad * ss) + 1
    h = height_px * ss
    img = Image.new('L', (w, h), 0)
    for e in shapes:
        p = SvgPath(e)
        # Белые подложки в некоторых SVG не нужны: берём только непрозрачную «чернильную» заливку
        fill = e.fill
        if fill is not None and fill.value is not None and fill.alpha == 0:
            continue
        if fill is not None and fill.value is not None and fill.red > 200 and fill.green > 200 and fill.blue > 200:
            continue
        layer = Image.new('L', (w, h), 0)
        d = ImageDraw.Draw(layer)
        for poly in _polygons(p, scale):
            moved = [(x - x0 * scale + pad * ss, y - y0 * scale + pad * ss) for x, y in poly]
            if len(moved) > 2:
                # even-odd через XOR слоёв
                tmp = Image.new('L', (w, h), 0)
                ImageDraw.Draw(tmp).polygon(moved, fill=255)
                layer = Image.fromarray(_xor(layer, tmp))
        img = Image.fromarray(_or(img, layer))
    return img.resize((max(1, w // ss), height_px), Image.LANCZOS)


def _xor(a: Image.Image, b: Image.Image):
    import numpy as np

    return (np.asarray(a) ^ np.asarray(b)).astype('uint8')


def _or(a: Image.Image, b: Image.Image):
    import numpy as np

    return np.maximum(np.asarray(a), np.asarray(b)).astype('uint8')
