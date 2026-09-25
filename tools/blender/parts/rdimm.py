"""
Micron 512GB DDR5 RDIMM (3DS, TSV) — геометрия по фото v-color TRA564G60D436O
(references/components/ecc ddr5 512gb x 8.png), маркировка — Micron.

Плата 133,35 × 31,25 × 1,27 мм (JEDEC DDR5 RDIMM), 288 контактов с шагом 0,85 мм, ключ в 70,2 мм
от левого края, на торцах — по два выреза под защёлку с язычком между ними.
Лицевая сторона: 2 × 10 корпусов DRAM (5 слева, 5 справа от центра), RCD в центре, массив MLCC
над ним, столбики 0402 между корпусами, ряд SMD над контактами. Обратная: 2 × 10 DRAM, PMIC
с дросселями в центре.

Оси Blender: X — длина, Z — высота (контакты внизу, z = 0), лицевая сторона смотрит в −Y
(в glTF это +Z — как у процедурной модели сайта).

Узлы: rdimm → pcb, passives, rcd, pmic, spd, label (в front_mold), contacts, edge,
front/back_mold, front/back_layer_0…7, front/back_tsv, front/back_substrate, dram_stack_0…39.
"""
from __future__ import annotations

import math

import bpy
import numpy as np
from mathutils import Matrix

import bl
import tex
from bl import MM

NAME = 'rdimm-micron-512gb'
TEX = bl.BUILD / 'tex' / 'rdimm'

L, H, T = 133.35 * MM, 31.25 * MM, 1.27 * MM
X0 = -L / 2
KEY_X = X0 + 70.2 * MM
CHIP_W, CHIP_H, CHIP_T = 9.9 * MM, 11.0 * MM, 1.2 * MM
CHIP_PITCH = 11.25 * MM
ROW_Z = (24.6 * MM, 13.05 * MM)  # центры верхнего и нижнего рядов (от низа платы)
SUB_T = 0.26 * MM  # подложка корпуса BGA — остаётся на плате при разлёте
LAYERS = 8
DIE_T, DIE_GAP = 0.07 * MM, 0.095 * MM  # стек 8 × 0,095 мм помещается под крышку компаунда 1,2 мм
LAYER_STEP = 1.87 * MM  # разлёт слоёв (как у процедурной модели: 0,028 ед. × 66,7 мм/ед.)
MOLD_FLY = 28 * MM
ACCENT = '#30d158'


def chip_columns() -> list[float]:
    """Центры колонок DRAM по X: 5 слева, 5 справа от центральной зоны RCD."""
    left = [X0 + 2.2 * MM + CHIP_W / 2 + i * CHIP_PITCH for i in range(5)]
    right = [X0 + 75.8 * MM + CHIP_W / 2 + i * CHIP_PITCH for i in range(5)]
    return left + right


def chips() -> list[tuple[float, float]]:
    """(x, z) корпусов одной стороны: сначала верхний ряд слева направо, затем нижний."""
    return [(x, z) for z in ROW_Z for x in chip_columns()]


CENTER_X = X0 + (57.5 + 75.8) / 2 * MM
RCD = dict(x=X0 + 66.9 * MM, z=11.45 * MM, w=8.7 * MM, h=14.1 * MM, t=1.0 * MM)


# ── Контур платы ─────────────────────────────────────────────────────────────


def outline() -> list[tuple[float, float]]:
    """Контур в плоскости (x, z) против часовой: ключ снизу, вырезы защёлок на торцах."""
    x0, x1 = -L / 2, L / 2
    d = 1.8 * MM
    notch = [(8.25 * MM, 11.15 * MM), (15.15 * MM, 17.85 * MM)]
    c = 0.5 * MM
    kw, kh = 1.5 * MM, 4.0 * MM
    pts = [(x0 + c, 0), (KEY_X - kw / 2, 0), (KEY_X - kw / 2, kh - kw / 2)]
    for i in range(1, 8):
        a = math.pi - math.pi * i / 8
        pts.append((KEY_X + kw / 2 * math.cos(a), kh - kw / 2 + kw / 2 * math.sin(a)))
    pts += [(KEY_X + kw / 2, kh - kw / 2), (KEY_X + kw / 2, 0), (x1 - c, 0), (x1, c)]
    for z0, z1 in notch:
        pts += [(x1, z0), (x1 - d, z0), (x1 - d, z1), (x1, z1)]
    r = 0.6 * MM
    for i in range(5):
        a = math.pi / 2 * i / 4
        pts.append((x1 - r + r * math.cos(a), H - r + r * math.sin(a)))
    for i in range(5):
        a = math.pi / 2 + math.pi / 2 * i / 4
        pts.append((x0 + r + r * math.cos(a), H - r + r * math.sin(a)))
    for z0, z1 in reversed(notch):
        pts += [(x0, z1), (x0 + d, z1), (x0 + d, z0), (x0, z0)]
    pts.append((x0, c))
    return pts


