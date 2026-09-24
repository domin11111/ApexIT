"""
Процедурные «фото кристаллов» (die shots): цвет — через палитру по полю плотности, как интерференция
в слоях диэлектрика на реальных снимках; структура — иерархия блоков: ряды стандартных ячеек,
массивы SRAM с разбиением на банки, PHY с вертикальной штриховкой.
"""
from __future__ import annotations

import numpy as np

import tex


def palette(stops: list[str]):
    cols = np.array([tex.hex_rgb(c) for c in stops], np.float32)
    xs = np.linspace(0, 1, len(cols), dtype=np.float32)

    def f(v: np.ndarray) -> np.ndarray:
        v = np.clip(v, 0, 1)
        return np.stack([np.interp(v, xs, cols[:, c]) for c in range(3)], -1).astype(np.float32)

    return f


def logic(h: int, w: int, seed: int, row: float = 3.0) -> np.ndarray:
    """Стандартные ячейки: горизонтальные ряды высотой row пикселей + мелкий шум размещения."""
    yy = np.arange(h, dtype=np.float32)[:, None]
    rows = 0.5 + 0.5 * np.sin(yy * 2 * np.pi / row)
    fine = tex.value_noise(h, w, 1.3, seed)
    mid = tex.value_noise(h, w, 7, seed + 1)
    return np.clip(0.35 * rows + 0.45 * fine + 0.35 * mid - 0.1, 0, 1)


