"""
Облегчённый Micron 512GB RDIMM — статисты сцены сборки (15 модулей в слотах платы).

Те же плата, текстуры, корпуса DRAM, наклейка, RCD и PMIC, но без внутренних стеков 3DS,
нитей TSV и пассивки: ~2 тыс. треугольников вместо 35 тыс., текстуры до 1024 px.
"""
from __future__ import annotations

import rdimm

NAME = 'rdimm-micron-512gb-lod'
PREVIEWS = {'front': rdimm.PREVIEWS['front']}
# Один вариант: текстуры сразу уменьшены, мобильная копия не нужна
MAX_TEXTURE = 1024
MOBILE = False


def build():
    return rdimm.build(lod=True)