HOLES = [(sx * (L / 2 - 2.4 * MM), 4.4 * MM, 0.95 * MM) for sx in (-1, 1)]


def circle(cx, cz, r, n=20):
    return [(cx + r * math.cos(2 * math.pi * i / n), cz + r * math.sin(2 * math.pi * i / n)) for i in range(n)][::-1]


# ── Раскладка пассивки ───────────────────────────────────────────────────────


def front_passives() -> list[tuple[str, float, float, bool]]:
    """(тип, x, z, вертикально): 0805/0603 над RCD, 0402 между корпусами и над контактами."""
    out = []
    cx = X0
    # Массив над RCD: внешние колонки 0603 по 3 + 3, внутренние 0805 по 4
    for col_x, n, kind in ((59.8, 6, '0603'), (63.6, 4, '0805'), (70.1, 4, '0805'), (73.8, 6, '0603')):
        zs = [28.35, 26.85, 25.35, 22.7, 21.2, 19.7] if n == 6 else [27.0, 25.1, 23.2, 21.3]
        for z in zs:
            out.append((kind, cx + col_x * MM, z * MM, False))
    # Столбики 0402 по бокам RCD
    for col_x in (60.2, 73.4):
        for k in range(6):
            out.append(('0402', cx + col_x * MM, (6.2 + k * 1.95) * MM, True))
    # Между корпусами DRAM: по 5 штук на ряд
    cols = chip_columns()
    gaps = [(cols[i] + cols[i + 1]) / 2 for i in range(4)] + [(cols[i] + cols[i + 1]) / 2 for i in range(5, 9)]
    gaps += [cols[0] - CHIP_PITCH / 2 + 0.25 * MM, cols[-1] + CHIP_PITCH / 2 - 0.25 * MM]
    for gx in gaps:
        for rz in ROW_Z:
            for k in range(5):
                out.append(('0402', gx, rz + (k - 2) * 1.9 * MM, True))
    # Ряд над контактами: пары 0201 и сборки резисторов
    for k in range(30):
        x = X0 + (6.5 + k * 4.2) * MM
        if abs(x - KEY_X) < 2.5 * MM or abs(x - RCD['x']) < 4.8 * MM:
            continue
        out.append(('0201', x - 0.55 * MM, 5.55 * MM, True))
        out.append(('0201', x + 0.55 * MM, 5.55 * MM, True))
    for x in (X0 + 3.8 * MM, X0 + 5.8 * MM, X0 + 7.8 * MM):
        out.append(('0603', x, 5.9 * MM, True))
    return out


def back_passives() -> list[tuple[str, float, float, bool]]:
    out = []
    cols = chip_columns()
    gaps = [(cols[i] + cols[i + 1]) / 2 for i in range(4)] + [(cols[i] + cols[i + 1]) / 2 for i in range(5, 9)]
    for gx in gaps:
        for rz in ROW_Z:
            for k in range(5):
                out.append(('0402', gx, rz + (k - 2) * 1.9 * MM, True))
    # Выходные конденсаторы PMIC
    for k in range(4):
        out.append(('1206', X0 + (60.0 + k * 3.6) * MM, 7.2 * MM, False))
    for k in range(3):
        out.append(('0805', X0 + (61.5 + k * 4.6) * MM, 27.6 * MM, False))
    for k in range(28):
        x = X0 + (6.5 + k * 4.2) * MM
        if abs(x - CENTER_X) < 9 * MM:
            continue
        out.append(('0201', x, 5.55 * MM, True))
    return out


SIZES = {'0201': (0.6, 0.3, 0.3), '0402': (1.0, 0.5, 0.5), '0603': (1.6, 0.8, 0.8), '0805': (2.0, 1.25, 0.9), '1206': (3.2, 1.6, 1.1)}


# ── Текстуры ─────────────────────────────────────────────────────────────────