def sram(h: int, w: int, seed: int, cell: float = 2.4, bank: int = 48) -> np.ndarray:
    """Массив SRAM: регулярная решётка, разбитая на банки тёмными шинами декодеров."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    g = 0.5 + 0.25 * np.sin(xx * 2 * np.pi / cell) + 0.25 * np.sin(yy * 2 * np.pi / (cell * 1.6))
    g = 0.25 + 0.55 * g
    bank = max(8, bank)
    gx = (xx % bank) < max(1, bank * 0.06)
    gy = (yy % (bank * 0.7)) < max(1, bank * 0.05)
    g = np.where(gx | gy, g * 0.45, g)
    return np.clip(g + 0.08 * (tex.value_noise(h, w, 4, seed) - 0.5), 0, 1)


def phy(h: int, w: int, seed: int, period: float = 5.0, vertical: bool = True) -> np.ndarray:
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    t = xx if vertical else yy
    g = 0.5 + 0.4 * np.sign(np.sin(t * 2 * np.pi / period)) * 0.5
    return np.clip(g * (0.8 + 0.3 * tex.value_noise(h, w, 3, seed)), 0, 1)


class Die:
    """Холст кристалла в долях (0…1): блоки накладываются поверх фона."""

    def __init__(self, w: int, h: int, seed: int):
        self.w, self.h = w, h
        self.rng = tex.rng(seed)
        self.seed = seed
        self.rgb = np.zeros((h, w, 3), np.float32)

    def _box(self, x0, y0, x1, y1):
        X0, Y0 = int(round(x0 * self.w)), int(round(y0 * self.h))
        X1, Y1 = int(round(x1 * self.w)), int(round(y1 * self.h))
        return X0, Y0, max(X0 + 1, X1), max(Y0 + 1, Y1)

    def fill(self, x0, y0, x1, y1, kind: str, pal, lo=0.0, hi=1.0, **kw):
        X0, Y0, X1, Y1 = self._box(x0, y0, x1, y1)
        h, w = Y1 - Y0, X1 - X0
        s = int(self.rng.integers(1 << 30))
        field = {'logic': logic, 'sram': sram, 'phy': phy}[kind](h, w, s, **kw)
        # Плавный уход оттенка по блоку — как толщина диэлектрика на реальном кристалле
        drift = tex.value_noise(h, w, max(8, min(h, w) / 1.5), s + 3) - 0.5
        self.rgb[Y0:Y1, X0:X1] = pal(lo + (hi - lo) * np.clip(field + 0.25 * drift, 0, 1))

    def outline(self, x0, y0, x1, y1, color=(0.02, 0.04, 0.06), px=1):
        X0, Y0, X1, Y1 = self._box(x0, y0, x1, y1)
        c = np.array(color, np.float32)
        self.rgb[Y0 : Y0 + px, X0:X1] = c
        self.rgb[Y1 - px : Y1, X0:X1] = c
        self.rgb[Y0:Y1, X0 : X0 + px] = c
        self.rgb[Y0:Y1, X1 - px : X1] = c

    def seal_ring(self, frac=0.012):
        b = max(2, int(self.w * frac))
        ring = np.array((0.05, 0.07, 0.09), np.float32)
        self.rgb[:b] = self.rgb[-b:] = ring
        self.rgb[:, :b] = self.rgb[:, -b:] = ring
        k = max(1, b // 3)
        metal = np.array((0.42, 0.46, 0.5), np.float32)
        self.rgb[k : k + 1, k:-k] = self.rgb[-k - 1 : -k, k:-k] = metal
        self.rgb[k:-k, k : k + 1] = self.rgb[k:-k, -k - 1 : -k] = metal

    def shade(self, top=1.08, bottom=0.88):
        """Градиент освещённости, как на фото кристалла под косым светом."""
        yy = np.linspace(0, 1, self.h, dtype=np.float32)[:, None, None]
        self.rgb *= top + (bottom - top) * yy

    def result(self) -> np.ndarray:
        return np.clip(self.rgb, 0, 1)


# ── Кристаллы EPYC ───────────────────────────────────────────────────────────

CCD_LOGIC = palette(['#06202d', '#0d4a5e', '#1b7a8c', '#3fb0b5', '#8ee0dc'])
CCD_SRAM = palette(['#081a3a', '#123e7a', '#1f63a8', '#3b8fcf', '#8cc8ee'])
CCD_L1 = palette(['#062a33', '#11606e', '#27a0a8', '#74d6d0'])


def ccd(w: int, h: int, seed: int = 1, cores: tuple[int, int] = (4, 8)) -> np.ndarray:
    """
    CCD: сетка ядер cores (колонки × ряды; Zen 6c — 4 × 8 = 32, Zen 5c — 2 × 8 = 16), у каждого ядра —
    логика, L2 у внутренней стороны, L1 и FPU; по центру — шина межъядерной сети и тэги L3.
    """
    d = Die(w, h, seed)
    d.fill(0, 0, 1, 1, 'logic', CCD_LOGIC, 0.15, 0.6)
    m = 0.03
    cols, rows = cores
    spine = 0.035
    cw = (1 - 2 * m - spine) / cols
    rh = (1 - 2 * m) / rows
    for c in range(cols):
        x0 = m + c * cw + (spine if c >= cols // 2 else 0)
        mirror = c % 2 == 1
        for r in range(rows):
            y0 = m + r * rh
            x1, y1 = x0 + cw, y0 + rh
            g = 0.004
            d.fill(x0 + g, y0 + g, x1 - g, y1 - g, 'logic', CCD_LOGIC, 0.2, 0.75)
            l2 = cw * 0.36
            if mirror:
                d.fill(x0 + g, y0 + g * 2, x0 + l2, y1 - g * 2, 'sram', CCD_SRAM, 0.15, 0.85, cell=2.2, bank=int(d.w * l2 * 0.5))
            else:
                d.fill(x1 - l2, y0 + g * 2, x1 - g, y1 - g * 2, 'sram', CCD_SRAM, 0.15, 0.85, cell=2.2, bank=int(d.w * l2 * 0.5))
            lx = x0 + (l2 + 0.01 if mirror else 0.012)
            lw = cw - l2 - 0.024
            # L1I / L1D и FPU — небольшие массивы и плотная логика
            d.fill(lx, y0 + rh * 0.12, lx + lw * 0.42, y0 + rh * 0.42, 'sram', CCD_L1, 0.2, 0.9, cell=1.8, bank=14)
            d.fill(lx + lw * 0.5, y0 + rh * 0.12, lx + lw * 0.95, y0 + rh * 0.42, 'sram', CCD_L1, 0.2, 0.9, cell=1.8, bank=14)
            d.fill(lx, y0 + rh * 0.55, lx + lw * 0.95, y0 + rh * 0.88, 'logic', CCD_LOGIC, 0.35, 0.95, row=2.2)
            d.outline(x0, y0, x1, y1, (0.03, 0.08, 0.1))
    # Центральная шина: межъядерная сеть и тэги L3
    d.fill(0.5 - spine / 2 - cw * 0 + 0.0, m, 0.5 + spine / 2, 1 - m, 'sram', CCD_SRAM, 0.1, 0.6, cell=1.6, bank=10)
    d.seal_ring()
    d.shade(1.1, 0.85)
    return d.result()


IOD_MAGENTA = palette(['#2a0624', '#6a1458', '#a8298a', '#d95bb5', '#f3a6de'])
IOD_PURPLE = palette(['#120a38', '#2d1f7a', '#4b38b0', '#7a66d8', '#b6a8f2'])
IOD_BLUE = palette(['#07153f', '#153a8a', '#2459c0', '#4f86e0', '#9cc0f5'])
IOD_TEAL = palette(['#05262c', '#0f5b64', '#1f959c', '#48c7c4', '#9ce8e2'])


def iod(w: int, h: int, seed: int = 2) -> np.ndarray:
    """I/O-кристалл по cpu2.png: пурпурные PHY по внешнему краю, сине-фиолетовые контроллеры, бирюзовая фабрика."""
    d = Die(w, h, seed)
    d.fill(0, 0, 1, 1, 'logic', IOD_PURPLE, 0.1, 0.55)
    # Плотная подложка из блоков логики и SRAM: на реальном I/O-кристалле пустых мест нет
    r = d.rng
    nx, ny = 14, 11
    for j in range(ny):
        for i in range(nx):
            x0, y0 = i / nx, j / ny
            pal = [IOD_PURPLE, IOD_BLUE, IOD_PURPLE, IOD_TEAL][int(r.integers(4))]
            kind = 'sram' if r.random() < 0.45 else 'logic'
            kw = {'cell': float(r.uniform(1.7, 2.6)), 'bank': int(r.integers(10, 24))} if kind == 'sram' else {}
            d.fill(x0 + 0.003, y0 + 0.004, x0 + 1 / nx - 0.003, y0 + 1 / ny - 0.004, kind, pal, 0.1, 0.7, **kw)
    # PHY DDR5 — высокая полоса у внешнего края
    d.fill(0.012, 0.03, 0.135, 0.97, 'phy', IOD_MAGENTA, 0.25, 0.8, period=4.5)
    for k in range(6):
        y0 = 0.03 + k * 0.157
        d.outline(0.012, y0, 0.135, y0 + 0.157, (0.12, 0.02, 0.1))
    # Контроллеры памяти и PCIe
    d.fill(0.14, 0.03, 0.34, 0.97, 'logic', IOD_PURPLE, 0.2, 0.8)
    for k in range(5):
        y0 = 0.06 + k * 0.18
        d.fill(0.16, y0, 0.32, y0 + 0.14, 'sram', IOD_BLUE, 0.2, 0.9, cell=2.2, bank=26)
    d.fill(0.14, 0.78, 0.37, 0.96, 'phy', IOD_MAGENTA, 0.3, 0.9, period=3.5, vertical=False)
    d.fill(0.46, 0.04, 0.7, 0.19, 'sram', IOD_MAGENTA, 0.25, 0.9, cell=2.6, bank=30)
    d.fill(0.72, 0.8, 0.9, 0.96, 'sram', IOD_PURPLE, 0.25, 0.9, cell=2.2, bank=24)
    d.fill(0.34, 0.04, 0.45, 0.2, 'logic', IOD_BLUE, 0.3, 0.9)
    # Бирюзовая «двутавровая» фабрика: полки сверху/снизу и стойка
    d.fill(0.36, 0.22, 0.95, 0.31, 'sram', IOD_TEAL, 0.2, 0.85, cell=2.0, bank=20)
    d.fill(0.36, 0.69, 0.95, 0.78, 'sram', IOD_TEAL, 0.2, 0.85, cell=2.0, bank=20)
    d.fill(0.4, 0.31, 0.6, 0.69, 'logic', IOD_TEAL, 0.25, 0.8)
    d.fill(0.62, 0.33, 0.93, 0.67, 'logic', IOD_BLUE, 0.2, 0.75)
    d.fill(0.66, 0.37, 0.9, 0.63, 'sram', IOD_TEAL, 0.25, 0.85, cell=2.4, bank=22)
    d.fill(0.44, 0.36, 0.56, 0.64, 'sram', IOD_BLUE, 0.25, 0.9, cell=1.8, bank=16)
    # Мост у стыка двух I/O-кристаллов
    d.fill(0.955, 0.02, 0.99, 0.98, 'phy', IOD_TEAL, 0.3, 0.8, period=3.0, vertical=False)
    for _ in range(26):
        x0, y0 = r.uniform(0.15, 0.9), r.uniform(0.05, 0.9)
        bw, bh = r.uniform(0.015, 0.05), r.uniform(0.02, 0.07)
        pal = [IOD_BLUE, IOD_PURPLE, IOD_TEAL][int(r.integers(3))]
        d.fill(x0, y0, min(0.99, x0 + bw), min(0.99, y0 + bh), 'sram', pal, 0.2, 0.9, cell=1.8, bank=12)
    d.seal_ring(0.006)
    d.shade(1.05, 0.9)
    return d.result()


BRIDGE = palette(['#3a1a04', '#7a3e08', '#c46f16', '#eea04a', '#ffd9a0'])


def bridge(w: int, h: int, seed: int = 3) -> np.ndarray:
    """Медная полоса между рядами: сегменты с поперечной штриховкой."""
    d = Die(w, h, seed)
    d.fill(0, 0, 1, 1, 'phy', BRIDGE, 0.35, 0.75, period=6.0)
    n = 9
    for k in range(n):
        x0 = 0.02 + k * (0.96 / n)
        d.fill(x0 + 0.008, 0.28, x0 + 0.96 / n - 0.008, 0.72, 'sram', BRIDGE, 0.15, 0.6, cell=2.0, bank=40)
    d.seal_ring(0.004)
    return d.result()


# ── Кристалл GB202 (Blackwell) ───────────────────────────────────────────────

GPU_SM = palette(['#0a0c1c', '#1f2352', '#3b3d8f', '#6a62c4', '#b6a8ee'])
GPU_RF = palette(['#081814', '#10413a', '#1f7766', '#3fae92', '#9be0c8'])
GPU_L2 = palette(['#0b1024', '#1a2f5c', '#2d5796', '#4f86c8', '#a3c6ee'])
GPU_PHY = palette(['#1a0c05', '#4a230c', '#8a4a1c', '#c68240', '#f0c890'])


def gb202(w: int, h: int, seed: int = 4) -> np.ndarray:
    """GB202: 12 GPC (2 колонки × 6), в каждом 8 TPC по 2 SM; L2 и crossbar — по центру; PHY GDDR7 по краям."""
    d = Die(w, h, seed)
    d.fill(0, 0, 1, 1, 'logic', GPU_SM, 0.1, 0.5)
    phy_w = 0.055
    # PHY 512-битной шины: по 8 контроллеров на длинных сторонах
    for side in (0, 1):
        x0 = 0.01 if side == 0 else 1 - 0.01 - phy_w
        for k in range(8):
            y0 = 0.02 + k * 0.12
            d.fill(x0, y0, x0 + phy_w, y0 + 0.11, 'phy', GPU_PHY, 0.25, 0.85, period=3.2, vertical=False)
    # L2 и crossbar
    d.fill(0.44, 0.03, 0.56, 0.97, 'sram', GPU_L2, 0.15, 0.85, cell=2.0, bank=22)
    d.fill(0.47, 0.03, 0.53, 0.97, 'logic', GPU_L2, 0.3, 0.8)
    # GPC
    for col, (x0, x1) in enumerate(((0.075, 0.43), (0.57, 0.925))):
        for row in range(6):
            y0 = 0.025 + row * 0.158
            y1 = y0 + 0.148
            d.fill(x0, y0, x1, y1, 'logic', GPU_SM, 0.2, 0.7)
            # 2 × 4 TPC, в каждом — регистровые файлы и L1/shared
            for ti in range(4):
                for tj in range(2):
                    tx0 = x0 + 0.006 + ti * (x1 - x0 - 0.012) / 4
                    tx1 = tx0 + (x1 - x0 - 0.012) / 4 - 0.004
                    ty0 = y0 + 0.006 + tj * (y1 - y0 - 0.012) / 2
                    ty1 = ty0 + (y1 - y0 - 0.012) / 2 - 0.004
                    d.fill(tx0, ty0, tx1, ty1, 'logic', GPU_SM, 0.3, 0.9)
                    d.fill(tx0 + 0.003, ty0 + 0.004, tx1 - 0.003, ty0 + (ty1 - ty0) * 0.35, 'sram', GPU_RF, 0.2, 0.9, cell=1.7, bank=12)
                    d.fill(tx0 + 0.003, ty1 - (ty1 - ty0) * 0.3, tx1 - 0.003, ty1 - 0.004, 'sram', GPU_L2, 0.2, 0.9, cell=1.9, bank=12)
            d.outline(x0, y0, x1, y1, (0.03, 0.03, 0.06))
    d.seal_ring(0.008)
    d.shade(1.05, 0.9)
    return d.result()
