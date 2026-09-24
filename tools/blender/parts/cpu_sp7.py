"""
AMD EPYC 9996 «Venice», корпус SP7 — по cpu2.png (кристаллы) и mb.png (крышка).

Корпус 88 × 94 мм по пропорциям cpu2.png (сокет SP7 — 123,6 × 100,6 мм, Computex 2025).
8 CCD Zen 6c по 32 ядра (4 сверху, 4 снизу), два I/O-кристалла по центру, медные полосы между
рядами, чёрный компаунд вокруг. ccd_0…3 — верхний ряд слева направо, ccd_4…7 — нижний.
"""
from __future__ import annotations

import cpu
from bl import MM

CCD_W, CCD_H, CCD_PITCH = 12.3 * MM, 16.7 * MM, 12.8 * MM
IOD_W, IOD_H = 24.5 * MM, 19.0 * MM
ROW_Y = IOD_H / 2 + 0.2 * MM + 1.9 * MM + 0.2 * MM + CCD_H / 2  # центр ряда CCD: за I/O и медной полосой

VENICE = cpu.Variant(
    name='cpu-epyc-9996-sp7',
    root='cpu_sp7',
    socket='SP7',
    model='EPYC 9996',
    opn='100-000001690',
    pkg=(88 * MM, 94 * MM),
    lid=(80 * MM, 86 * MM),
    lid_wall=3.2 * MM,
    substrate='#15506a',
    substrate_edge='#123b4a',
    ccds=[((i - 1.5) * CCD_PITCH, ROW_Y, CCD_W, CCD_H, False, False) for i in range(4)]
    + [((i - 1.5) * CCD_PITCH, -ROW_Y, CCD_W, CCD_H, True, False) for i in range(4)],
    # Правый I/O-кристалл — зеркальная копия левого, как на cpu2.png
    iods=[(-(IOD_W / 2 + 0.4 * MM), 0.0, IOD_W, IOD_H, False, False), (IOD_W / 2 + 0.4 * MM, 0.0, IOD_W, IOD_H, False, True)],
    ccd_cores=(4, 8),
    mold=(58 * MM, 61 * MM),
    bridges=True,
    caps=lambda: cpu.perimeter_caps(31.3, 33.2, 56, 59),
    lsc_grid=(6, 15),
)

NAME = VENICE.name
PREVIEWS = cpu.previews()
PKG_T = cpu.PKG_T


def build():
    return cpu.build(VENICE)