class Sheet:
    """Холст одной стороны платы в мм: x — вдоль модуля (0 — левый край), z — вверх."""

    def __init__(self, w_px, h_px, bounds, ss=2):
        self.x0, self.z0, self.x1, self.z1 = bounds
        self.w, self.h = w_px, h_px
        self.k = w_px / (self.x1 - self.x0)
        self.cv = tex.Canvas(w_px, h_px, ss)

    def px(self, x, z):
        return (x - self.x0) * self.k, (self.z1 - z) * self.k

    def rect(self, cx, cz, w, h, fill=255, radius=0.0):
        a = self.px(cx - w / 2, cz + h / 2)
        b = self.px(cx + w / 2, cz - h / 2)
        self.cv.rect(a[0], a[1], b[0], b[1], fill, radius * self.k)

    def circle(self, cx, cz, r, fill=255):
        x, y = self.px(cx, cz)
        self.cv.ellipse(x, y, r * self.k, fill)

    def line(self, pts, width, fill=255):
        self.cv.line([self.px(x, z) for x, z in pts], width * self.k, fill)

    def text(self, x, z, s, font, size, fill=255, anchor='la', tracking=0.0, stretch=1.0):
        px, py = self.px(x, z)
        self.cv.text(px, py, s, font, size * self.k, fill, anchor, tracking, stretch)

    def array(self):
        return self.cv.array()


def _mm(v):
    return v / MM


def tex_pcb(side: str, W=4096):
    """Сторона платы: чёрная маска, трассы под ней, контакты, площадки пассивки, реперы, переходные."""
    Hpx = int(W * H / L)
    b = (0, 0, _mm(L), _mm(H))
    to_local = lambda x: _mm(x - X0)  # noqa: E731
    # Контакты и ключ заданы в мировых X: на обратной стороне UV зеркальный, их позиции — L − x.
    # Компоненты обратной стороны уже развёрнуты поворотом на 180°, для них зеркалить не нужно.
    world = (lambda x: x) if side == 'front' else (lambda x: _mm(L) - x)  # noqa: E731
    key = world(70.2)
    base = np.ones((Hpx, W, 3), np.float32) * np.array(tex.hex_rgb('#111214'), np.float32)
    base *= (0.9 + 0.2 * tex.fbm(Hpx, W, 220, 4, seed=1 if side == 'front' else 2))[..., None]

    # Трассы под маской: горизонтальные шины между рядами и веер к контактам
    tr = Sheet(W, Hpx, b)
    r = tex.rng(5 if side == 'front' else 6)
    for k in range(26):
        z = 18.6 + (k % 13) * 0.11 + (0 if k < 13 else 0.02)
        tr.line([(2, z), (131, z)], 0.07, 160)
    for k in range(140):
        x = 3.5 + k * 0.905
        if abs(x - key) < 1.2:
            continue
        z1 = 7.4 + r.uniform(0, 0.8)
        xm = x + r.uniform(-0.6, 0.6)
        tr.line([(x, 3.4), (x, 4.6), (xm, 5.6), (xm, z1)], 0.075, 140)
    for cx in chip_columns():
        x = to_local(cx)
        for rz in ROW_Z:
            z = _mm(rz)
            for j in range(9):
                tr.line([(x - 4.2 + j * 1.05, z - 5.8), (x - 4.2 + j * 1.05, z - 6.8)], 0.07, 120)
    traces = tex.blur(tr.array(), 0.6)

    # Переходные отверстия (закрыты маской — лёгкие бугорки)
    via = Sheet(W, Hpx, b, ss=1)
    for _ in range(260):
        via.circle(r.uniform(2.5, 131), r.uniform(6.3, 30), 0.13)
    vias = via.array()

    # Медь без маски: контакты, площадки пассивки, реперы, кольца отверстий
    cu = Sheet(W, Hpx, b)
    pitch = 0.85
    xs = [3.6 + i * pitch for i in range(151)]
    fingers = [x for x in xs if abs(x - 70.2) > 1.05][:144]
    for x in fingers:
        cu.rect(world(x), 1.62, 0.6, 3.1, radius=0.12)
    passives = front_passives() if side == 'front' else back_passives()
    for kind, px_, pz, vertical in passives:
        lx = to_local(px_)
        l, w, _ = SIZES[kind]
        for s in (-1, 1):
            if vertical:
                cu.rect(lx, _mm(pz) + s * l * 0.36, w * 1.15, l * 0.34)
            else:
                cu.rect(lx + s * l * 0.36, _mm(pz), l * 0.34, w * 1.15)
    for fx in (2.3, _mm(L) - 2.3):
        cu.circle(fx, _mm(H) - 2.2, 0.55)
    for hx in (2.4, _mm(L) - 2.4):
        cu.circle(hx, 4.4, 1.4)
        cu.circle(hx, 13.15, 0.9)  # кольцо на язычке защёлки
    copper = cu.array()
    # Открытое кольцо маски вокруг реперов
    ring = Sheet(W, Hpx, b)
    for fx in (2.3, _mm(L) - 2.3):
        ring.circle(fx, _mm(H) - 2.2, 1.05)
    ring_m = np.clip(ring.array() - copper, 0, 1)

    gold = np.array(tex.hex_rgb('#e3bd6d'), np.float32)
    base = base * (1 + 0.45 * traces[..., None]) + 0.01 * vias[..., None]
    base = tex.mix_rgb(base, np.array((0.2, 0.18, 0.14), np.float32), ring_m)
    base = tex.mix_rgb(base, gold, copper)
    rough = 0.3 + 0.06 * tex.fbm(Hpx, W, 80, 3, seed=9) - 0.08 * traces - 0.08 * copper
    metal = copper
    height = 0.8 * traces + 0.35 * vias + 1.5 * copper
    normal = tex.normal_from_height(tex.blur(height, 0.7), 1.2)
    return base, rough, metal, normal


