"""
AMD EPYC 9965 «Turin Dense», корпус SP5 — сосед Venice в сцене «Поколения».

Корпус SP5 — 72 × 75,4 мм. 12 CCD Zen 5c по 16 ядер (по 6 с каждой стороны от I/O, три ряда
по две колонки — как в процедурной модели сайта), один I/O-кристалл по центру. Компаунда нет:
кристаллы сидят на подложке с бортиком underfill, как у Genoa/Turin без крышки.
ccd_N — по рядам сверху вниз, в ряду слева направо.
"""
from __future__ import annotations

import math

import cpu
from bl import MM

CCD_W, CCD_H = 8.4 * MM, 12.2 * MM
IOD_W, IOD_H = 15.5 * MM, 25.5 * MM
COLS = (-22.75 * MM, -13.35 * MM, 13.35 * MM, 22.75 * MM)
ROWS = (13.4 * MM, 0.0, -13.4 * MM)


def caps() -> list[tuple[float, float, float]]:
    """Ряды MLCC над и под комплексом кристаллов и по одной колонке по бокам — под крышкой SP5 тесно."""
    out = []
    pitch = 1.7
    n = int(50 / pitch)
    for y in (22.3, 24.2):
        for sgn in (1, -1):
            for i in range(n):
                out.append(((i - (n - 1) / 2) * pitch * MM, sgn * y * MM, 0.0))
    m = int(36 / pitch)
    for sgn in (1, -1):
        for i in range(m):
            out.append((sgn * 28.6 * MM, (i - (m - 1) / 2) * pitch * MM, math.pi / 2))
    return out


TURIN = cpu.Variant(
    name='cpu-epyc-9965-sp5',
    root='cpu_sp5',
    socket='SP5',
    model='EPYC 9965',
    opn='100-000000976',
    pkg=(72 * MM, 75.4 * MM),
    lid=(66 * MM, 69.4 * MM),
    lid_wall=2.8 * MM,
    substrate='#1f3a32',
    substrate_edge='#172a24',
    ccds=[(x, y, CCD_W, CCD_H, x > 0, False) for y in ROWS for x in COLS],
    iods=[(0.0, 0.0, IOD_W, IOD_H, False, False)],
    ccd_cores=(2, 8),
    mold=None,
    bridges=False,
    caps=caps,
    lsc_grid=(5, 12),
    lsc_cavity=(13.0, 25.0),
    iod_rot90=True,
    tex_dir='cpu_sp5',
)

NAME = TURIN.name
PREVIEWS = cpu.previews(72 / 88)


def build():
    return cpu.build(TURIN)