def tex_dram(Wpx=640):
    """Верх корпуса DRAM Micron: матовый компаунд, лазерная маркировка (повёрнута, как на фото), 2D-код."""
    Hpx = int(Wpx * CHIP_H / CHIP_W)
    w_mm, h_mm = _mm(CHIP_W), _mm(CHIP_H)
    sh = Sheet(Wpx, Hpx, (0, 0, w_mm, h_mm), ss=3)
    # 2D-код в левом верхнем углу
    tex.datamatrix(sh.cv, *sh.px(0.9, h_mm - 0.8), 2.2 * sh.k, n=14, seed=3)
    # Маркировка идёт снизу вверх: рисуем на повёрнутом холсте
    rot = tex.Canvas(Hpx, Wpx, 3)
    k = Hpx / h_mm
    logo = tex.logo_mask('micron_logo', int(1.3 * k * 3))
    rot.paste_mask(logo, 1.1 * k, 2.3 * k, h=1.25 * k)
    rot.text(1.1 * k, 4.6 * k, '4VA27', 'OCRAEXT.TTF', 1.35 * k, 255, tracking=0.06)
    rot.text(1.1 * k, 6.35 * k, 'D8GTV', 'OCRAEXT.TTF', 1.35 * k, 255, tracking=0.06)
    rot.text(1.2 * k, 9.05 * k, '• MT60B8G4RB-EB:A  2638', 'ARIALN.TTF', 0.72 * k, 255, tracking=0.08)
    from PIL import Image

    rotated = Image.fromarray((rot.array() * 255).astype(np.uint8)).transpose(Image.Transpose.ROTATE_90)
    mark = np.maximum(sh.array(), np.asarray(rotated.resize((Wpx, Hpx)), np.float32) / 255)
    sh2 = Sheet(Wpx, Hpx, (0, 0, w_mm, h_mm), ss=3)
    sh2.circle(w_mm - 0.9, 0.9, 0.35)  # ямка первого вывода
    pin1 = sh2.array()

    n = tex.fbm(Hpx, Wpx, 30, 4, seed=7)
    base = np.ones((Hpx, Wpx, 3), np.float32) * np.array(tex.hex_rgb('#1d1e20'), np.float32)
    base *= (0.9 + 0.2 * n)[..., None]
    base = tex.mix_rgb(base, np.array(tex.hex_rgb('#8a8b8d'), np.float32), mark * 0.85)
    base = tex.mix_rgb(base, np.array(tex.hex_rgb('#0e0f10'), np.float32), pin1)
    rough = 0.62 + 0.1 * n + 0.12 * mark - 0.2 * pin1
    height = -0.6 * mark - 1.2 * pin1 + 0.15 * tex.value_noise(Hpx, Wpx, 1.2, seed=8)
    normal = tex.normal_from_height(tex.blur(height, 0.5), 1.0)
    return base, rough, np.zeros_like(rough), normal


def tex_ic(w_mm, h_mm, lines, seed=0, Wpx=512, logo=None):
    """Верх микросхемы (RCD, PMIC, SPD): компаунд с лазерной маркировкой по центру."""
    Hpx = int(Wpx * h_mm / w_mm)
    sh = Sheet(Wpx, Hpx, (0, 0, w_mm, h_mm), ss=3)
    y = h_mm * 0.62 + 0.9 * (len(lines) - 1) / 2
    if logo:
        m = tex.logo_mask(logo, int(1.4 * sh.k * 3))
        x, yy = sh.px(w_mm / 2 - 2.8, y + 2.0)
        sh.cv.paste_mask(m, x, yy, h=1.2 * sh.k)
    for s, size in lines:
        sh.text(w_mm / 2, y, s, 'OCRAEXT.TTF', size, 255, anchor='mm', tracking=0.05)
        y -= size * 1.55
    sh.circle(0.9, h_mm - 0.9, 0.35)
    mark = sh.array()
    n = tex.fbm(Hpx, Wpx, 30, 3, seed=seed)
    base = np.ones((Hpx, Wpx, 3), np.float32) * np.array(tex.hex_rgb('#1b1c1e'), np.float32) * (0.9 + 0.2 * n)[..., None]
    base = tex.mix_rgb(base, np.array(tex.hex_rgb('#86878a'), np.float32), mark * 0.85)
    rough = 0.6 + 0.1 * n + 0.1 * mark
    normal = tex.normal_from_height(tex.blur(-0.6 * mark, 0.5), 1.0)
    return base, rough, np.zeros_like(rough), normal


def tex_label(Wpx=1600):
    """Наклейка Micron: белая бумага, логотип, строки маркировки, штрихкод, DataMatrix."""
    lw, lh = 48.0, 12.2
    Hpx = int(Wpx * lh / lw)
    sh = Sheet(Wpx, Hpx, (0, 0, lw, lh), ss=2)
    logo = tex.logo_mask('micron_logo', int(2.4 * sh.k * 2))
    x, y = sh.px(2.0, lh - 1.3)
    sh.cv.paste_mask(logo, x, y, h=2.1 * sh.k)
    sh.text(2.0, lh - 4.25, '512GB 2S8Rx4 DDR5-9200 RDIMM', 'arialbd.ttf', 1.55, 255, tracking=0.01)
    sh.text(2.0, lh - 6.2, 'PC5-9200B-RB0-1210-XT', 'arial.ttf', 1.35, 255)
    sh.text(2.0, lh - 7.95, 'MTC80F4096S1RC92BA1  QSFF', 'arial.ttf', 1.2, 255)
    tex.barcode(sh.cv, *sh.px(2.0, lh - 8.9), 27 * sh.k, 1.9 * sh.k, seed=11)
    sh.text(2.0, 0.55, '26384A7DC1F2  2638', 'arial.ttf', 0.9, 255, anchor='ls')
    tex.datamatrix(sh.cv, *sh.px(36.5, lh - 1.6), 7.0 * sh.k, n=20, seed=12)
    sh.text(40.0, 2.3, 'MADE IN MALAYSIA', 'arialbd.ttf', 0.85, 255, anchor='ms')
    sh.text(40.0, 1.0, 'ECC  REG  1.1V', 'arial.ttf', 0.8, 255, anchor='ms')
    ink = sh.array()
    paper = np.array(tex.hex_rgb('#f2f2ef'), np.float32)
    n = tex.fbm(Hpx, Wpx, 6, 3, seed=13)
    base = np.ones((Hpx, Wpx, 3), np.float32) * paper * (0.97 + 0.04 * n)[..., None]
    base = tex.mix_rgb(base, np.array(tex.hex_rgb('#141414'), np.float32), ink)
    rough = 0.45 + 0.1 * n - 0.1 * ink
    normal = tex.normal_from_height(tex.blur(0.3 * n + 0.2 * ink, 0.6), 0.6)
    return base, rough, np.zeros_like(rough), normal


def tex_die(Wpx=512):
    """Кристалл DRAM: банки массивов памяти и полосы периферии — видны при разлёте стека."""
    import dieshot

    pal = dieshot.palette(['#0b0f18', '#1a2a3e', '#2c4d6e', '#5c86a8', '#a9c6db'])
    per = dieshot.palette(['#10131a', '#2a2f3d', '#4a4e63', '#7b7f98'])
    d = dieshot.Die(Wpx, int(Wpx * 9.5 / 8.5), 21)
    d.fill(0, 0, 1, 1, 'logic', per, 0.2, 0.6)
    for i in range(4):
        for j in range(2):
            x0, y0 = 0.03 + i * 0.24, 0.04 + j * 0.5
            d.fill(x0, y0, x0 + 0.22, y0 + 0.42, 'sram', pal, 0.15, 0.85, cell=1.9, bank=18)
    d.fill(0.03, 0.47, 0.97, 0.53, 'phy', per, 0.3, 0.8, period=3.0)
    d.seal_ring(0.015)
    return d.result()


def save_set(name, parts, size=None):
    base, rough, metal, normal = parts
    tex.save(base, TEX / f'{name}_c.png')
    tex.save(tex.orm(1.0, rough, metal, base.shape[:2]), TEX / f'{name}_orm.png')
    tex.save(normal, TEX / f'{name}_n.png')


def pbr(name, tex_name, **kw):
    return bl.material(
        name,
        base_tex=bl.load_image(TEX / f'{tex_name}_c.png'),
        orm_tex=bl.load_image(TEX / f'{tex_name}_orm.png', color=False),
        normal_tex=bl.load_image(TEX / f'{tex_name}_n.png', color=False),
        metallic=1.0,
        roughness=1.0,
        **kw,
    )


# ── Геометрия ────────────────────────────────────────────────────────────────

ROT_FRONT = Matrix.Rotation(math.pi / 2, 4, 'X')  # призма (x, y, z) → (x, −z, y): высота по Z, толщина наружу (−Y)
ROT_BACK = Matrix.Rotation(math.pi, 4, 'Z')  # обратная сторона — поворот лицевой раскладки на 180° вокруг вертикали


def on_side(obj, side: str, x: float, z: float, lift: float = 0.0):
    """
    Ставит призму (построенную в XY с толщиной по +Z) на сторону платы: основание на поверхности,
    толщина — наружу. lift — отступ основания от поверхности.
    """
    m = Matrix.Translation((x, -(T / 2 + lift), z)) @ ROT_FRONT
    if side == 'back':
        m = ROT_BACK @ m
    obj.data.transform(m)
    obj.data.update()
    return obj


def plate(name, w, h, t, mats, side, x, z, lift=0.0, bevel=0.0, seg=1, r=0.0, parent=None, uv=True):
    o = bl.prism(name, bl.rrect(w, h, r, seg=3), 0, t, mats=mats, bevel=bevel, seg=seg, parent=parent)
    if uv:
        bl.uv_planar(o, (-w / 2, -h / 2, w / 2, h / 2))
    return on_side(o, side, x, z, lift)


def build(lod: bool = False):
    """lod — облегчённый модуль для статистов сцены сборки: корпуса без стеков и пассивки."""
    TEX.mkdir(parents=True, exist_ok=True)
    root = bl.empty('rdimm')

    # ── Текстуры ──
    for side in ('front', 'back'):
        save_set(f'pcb_{side}', tex_pcb(side))
    save_set('dram', tex_dram())
    save_set('rcd', tex_ic(8.7, 14.1, [('M88DR5RCD02', 1.05), ('2634 T4B', 0.95), ('A1B7N26', 0.95)], seed=31))
    save_set('pmic', tex_ic(5.0, 5.0, [('P8911', 0.7), ('2631', 0.6)], seed=32, Wpx=256))
    save_set('spd', tex_ic(2.6, 2.6, [('5118', 0.55)], seed=33, Wpx=128))
    save_set('label', tex_label())
    tex.save(tex_die(), TEX / 'die.png')

    # ── Материалы ──
    pcb_f = pbr('pcb_front', 'pcb_front')
    pcb_b = pbr('pcb_back', 'pcb_back')
    pcb_edge = bl.solid('pcb_edge', bl.srgb('#2a2618'), 0.0, 0.7)
    dram = pbr('dram_mold', 'dram')
    mold_side = bl.solid('mold_side', bl.srgb('#141517'), 0.0, 0.7)
    substrate = bl.solid('bga_substrate', bl.srgb('#1d2420'), 0.0, 0.45)
    die_img = bl.load_image(TEX / 'die.png')
    die = bl.material('dram_die', base_tex=die_img, metallic=0.2, roughness=0.18, specular=0.5)
    die_edge = bl.solid('dram_die_edge', bl.srgb('#3a3f47'), 0.5, 0.3)
    tsv = bl.material('tsv', color=bl.srgb('#0a0b0c'), roughness=0.4, emission_color=bl.srgb(ACCENT), emission_strength=1.0)
    tsv['glow'] = True
    edge_glow = bl.material('edge_glow', color=bl.srgb('#0d0e10'), roughness=0.35, emission_color=bl.srgb(ACCENT), emission_strength=1.0)
    edge_glow['glow'] = True
    rcd_m = pbr('rcd', 'rcd')
    pmic_m = pbr('pmic', 'pmic')
    spd_m = pbr('spd', 'spd')
    label_m = pbr('label', 'label')
    label_edge = bl.solid('label_edge', bl.srgb('#e8e8e4'), 0.0, 0.5)
    ceramic = bl.solid('mlcc_body', bl.srgb('#6e5a44'), 0.0, 0.5)
    tin = bl.solid('mlcc_term', bl.srgb('#c4c1b8'), 1.0, 0.32)
    inductor = bl.solid('inductor', bl.srgb('#3a3b3e'), 0.6, 0.45)

    # ── Плата ──
    holes = [circle(x, z, r) for x, z, r in HOLES]
    pcb = bl.prism('pcb', outline(), -T / 2, T / 2, mats=[pcb_f, pcb_b, pcb_edge], holes=holes, bevel=0.08 * MM, seg=1, parent=root)
    pcb.data.transform(ROT_FRONT)
    # UV: лицевая — прямая проекция (x, z), обратная — зеркальная, чтобы текстура читалась сзади
    me = pcb.data
    uvl = me.uv_layers.new(name='UVMap')
    for poly in me.polygons:
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            u = (co.x - X0) / L
            v = co.z / H
            if poly.material_index == 1:
                u = 1 - u
            uvl.data[li].uv = (u, v)
    bl.empty('contacts', root, (0, 0, 1.6 * MM))

    # ── Корпуса DRAM с 3DS-стеками ──
    if lod:
        molds = [plate('mold', CHIP_W, CHIP_H, CHIP_T, [dram, dram, mold_side], side, x, z, bevel=0.12 * MM, seg=1) for side in ('front', 'back') for x, z in chips()]
        bl.join(molds, 'chips').parent = root
    for side in (() if lod else ('front', 'back')):
        sgn = -1 if side == 'front' else 1  # направление наружу по Y
        mold_node = bl.rig(bl.empty(f'{side}_mold', root), explode=(0, sgn * MOLD_FLY, 0), explodeRange=[0.0, 0.55])
        sub_parts, mold_parts = [], []
        layer_parts = [[] for _ in range(LAYERS)]
        tsv_parts = []
        for i, (x, z) in enumerate(chips()):
            sub_parts.append(plate('sub', CHIP_W, CHIP_H, SUB_T, [substrate], side, x, z, bevel=0.03 * MM, uv=False))
            m = plate('mold', CHIP_W - 0.1 * MM, CHIP_H - 0.1 * MM, CHIP_T - SUB_T, [dram, dram, mold_side], side, x, z, lift=SUB_T, bevel=0.12 * MM, seg=2)
            mold_parts.append(m)
            for k in range(LAYERS):
                layer_parts[k].append(plate('die', 8.5 * MM, 9.5 * MM, DIE_T, [die, die, die_edge], side, x, z, lift=SUB_T + 0.05 * MM + k * DIE_GAP, uv=True))
            for dx in (-2.4, 0, 2.4):
                for dz in (-1.6, 1.6):
                    c = bl.cylinder('tsv', 0.16 * MM, SUB_T + 0.05 * MM + LAYERS * DIE_GAP, mats=[tsv], verts=8)
                    tsv_parts.append(on_side(c, side, x + dx * MM, z + dz * MM))
            idx = i + (0 if side == 'front' else 20)
            anchor = bl.empty(f'dram_stack_{idx}', root)
            p = on_anchor(side, x, z, CHIP_T + 0.2 * MM)
            anchor.location = p
        bl.join(sub_parts, f'{side}_substrate').parent = root
        molds = bl.join(mold_parts, f'{side}_mold_mesh')
        molds.parent = mold_node
        for k in range(LAYERS):
            layer = bl.join(layer_parts[k], f'{side}_layer_{k}')
            layer.parent = root
            bl.rig(layer, explode=(0, sgn * k * LAYER_STEP, 0), explodeRange=[0.25, 1.0])
        # Нити TSV растут из поверхности платы: origin узла — на поверхности, масштаб по нормали
        threads = bl.join(tsv_parts, f'{side}_tsv')
        _set_origin(threads, (0, sgn * T / 2, 0))
        threads.parent = root
        top_rest = SUB_T + 0.05 * MM + (LAYERS - 1) * DIE_GAP + DIE_T
        top_exploded = top_rest + (LAYERS - 1) * LAYER_STEP
        rest_len = SUB_T + 0.05 * MM + LAYERS * DIE_GAP
        bl.rig(threads, explodeScale=[1, 1, round(top_exploded / rest_len, 3)], explodeRange=[0.25, 1.0], glow='tsv', glowMax=5)

    # ── Наклейка на левой группе корпусов (улетает вместе с компаундом) ──
    lab = plate('label', 48.0 * MM, 12.2 * MM, 0.09 * MM, [label_m, label_edge, label_edge], 'front', X0 + 30.0 * MM, 17.3 * MM, lift=CHIP_T + 0.005 * MM, bevel=0.03 * MM, r=1.2 * MM)
    lab.parent = root if lod else bpy.data.objects['front_mold']

    # ── RCD (лицо), PMIC и SPD (обратная сторона) ──
    rcd = plate('rcd', RCD['w'], RCD['h'], RCD['t'], [rcd_m, rcd_m, mold_side], 'front', RCD['x'], RCD['z'], bevel=0.1 * MM, seg=2, parent=root)
    pmic = bl.empty('pmic', root)
    pm = [plate('pmic_chip', 5.0 * MM, 5.0 * MM, 0.9 * MM, [pmic_m, pmic_m, mold_side], 'back', CENTER_X, 13.5 * MM, bevel=0.08 * MM)]
    for k, (ix, iz) in enumerate(((-4.2, 20.0), (0.0, 20.0), (4.2, 20.0), (-4.2, 22.4))):
        pm.append(plate('ind', 3.2 * MM, 2.6 * MM, 1.2 * MM, [inductor], 'back', CENTER_X + ix * MM, iz * MM, bevel=0.15 * MM, seg=2, uv=False))
    for o in pm:
        o.parent = pmic
    spd = plate('spd', 2.6 * MM, 2.6 * MM, 0.6 * MM, [spd_m, spd_m, mold_side], 'back', CENTER_X + 4.5 * MM, 13.5 * MM, bevel=0.05 * MM, parent=root)

    # ── Пассивка ──
    caps = []
    for side, items in () if lod else (('front', front_passives()), ('back', back_passives())):
        for kind, x, z, vertical in items:
            l, w, h = (v * MM for v in SIZES[kind])
            parts = _mlcc(l, w, h, ceramic, tin)
            if vertical:
                for p in parts:
                    p.data.transform(Matrix.Rotation(math.pi / 2, 4, 'Z'))
            for p in parts:
                on_side(p, side, x, z)
            caps.extend(parts)
    if caps:
        bl.join(caps, 'passives').parent = root

    # ── Светящаяся кромка вдоль верха (сцена сравнения энергопотребления) ──
    if not lod:
        edges = [plate('edge', L - 6 * MM, 0.45 * MM, 0.02 * MM, [edge_glow], side, 0, H - 0.9 * MM, uv=False) for side in ('front', 'back')]
        edge_node = bl.join(edges, 'edge')
        edge_node.parent = root
        bl.rig(edge_node, glow='edge', glowMax=1)

    # ── AO платы: запекаем без корпусов в воздухе — они стоят на месте в собранном виде ──
    ao_f = bl.bake_ao([(pcb, pcb_f)], 2048, TEX / 'pcb_front_ao.png', samples=96, distance=2.5 * MM)
    ao_b = bl.bake_ao([(pcb, pcb_b)], 2048, TEX / 'pcb_back_ao.png', samples=96, distance=2.5 * MM)
    from PIL import Image

    for side, ao in (('front', ao_f), ('back', ao_b)):
        c = np.asarray(Image.open(TEX / f'pcb_{side}_c.png'), np.float32) / 255
        orm_img = np.asarray(Image.open(TEX / f'pcb_{side}_orm.png'), np.float32) / 255
        h, w = c.shape[:2]
        a = np.asarray(Image.fromarray(ao).resize((w, h), Image.BILINEAR), np.float32)
        a = np.clip(a, 0, 1)
        orm_img[..., 0] = a
        tex.save(orm_img, TEX / f'pcb_{side}_orm.png')
        tex.save(c * (0.6 + 0.4 * a[..., None]), TEX / f'pcb_{side}_c.png')
    for img in bpy.data.images:
        if img.filepath and 'pcb_' in img.filepath:
            img.reload()
    return root


def on_anchor(side, x, z, out):
    y = -(T / 2 + out) if side == 'front' else T / 2 + out
    x = x if side == 'front' else -x
    return (x, y, z)


def _set_origin(obj, point):
    """Переносит origin объекта в point (мировые координаты) без сдвига геометрии."""
    m = Matrix.Translation((-point[0], -point[1], -point[2]))
    obj.data.transform(m)
    obj.location = point


def _mlcc(l, w, h, body_mat, term_mat):
    t = l * 0.22
    body = bl.box('mb', (l - 2 * t + 0.02 * MM, w * 0.96, h * 0.96), (0, 0, h * 0.02), mats=[body_mat])
    parts = [body]
    for s in (-1, 1):
        parts.append(bl.box('mt', (t, w, h), (s * (l / 2 - t / 2), 0, 0), mats=[term_mat], bevel=min(0.05 * MM, h * 0.1), seg=1))
    return parts


PREVIEWS = {
    # Как на фото: лицевая сторона почти фронтально, чуть сверху
    'front': dict(cam=(0.0, -0.24, 0.03), target=(0, 0, 0.0156), lens=52),
    'hero': dict(cam=(-0.12, -0.16, 0.08), target=(0.0, 0, 0.014), lens=70),
    'detail': dict(cam=(0.035, -0.07, 0.04), target=(0.004, 0, 0.012), lens=70),
    'back': dict(cam=(0.08, 0.17, 0.06), target=(0, 0, 0.0156), lens=75),
    'exploded': dict(cam=(-0.19, -0.2, 0.1), target=(0.0, 0.0, 0.016), lens=45, explode=1.0, glow=1.0),
}
