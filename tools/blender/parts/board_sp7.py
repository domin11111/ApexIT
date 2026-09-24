"""
Серверная плата SP7 (1P) — по references/components/mb.png и сокету из sp7_sp8.png.

Компоновка как на mb.png: сокет в центре, группы слотов DIMM с двух сторон, VRM сбоку от сокета —
дроссели с металлическими крышками, силовые каскады, бронзовые полимерные конденсаторы, чёрные
ребристые радиаторы на подпружиненных винтах; коннекторы MCIO и питания в углу, шпильки под кулер.
Отличие от mb.png осознанное: на референсе 12 + 12 слотов (SP5, 12 каналов × 2DPC), у SP7 —
16 каналов, поэтому здесь 8 + 8 слотов 1DPC (SLOTS_PER_SIDE).

Плата 330 × 305 × 2,4 мм в плоскости XY, верх — z = 0, север — +Y.
Узлы: motherboard → board, socket, dimm_slots (dimm_slot_0…15 — якоря), vrm, heatsinks,
connectors, pcie_slot, bmc, standoffs, parts. Вариант assembled добавляет процессор и модули.
"""
from __future__ import annotations

import math

import bpy
import numpy as np
from mathutils import Matrix

import bl
import socket_sp7 as sock
import tex
from bl import MM

NAME = 'board-sp7'
TEX = bl.BUILD / 'tex' / 'board'

BW, BH, BT = 330.0 * MM, 305.0 * MM, 2.4 * MM
SX, SY = -20.0 * MM, 0.0  # центр сокета
SLOTS_PER_SIDE = 8
SLOT_PITCH = 7.9 * MM
SLOT_LEN, SLOT_W, SLOT_H = 142.0 * MM, 6.4 * MM, 7.0 * MM
SLOT_Y0 = 84.0 * MM  # первый слот от центра сокета
SLOT_X = SX  # центр слотов по X
PCIE = [(105.0 * MM, -100.0 * MM), (105.0 * MM, -128.0 * MM)]
MOUNT_HOLES = [(x * MM, y * MM) for x, y in ((-157, 145), (-157, -145), (157, 145), (157, -145), (-157, 0), (157, 0), (-100, 145), (-100, -145), (60, 145), (60, -145))]


def slot_positions() -> list[float]:
    """Y центров слотов: север (0…7) от сокета наружу, затем юг (8…15)."""
    north = [SY + SLOT_Y0 + i * SLOT_PITCH for i in range(SLOTS_PER_SIDE)]
    south = [SY - SLOT_Y0 - i * SLOT_PITCH for i in range(SLOTS_PER_SIDE)]
    return north + south


def chokes() -> list[tuple[float, float]]:
    """Две колонки дросселей VRM к востоку от сокета."""
    return [(x * MM, (-52 + i * 15) * MM) for x in (66, 82) for i in range(8)]


def pstages() -> list[tuple[float, float]]:
    return [(97 * MM, (-52 + i * 15) * MM) for i in range(8)]


def polycaps() -> list[tuple[float, float]]:
    return [(x * MM, (-60 + i * 15) * MM) for x in (55.5,) for i in range(9)] + [(x * MM, y * MM) for x, y in ((140, 60), (148, 60), (140, -60), (148, -60))]


# ── Текстуры ─────────────────────────────────────────────────────────────────


class Sheet:
    """Холст платы в мм (центр платы — 0, 0; верх картинки — север)."""

    def __init__(self, w_px, h_px, ss=2):
        self.w, self.h = w_px, h_px
        self.k = w_px / (BW / MM)
        self.cv = tex.Canvas(w_px, h_px, ss)

    def px(self, x, y):
        return (x + BW / MM / 2) * self.k, (BH / MM / 2 - y) * self.k

    def rect(self, cx, cy, w, h, fill=255, radius=0.0):
        a = self.px(cx - w / 2, cy + h / 2)
        b = self.px(cx + w / 2, cy - h / 2)
        self.cv.rect(a[0], a[1], b[0], b[1], fill, radius * self.k)

    def frame(self, cx, cy, w, h, t, fill=255):
        for dx, dy, ww, hh in ((0, h / 2, w, t), (0, -h / 2, w, t), (w / 2, 0, t, h), (-w / 2, 0, t, h)):
            self.rect(cx + dx, cy + dy, ww, hh, fill)

    def circle(self, cx, cy, r, fill=255):
        x, y = self.px(cx, cy)
        self.cv.ellipse(x, y, r * self.k, fill)

    def line(self, pts, width, fill=255):
        self.cv.line([self.px(x, y) for x, y in pts], width * self.k, fill)

    def text(self, x, y, s, size, fill=255, anchor='la', font='ARIALN.TTF', tracking=0.02):
        px, py = self.px(x, y)
        self.cv.text(px, py, s, font, size * self.k, fill, anchor, tracking)

    def array(self):
        return self.cv.array()


def _mm(v):
    return v / MM


def tex_board(W=4096):
    """Верх платы: маска, медь под ней (шины памяти, полигоны питания), шелкография, площадки, отверстия."""
    Hp = int(W * BH / BW)
    r = tex.rng(7)
    sx, sy = _mm(SX), _mm(SY)
    fw, fh = _mm(sock.FRAME_OUT[0]) / 2, _mm(sock.FRAME_OUT[1]) / 2

    # Шины памяти: от северного и южного края сокета к слотам, веером с изломами 45°
    tr = Sheet(W, Hp)
    ys = [_mm(y) for y in slot_positions()]
    for side in (1, -1):
        for i in range(90):
            x0 = sx - fw + 6 + i * (2 * fw - 12) / 90
            y0 = sy + side * (fh + 1)
            target = ys[(i // 12) % SLOTS_PER_SIDE + (0 if side > 0 else SLOTS_PER_SIDE)]
            ym = y0 + side * (3 + (i % 12) * 0.55)
            tr.line([(x0, y0), (x0, ym), (x0 + side * 0 + (4 if i % 2 else -4), ym + side * 4), (x0 + (4 if i % 2 else -4), target - side * 3.6)], 0.14, 150)
    # PCIe: пучок к слотам на юго-востоке
    for i in range(48):
        x0 = sx + fw - 2 - i * 0.6
        tr.line([(sx + fw + 1, sy - 30 + i * 0.5), (60 + i * 0.3, sy - 30 + i * 0.5), (75 + i * 0.3, -70), (75 + i * 0.3, _mm(PCIE[0][1]) + 6)], 0.13, 130)
    # Случайная разводка по свободным зонам
    for _ in range(420):
        x = r.uniform(-160, 160)
        y = r.uniform(-148, 148)
        if abs(x - sx) < fw + 3 and abs(y - sy) < fh + 3:
            continue
        L = r.uniform(4, 28)
        d = r.integers(4)
        pts = [(x, y), (x + (L if d == 0 else -L if d == 1 else 0), y + (L if d == 2 else -L if d == 3 else 0))]
        pts.append((pts[-1][0] + r.uniform(-6, 6), pts[-1][1] + r.uniform(-6, 6)))
        tr.line(pts, 0.14, 110)
    traces = tex.blur(tr.array(), 0.8)

    # Полигоны питания VRM и земли — едва заметные светлые пятна под маской
    pw = Sheet(W, Hp)
    pw.rect(90, 0, 70, 130, 90, radius=4)
    pw.rect(sx, sy, 2 * fw + 16, 2 * fh + 12, 60, radius=6)
    planes = tex.blur(pw.array(), 6)

    # Медь без маски: кольца крепёжных отверстий, реперы, площадки
    cu = Sheet(W, Hp)
    for x, y in MOUNT_HOLES:
        cu.circle(_mm(x), _mm(y), 4.2)
    for x, y in ((-160, 148), (160, -148), (-150, -148)):
        cu.circle(x, y, 0.6)
    copper = cu.array()
    holes = Sheet(W, Hp)
    for x, y in MOUNT_HOLES:
        holes.circle(_mm(x), _mm(y), 1.7)
    hole_m = holes.array()

    # Шелкография
    silk = Sheet(W, Hp, ss=3)
    silk.text(sx - fw, sy + fh + 2.5, 'CPU0  SP7', 2.4)
    for i, y in enumerate(ys):
        ch = 'ABCDEFGHIJKLMNOP'[i]
        silk.text(_mm(SLOT_X) - _mm(SLOT_LEN) / 2 - 1.5, y - 1.0, f'DIMM{ch}1', 1.5, anchor='ra')
    silk.text(60, 140, 'JPWR1', 1.8)
    silk.text(96, 140, 'JPWR2', 1.8)
    silk.text(-150, 60, 'BMC', 2.0)
    silk.text(110, -85, 'PCIE1  PCIe 5.0 x16', 1.8)
    silk.text(110, -113, 'PCIE2  PCIe 5.0 x16', 1.8)
    silk.text(-150, -120, 'MCIO1', 1.6)
    silk.text(-150, -100, 'MCIO2', 1.6)
    silk.text(-158, -150, 'SP7-1P  REV 1.02', 2.2, font='arialbd.ttf')
    silk.text(-100, -150, 'E-ATX  305 x 330', 1.6)
    # Контуры компонентов
    for y in ys:
        silk.frame(_mm(SLOT_X), y, _mm(SLOT_LEN) + 1.2, _mm(SLOT_W) + 1.2, 0.15)
    for x, y in chokes():
        silk.frame(_mm(x), _mm(y), 14.2, 14.2, 0.15)
    silk.frame(sx, sy, 2 * fw + 3, 2 * fh + 3, 0.2)
    for x, y in MOUNT_HOLES:
        silk.circle(_mm(x), _mm(y), 5.6, 255)
        silk.circle(_mm(x), _mm(y), 5.3, 0)
    # Метки ориентации: треугольник первого вывода сокета
    tri = [silk.px(sx - fw - 3, sy - fh + 2), silk.px(sx - fw - 3, sy - fh - 2), silk.px(sx - fw - 7, sy - fh - 2)]
    silk.cv.poly(tri, 255)
    silkm = silk.array()

    n = tex.fbm(Hp, W, 300, 4, seed=3)
    base = np.ones((Hp, W, 3), np.float32) * np.array(tex.hex_rgb('#0d0e10'), np.float32) * (0.9 + 0.2 * n)[..., None]
    base = base * (1 + 0.9 * traces[..., None] + 0.25 * planes[..., None])
    base = tex.mix_rgb(base, np.array(tex.hex_rgb('#e6e6e2'), np.float32), silkm * 0.92)
    base = tex.mix_rgb(base, np.array(tex.hex_rgb('#c9c4b6'), np.float32), copper)
    base = tex.mix_rgb(base, np.array((0.01, 0.01, 0.01), np.float32), hole_m)
    rough = 0.24 + 0.05 * n - 0.05 * traces + 0.35 * silkm - 0.05 * copper
    metal = copper * (1 - hole_m)
    height = 0.9 * traces + 0.4 * planes + 0.6 * silkm + 0.8 * copper
    normal = tex.normal_from_height(tex.blur(height, 0.8), 1.1)
    return base, rough, metal, normal


def tex_choke_top(size=256):
    """Металлическая крышка дросселя с маркировкой номинала."""
    sh = tex.Canvas(size, size, 3)
    sh.text(size / 2, size / 2, 'R15', 'arialbd.ttf', size * 0.28, 255, anchor='mm')
    mark = sh.array()
    n = tex.fbm(size, size, 30, 3, seed=5)
    base = np.ones((size, size, 3), np.float32) * np.array(tex.hex_rgb('#c4c7ca'), np.float32) * (0.95 + 0.08 * n)[..., None]
    base = tex.mix_rgb(base, np.array(tex.hex_rgb('#3a3b3d'), np.float32), mark * 0.8)
    rough = 0.35 + 0.08 * n + 0.2 * mark
    normal = tex.normal_from_height(tex.blur(-0.5 * mark + 0.2 * n, 0.8), 1.0)
    return base, rough, 1 - 0.8 * mark, normal


def tex_cap_top(size=256):
    """Торец полимерного конденсатора: насечка-крест клапана, полоса полярности."""
    c = (size - 1) / 2
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32) - c
    cross = ((abs(xx) < size * 0.012) | (abs(yy) < size * 0.012)) & (np.sqrt(xx**2 + yy**2) < size * 0.3)
    cross = tex.blur(cross.astype(np.float32), 1.0)
    ring = np.sqrt(xx**2 + yy**2) / c
    n = tex.fbm(size, size, 20, 3, seed=6)
    base = np.ones((size, size, 3), np.float32) * np.array(tex.hex_rgb('#b99b6b'), np.float32) * (0.95 + 0.08 * n)[..., None]
    base *= (1 - 0.35 * cross)[..., None]
    rough = 0.3 + 0.1 * n + 0.2 * cross
    height = -1.5 * cross - 0.5 * np.clip(ring - 0.85, 0, 1)
    normal = tex.normal_from_height(tex.blur(height, 0.8), 3.0)
    return base, rough, np.ones_like(rough), normal


def tex_ic(w_mm, h_mm, lines, seed=0, Wpx=512):
    Hpx = int(Wpx * h_mm / w_mm)
    cv = tex.Canvas(Wpx, Hpx, 3)
    k = Wpx / w_mm
    y = h_mm * 0.5 - 0.8 * (len(lines) - 1) / 2
    for s, size in lines:
        cv.text(Wpx / 2, y * k, s, 'OCRAEXT.TTF', size * k, 255, anchor='mm', tracking=0.05)
        y += size * 1.6
    cv.ellipse(1.2 * k, 1.2 * k, 0.45 * k)
    mark = cv.array()
    n = tex.fbm(Hpx, Wpx, 30, 3, seed=seed)
    base = np.ones((Hpx, Wpx, 3), np.float32) * np.array(tex.hex_rgb('#1b1c1e'), np.float32) * (0.9 + 0.2 * n)[..., None]
    base = tex.mix_rgb(base, np.array(tex.hex_rgb('#8c8d90'), np.float32), mark * 0.85)
    rough = 0.6 + 0.1 * n + 0.1 * mark
    normal = tex.normal_from_height(tex.blur(-0.6 * mark, 0.5), 1.0)
    return base, rough, np.zeros_like(rough), normal


def tex_thread(size=256):
    """Резьба шпильки: винтовые канавки вдоль высоты (развёртка цилиндра)."""
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    ph = (yy / size * 14 + xx / size) % 1.0
    groove = 0.5 + 0.5 * np.cos(ph * 2 * np.pi)
    base = np.ones((size, size, 3), np.float32) * np.array(tex.hex_rgb('#c9ccd0'), np.float32) * (0.75 + 0.25 * groove)[..., None]
    rough = 0.3 + 0.15 * (1 - groove)
    normal = tex.normal_from_height(groove, 5.0)
    return base, rough, np.ones_like(rough), normal


def save_set(name, parts):
    base, rough, metal, normal = parts[:4]
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

aabb = sock.aabb


def dimm_slot(name, y, mats, parent):
    """Слот DDR5: корпус с пазом, контакты на дне, башни защёлок с рычагами на торцах."""
    body_m, latch_m, pin_m = mats
    x0, x1 = SLOT_X - SLOT_LEN / 2, SLOT_X + SLOT_LEN / 2
    parts = [
        aabb('slot_base', x0, x1, y - SLOT_W / 2, y + SLOT_W / 2, 0, 1.8 * MM, [body_m], bevel=0.2 * MM),
        bl.prism('slot_walls', bl.rrect(SLOT_LEN, SLOT_W, 0.6 * MM, seg=2), 1.8 * MM, SLOT_H, mats=[body_m], holes=[bl.rrect(SLOT_LEN - 6 * MM, 1.9 * MM, 0.3 * MM, seg=2)], bevel=0.2 * MM, seg=1),
        # Контакты на дне паза
        aabb('slot_pins', x0 + 3.2 * MM, x1 - 3.2 * MM, y - 0.8 * MM, y + 0.8 * MM, 1.8 * MM, 2.05 * MM, [pin_m]),
    ]
    parts[1].data.transform(Matrix.Translation((SLOT_X, y, 0)))
    # Ключ DDR5 в пазу
    parts.append(aabb('slot_key', SLOT_X + 2.2 * MM, SLOT_X + 3.6 * MM, y - 0.95 * MM, y + 0.95 * MM, 1.8 * MM, 4.2 * MM, [body_m]))
    for sx in (-1, 1):
        xe = SLOT_X + sx * (SLOT_LEN / 2 + 2.4 * MM)
        parts.append(aabb('latch_tower', xe - 2.4 * MM, xe + 2.4 * MM, y - SLOT_W / 2, y + SLOT_W / 2, 0, SLOT_H + 1.0 * MM, [body_m], bevel=0.3 * MM, seg=1))
        # Рычаг защёлки, закрыт, слегка выступает над башней
        parts.append(aabb('latch', xe - 1.6 * MM, xe + 1.6 * MM, y - 2.4 * MM, y + 2.4 * MM, SLOT_H + 1.0 * MM, SLOT_H + 4.2 * MM, [latch_m], bevel=0.4 * MM, seg=2))
    o = bl.join(parts, name)
    o.parent = parent
    return o


def heatsink(name, x0, x1, y0, y1, h, fin_axis, mat, parent, pitch=2.6 * MM, fin_t=0.8 * MM):
    base = aabb('hs_base', x0, x1, y0, y1, 0, 3.0 * MM, [mat], bevel=0.4 * MM, seg=1)
    fins = [base]
    if fin_axis == 'Y':  # рёбра вдоль Y, шаг по X
        n = int((x1 - x0) / pitch)
        for i in range(n + 1):
            x = x0 + i * (x1 - x0 - fin_t) / n
            fins.append(aabb('fin', x, x + fin_t, y0, y1, 3.0 * MM, h, [mat], bevel=0.15 * MM, seg=1))
    else:
        n = int((y1 - y0) / pitch)
        for i in range(n + 1):
            y = y0 + i * (y1 - y0 - fin_t) / n
            fins.append(aabb('fin', x0, x1, y, y + fin_t, 3.0 * MM, h, [mat], bevel=0.15 * MM, seg=1))
    o = bl.join(fins, name)
    o.parent = parent
    return o


def spring_screw(x, y, z, steel, spring_m):
    """Подпружиненный винт радиатора: головка с крестом, пружина, втулка."""
    parts = []
    head = bl.cylinder('ss_head', 3.2 * MM, 2.4 * MM, (x, y, z + 7.0 * MM), mats=[steel], verts=24, bevel=0.8 * MM, seg=3)
    parts.append(head)
    parts.append(bl.cylinder('ss_sleeve', 2.0 * MM, 7.0 * MM, (x, y, z), mats=[steel], verts=18, bevel=0.2 * MM, seg=1))
    coil = []
    for i in range(80):
        a = i / 80 * 2 * math.pi * 5
        coil.append((x + 2.9 * MM * math.cos(a), y + 2.9 * MM * math.sin(a), z + 0.6 * MM + i / 80 * 6.2 * MM))
    parts.append(sock.tube('ss_spring', coil, 0.35 * MM, spring_m, sides=6))
    return parts


def build():
    TEX.mkdir(parents=True, exist_ok=True)
    root = bl.empty('motherboard')

    save_set('board', tex_board())
    save_set('choke_top', tex_choke_top())
    save_set('cap_top', tex_cap_top())
    save_set('bmc', tex_ic(27, 27, [('ASPEED', 2.2), ('AST2600A3-GP', 1.6), ('2622 TW', 1.4)], seed=11))
    save_set('pstage', tex_ic(5, 6, [('TDA', 0.8), ('21590', 0.7)], seed=12, Wpx=128))
    save_set('ic_small', tex_ic(8, 8, [('I225', 0.9), ('2631', 0.8)], seed=13, Wpx=256))
    save_set('thread', tex_thread())

    board_m = pbr('board', 'board', coat=0.45, coat_roughness=0.12)
    edge = bl.solid('pcb_edge', bl.srgb('#26241b'), 0.0, 0.7)
    plastic = bl.solid('slot_plastic', bl.srgb('#141416'), 0.0, 0.45)
    latch_m = bl.solid('latch_plastic', bl.srgb('#1d1e21'), 0.0, 0.4)
    gold = bl.solid('gold_pins', bl.srgb('#d8b36a'), 1.0, 0.25)
    ferrite = bl.solid('choke_body', bl.srgb('#2a2b2e'), 0.2, 0.55)
    choke_top = pbr('choke_top', 'choke_top')
    cap_top = pbr('cap_top', 'cap_top')
    cap_side = bl.solid('cap_side', bl.srgb('#a88c5f'), 1.0, 0.35)
    cap_base = bl.solid('cap_base', bl.srgb('#141414'), 0.0, 0.6)
    pstage_m = pbr('pstage', 'pstage')
    mold_side = bl.solid('mold_side', bl.srgb('#141517'), 0.0, 0.7)
    hs_m = bl.solid('heatsink_black', bl.srgb('#141518'), 0.6, 0.4)
    steel = bl.solid('screw_steel', bl.srgb('#c3c6c9'), 1.0, 0.25)
    spring_m = bl.solid('spring_steel', bl.srgb('#b3b6b9'), 1.0, 0.3)
    thread_m = pbr('thread', 'thread')
    bmc_m = pbr('bmc', 'bmc')
    ic_m = pbr('ic_small', 'ic_small')
    nylon = bl.solid('connector_nylon', bl.srgb('#101012'), 0.0, 0.55)
    shell = bl.solid('connector_shell', bl.srgb('#b7babd'), 1.0, 0.3)
    ceramic = bl.solid('mlcc_body', bl.srgb('#6e5a44'), 0.0, 0.5)
    tin = bl.solid('mlcc_term', bl.srgb('#c4c1b8'), 1.0, 0.32)
    dark = bl.solid('hole_dark', (0.003, 0.003, 0.003), 0.0, 0.9)

    # ── Плата ──
    holes = [[(x + 1.7 * MM * math.cos(2 * math.pi * i / 20), y + 1.7 * MM * math.sin(2 * math.pi * i / 20)) for i in range(20)][::-1] for x, y in MOUNT_HOLES]
    board = bl.prism('board', bl.rrect(BW, BH, 3 * MM), -BT, 0, mats=[board_m, edge, edge], holes=holes, bevel=0.3 * MM, seg=1, parent=root)
    bl.uv_planar(board, (-BW / 2, -BH / 2, BW / 2, BH / 2))

    # ── Сокет ──
    socket = sock.build_socket(root, (SX, SY, 0))

    # ── Слоты DIMM и якоря ──
    slots = bl.empty('dimm_slots', root)
    for i, y in enumerate(slot_positions()):
        dimm_slot(f'dimm_slot_mesh_{i}', y, (plastic, latch_m, gold), slots)
        a = bl.empty(f'dimm_slot_{i}', root, (SLOT_X, y, SLOT_H))
    bl.join([o for o in slots.children], 'dimm_slot_meshes').parent = slots

    # ── VRM ──
    vrm = bl.empty('vrm', root)
    parts = []
    for x, y in chokes():
        parts.append(aabb('choke', x - 6.6 * MM, x + 6.6 * MM, y - 6.6 * MM, y + 6.6 * MM, 0, 7.4 * MM, [ferrite], bevel=0.5 * MM, seg=2))
        top = bl.prism('choke_top', bl.rrect(13.4 * MM, 13.4 * MM, 0.8 * MM), 7.4 * MM, 8.4 * MM, mats=[choke_top, choke_top, choke_top], bevel=0.35 * MM, seg=2)
        bl.uv_planar(top, (-6.7 * MM, -6.7 * MM, 6.7 * MM, 6.7 * MM))
        top.data.transform(Matrix.Translation((x, y, 0)))
        parts.append(top)
    for x, y in pstages():
        o = bl.prism('pstage', bl.rrect(5 * MM, 6 * MM, 0), 0, 1.0 * MM, mats=[pstage_m, pstage_m, mold_side], bevel=0.05 * MM, seg=1)
        bl.uv_planar(o, (-2.5 * MM, -3 * MM, 2.5 * MM, 3 * MM))
        o.data.transform(Matrix.Translation((x, y, 0)))
        parts.append(o)
    for x, y in polycaps():
        can = bl.cylinder('cap', 4.0 * MM, 7.6 * MM, (x, y, 0.6 * MM), mats=[cap_top, cap_base, cap_side], verts=28, bevel=0.5 * MM, seg=2)
        bl.uv_planar(can, (-4 * MM, -4 * MM, 4 * MM, 4 * MM))
        base = bl.cylinder('cap_base', 4.3 * MM, 0.8 * MM, (x, y, 0), mats=[cap_base], verts=28, bevel=0.1 * MM, seg=1)
        parts += [can, base]
    bl.join(parts, 'vrm_parts').parent = vrm

    # ── Радиаторы на пружинных винтах ──
    hs = bl.empty('heatsinks', root)
    heatsink('vrm_heatsink', 104 * MM, 150 * MM, -64 * MM, 64 * MM, 24 * MM, 'X', hs_m, hs)
    heatsink('io_heatsink', -150 * MM, -118 * MM, 18 * MM, 48 * MM, 16 * MM, 'Y', hs_m, hs)
    screws = []
    for x, y, z in ((110 * MM, 70 * MM, 0), (144 * MM, -70 * MM, 0), (-146 * MM, 54 * MM, 0), (-122 * MM, 12 * MM, 0)):
        screws += spring_screw(x, y, z, steel, spring_m)
    bl.join(screws, 'spring_screws').parent = hs

    # ── Шпильки под кулер процессора (резьбовые, как на mb.png) ──
    studs = []
    for dx in (-1, 1):
        for dy in (-1, 1):
            x, y = SX + dx * 71 * MM, SY + dy * 48 * MM
            st = bl.cylinder('stud', 2.4 * MM, 11 * MM, (x, y, 0), mats=[thread_m, steel, thread_m], verts=20, bevel=0.3 * MM, seg=1)
            _uv_cyl(st)
            nut = bl.cylinder('stud_base', 3.6 * MM, 2.0 * MM, (x, y, 0), mats=[steel], verts=6, bevel=0.2 * MM, seg=1)
            studs += [st, nut]
    bl.join(studs, 'standoffs').parent = root

    # ── Коннекторы: питание 8-pin, MCIO, PCIe x16 ──
    conn = bl.empty('connectors', root)
    cparts = []
    for x in (66 * MM, 98 * MM):
        cparts.append(aabb('pwr', x - 9.5 * MM, x + 9.5 * MM, 130 * MM, 141 * MM, 0, 12.5 * MM, [nylon], bevel=0.4 * MM, seg=1))
        for i in range(4):
            for j in range(2):
                px_, py_ = x - 6.3 * MM + i * 4.2 * MM, 133 * MM + j * 4.6 * MM
                cparts.append(aabb('pwr_hole', px_ - 1.7 * MM, px_ + 1.7 * MM, py_ - 1.7 * MM, py_ + 1.7 * MM, 12.5 * MM, 12.55 * MM, [dark]))
        cparts.append(aabb('pwr_latch', x - 2.5 * MM, x + 2.5 * MM, 141 * MM, 143.5 * MM, 6 * MM, 11 * MM, [nylon], bevel=0.3 * MM))
    for x, y in ((130 * MM, 132 * MM), (130 * MM, 112 * MM), (-142 * MM, -120 * MM), (-142 * MM, -100 * MM)):
        cparts.append(aabb('mcio', x - 14 * MM, x + 14 * MM, y - 5 * MM, y + 5 * MM, 0, 6.5 * MM, [nylon], bevel=0.3 * MM))
        cparts.append(aabb('mcio_shell', x - 13 * MM, x + 13 * MM, y - 3.2 * MM, y + 3.2 * MM, 6.5 * MM, 7.0 * MM, [shell], bevel=0.1 * MM))
        cparts.append(aabb('mcio_slot', x - 11 * MM, x + 11 * MM, y - 0.8 * MM, y + 0.8 * MM, 7.0 * MM, 7.05 * MM, [dark]))
    bl.join(cparts, 'connector_parts').parent = conn
    pcie = bl.empty('pcie_slot', root)
    pparts = []
    for x, y in PCIE:
        pparts.append(aabb('pcie_body', x - 44.5 * MM, x + 44.5 * MM, y - 3.75 * MM, y + 3.75 * MM, 0, 11.2 * MM, [plastic], bevel=0.3 * MM, seg=1))
        pparts.append(aabb('pcie_groove', x - 43 * MM, x + 43 * MM, y - 0.9 * MM, y + 0.9 * MM, 11.2 * MM, 11.25 * MM, [dark]))
        pparts.append(aabb('pcie_ret', x + 44.5 * MM, x + 50 * MM, y - 3.75 * MM, y + 3.75 * MM, 0, 9.5 * MM, [latch_m], bevel=0.3 * MM, seg=1))
    bl.join(pparts, 'pcie_slots').parent = pcie

    # ── BMC и мелкие микросхемы, пассивка ──
    bmc = bl.empty('bmc', root)
    b = bl.prism('bmc_chip', bl.rrect(27 * MM, 27 * MM, 0.5 * MM), 0, 2.2 * MM, mats=[bmc_m, bmc_m, mold_side], bevel=0.15 * MM, seg=1)
    bl.uv_planar(b, (-13.5 * MM, -13.5 * MM, 13.5 * MM, 13.5 * MM))
    b.data.transform(Matrix.Translation((-134 * MM, 80 * MM, 0)))
    b.parent = bmc
    small = []
    r = tex.rng(3)
    for x, y in ((-140 * MM, -60 * MM), (-120 * MM, -40 * MM), (-150 * MM, 110 * MM), (40 * MM, 120 * MM), (150 * MM, 95 * MM), (-110 * MM, 120 * MM), (70 * MM, -145 * MM)):
        o = bl.prism('ic', bl.rrect(8 * MM, 8 * MM, 0.3 * MM), 0, 1.0 * MM, mats=[ic_m, ic_m, mold_side], bevel=0.08 * MM, seg=1)
        bl.uv_planar(o, (-4 * MM, -4 * MM, 4 * MM, 4 * MM))
        o.data.transform(Matrix.Translation((x, y, 0)))
        small.append(o)
    # Пассивка россыпью вокруг микросхем и у краёв (как на mb.png)
    for cx, cy, n in ((-134, 80, 40), (-140, -60, 18), (-120, -40, 18), (40, 120, 16), (150, 95, 14), (-150, 110, 14), (70, -145, 12), (-60, -150, 20), (20, -150, 20)):
        for _ in range(n):
            ang = r.uniform(0, 2 * math.pi)
            rad = r.uniform(12, 22)
            x, y = (cx + rad * math.cos(ang)) * MM, (cy + rad * math.sin(ang)) * MM
            if abs(x) > BW / 2 - 5 * MM or abs(y) > BH / 2 - 5 * MM:
                continue
            l, w, h = (1.6, 0.8, 0.8) if r.random() < 0.4 else (1.0, 0.5, 0.5)
            t = l * 0.22
            rot = Matrix.Rotation(r.choice([0, math.pi / 2]), 4, 'Z')
            body = bl.box('pb', ((l - 2 * t) * MM, w * MM, h * MM), (0, 0, 0), mats=[ceramic])
            ends = [bl.box('pt', (t * MM, w * MM, h * MM), (s * (l / 2 - t / 2) * MM, 0, 0), mats=[tin]) for s in (-1, 1)]
            for p in [body] + ends:
                p.data.transform(Matrix.Translation((x, y, 0)) @ rot)
                small.append(p)
    bl.join(small, 'parts').parent = root

    save_set('ssd_label', tex_ssd_label())
    details(root, dict(
        shell=shell, dark=dark, nylon=nylon, gold=gold, ceramic=ceramic, tin=tin, mold_side=mold_side, ic_top=ic_m,
        led_g=bl.solid('led_green', bl.srgb('#1f7a2a'), 0.0, 0.2),
        led_a=bl.solid('led_amber', bl.srgb('#8a5a12'), 0.0, 0.2),
        usb_blue=bl.solid('usb_blue', bl.srgb('#1c4fb8'), 0.0, 0.45),
        vga_blue=bl.solid('vga_blue', bl.srgb('#23408f'), 0.0, 0.5),
        brass=bl.solid('brass', bl.srgb('#c9a45a'), 1.0, 0.3),
        ssd_pcb=bl.solid('ssd_pcb', bl.srgb('#0e1411'), 0.0, 0.3, coat=0.4, coat_roughness=0.15),
        ssd_label=pbr('ssd_label', 'ssd_label'),
        label_edge=bl.solid('label_edge', bl.srgb('#e8e8e4'), 0.0, 0.5),
        battery=bl.solid('battery', bl.srgb('#c8cbce'), 1.0, 0.22),
        fan_white=bl.solid('fan_header', bl.srgb('#e9e7df'), 0.0, 0.5),
        jumper=bl.solid('jumper', bl.srgb('#1d3f9a'), 0.0, 0.45),
    ))

    # ── AO верха платы ──
    ao = bl.bake_ao([(board, board_m)], 2048, TEX / 'board_ao.png', samples=128, distance=14 * MM)
    from PIL import Image

    c = np.asarray(Image.open(TEX / 'board_c.png'), np.float32) / 255
    orm_img = np.asarray(Image.open(TEX / 'board_orm.png'), np.float32) / 255
    h, w = c.shape[:2]
    a = np.clip(np.asarray(Image.fromarray(ao).resize((w, h), Image.BILINEAR), np.float32), 0, 1)
    orm_img[..., 0] = a
    tex.save(orm_img, TEX / 'board_orm.png')
    tex.save(c * (0.5 + 0.5 * a[..., None]), TEX / 'board_c.png')
    for img in bpy.data.images:
        if img.filepath and 'board_' in img.filepath:
            img.reload()
    return root


def tex_ssd_label(W=1024):
    """Наклейка SSD M.2 22110: логотип, модель, ёмкость, штрихкод."""
    lw, lh = 60.0, 20.0
    Hp = int(W * lh / lw)
    cv = tex.Canvas(W, Hp, 2)
    k = W / lw
    logo = tex.logo_mask('micron_logo', int(3.4 * k * 2))
    cv.paste_mask(logo, 2.5 * k, 2.0 * k, h=3.0 * k)
    cv.text(2.5 * k, 7.2 * k, '7500 PRO  3840GB', 'arialbd.ttf', 2.3 * k, 255)
    cv.text(2.5 * k, 10.4 * k, 'NVMe  PCIe Gen4  M.2 22110', 'arial.ttf', 1.6 * k, 255)
    cv.text(2.5 * k, 12.8 * k, 'MTFDKBG3T8TFR-1BC1ZABYY', 'arial.ttf', 1.4 * k, 255)
    tex.barcode(cv, 2.5 * k, 15.0 * k, 34 * k, 3.0 * k, seed=71)
    tex.datamatrix(cv, 47.0 * k, 5.5 * k, 9.0 * k, n=18, seed=72)
    ink = cv.array()
    n = tex.fbm(Hp, W, 5, 3, seed=73)
    base = np.ones((Hp, W, 3), np.float32) * np.array(tex.hex_rgb('#eeeeea'), np.float32) * (0.97 + 0.04 * n)[..., None]
    base = tex.mix_rgb(base, np.array(tex.hex_rgb('#151515'), np.float32), ink)
    rough = 0.45 + 0.08 * n
    normal = tex.normal_from_height(tex.blur(0.3 * n, 0.6), 0.5)
    return base, rough, np.zeros_like(rough), normal


def details(root, m):
    """Плотность как на mb.png: задний I/O, M.2 с SSD, батарейка, разъёмы, развязка вокруг сокета."""
    parts = []
    # ── Задний I/O у западного края (порты выступают за кромку платы на 2 мм) ──
    xe = -BW / 2 - 2.0 * MM
    for y in (-24 * MM, -2 * MM):
        parts.append(aabb('rj45', xe, xe + 21 * MM, y - 8.1 * MM, y + 8.1 * MM, 0, 13.6 * MM, [m['shell']], bevel=0.3 * MM, seg=1))
        parts.append(aabb('rj45_port', xe - 0.05 * MM, xe + 0.3 * MM, y - 5.9 * MM, y + 5.9 * MM, 1.6 * MM, 11.6 * MM, [m['dark']]))
        for dy, led in ((-5.2 * MM, m['led_g']), (5.2 * MM, m['led_a'])):
            parts.append(aabb('rj45_led', xe - 0.1 * MM, xe + 0.2 * MM, y + dy - 1.1 * MM, y + dy + 1.1 * MM, 11.9 * MM, 13.0 * MM, [led]))
    y = 20 * MM
    parts.append(aabb('usb', xe, xe + 17 * MM, y - 7.3 * MM, y + 7.3 * MM, 0, 15.6 * MM, [m['shell']], bevel=0.3 * MM, seg=1))
    for z in (2.2 * MM, 9.4 * MM):
        parts.append(aabb('usb_port', xe - 0.05 * MM, xe + 0.3 * MM, y - 6.1 * MM, y + 6.1 * MM, z, z + 5.4 * MM, [m['dark']]))
        parts.append(aabb('usb_tongue', xe + 0.1 * MM, xe + 0.5 * MM, y - 5.2 * MM, y + 5.2 * MM, z + 1.0 * MM, z + 2.9 * MM, [m['usb_blue']]))
    y = -50 * MM
    parts.append(aabb('vga', xe + 1.0 * MM, xe + 13 * MM, y - 15.5 * MM, y + 15.5 * MM, 0, 12.5 * MM, [m['vga_blue']], bevel=0.4 * MM, seg=1))
    parts.append(aabb('vga_shell', xe, xe + 1.0 * MM, y - 12 * MM, y + 12 * MM, 1.5 * MM, 11 * MM, [m['shell']], bevel=0.2 * MM))
    for dy in (-12.5 * MM, 12.5 * MM):
        c = bl.cylinder('vga_screw', 2.4 * MM, 3.5 * MM, (0, 0, 0), mats=[m['shell']], verts=6, bevel=0.2 * MM)
        c.data.transform(Matrix.Translation((xe - 2.5 * MM, y + dy, 6.2 * MM)) @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
        parts.append(c)

    # ── M.2 22110 с установленным SSD ──
    mx, my0 = -108 * MM, -18 * MM
    parts.append(aabb('m2_conn', mx - 11 * MM, mx + 11 * MM, my0 - 3 * MM, my0 + 3 * MM, 0, 4.2 * MM, [m['nylon']], bevel=0.2 * MM))
    ly = my0 - 110 * MM
    parts.append(bl.cylinder('m2_standoff', 2.4 * MM, 2.6 * MM, (mx, ly + 2 * MM, 0), mats=[m['brass']], verts=6, bevel=0.1 * MM))
    ssd = bl.prism('ssd_pcb', bl.rrect(22 * MM, 110 * MM, 0.4 * MM), 2.6 * MM, 3.4 * MM, mats=[m['ssd_pcb']], bevel=0.1 * MM)
    ssd.data.transform(Matrix.Translation((mx, my0 - 55 * MM, 0)))
    parts.append(ssd)
    for dy in (-22, -45, -70, -93):
        parts.append(aabb('nand', mx - 7 * MM, mx + 7 * MM, my0 + (dy - 8) * MM, my0 + (dy + 8) * MM, 3.4 * MM, 4.6 * MM, [m['ic_top'], m['ic_top'], m['mold_side']], bevel=0.1 * MM))
    lab = bl.prism('ssd_label', bl.rrect(20 * MM, 60 * MM, 0.8 * MM), 4.62 * MM, 4.7 * MM, mats=[m['ssd_label'], m['label_edge'], m['label_edge']])
    # Наклейка вдоль модуля: текст читается при взгляде с запада
    bl.uv_planar(lab, (-10 * MM, -30 * MM, 10 * MM, 30 * MM))
    uv = lab.data.uv_layers[0]
    for d in uv.data:
        u, v = d.uv
        d.uv = (1 - v, u)
    lab.data.transform(Matrix.Translation((mx, my0 - 58 * MM, 0)))
    parts.append(lab)

    # ── Батарейка CR2032 и перемычки ──
    parts.append(bl.cylinder('cr2032_holder', 11.5 * MM, 2.2 * MM, (-128 * MM, 124 * MM, 0), mats=[m['nylon']], verts=36, bevel=0.3 * MM, seg=1))
    parts.append(bl.cylinder('cr2032', 10.0 * MM, 3.2 * MM, (-128 * MM, 124 * MM, 0.6 * MM), mats=[m['battery']], verts=48, bevel=0.4 * MM, seg=2))
    for i, (x, y) in enumerate(((-110 * MM, 132 * MM), (-104 * MM, 132 * MM), (-98 * MM, 132 * MM))):
        parts += header(x, y, 1, 3, m, cap=(i != 1))

    # ── Штыревые разъёмы и вентиляторные разъёмы ──
    parts += header(-150 * MM, 140 * MM, 2, 10, m)
    parts += header(-150 * MM, 128 * MM, 2, 5, m)
    parts += header(-60 * MM, -150 * MM, 2, 7, m)
    for x, y in ((158 * MM, 100 * MM), (158 * MM, 86 * MM), (158 * MM, -86 * MM), (158 * MM, -100 * MM), (-40 * MM, 150 * MM), (30 * MM, -150 * MM)):
        vertical = abs(x) > 150 * MM
        w, d = (5.8 * MM, 10.2 * MM) if vertical else (10.2 * MM, 5.8 * MM)
        parts.append(aabb('fan_hdr', x - w / 2, x + w / 2, y - d / 2, y + d / 2, 0, 6.9 * MM, [m['fan_white']], bevel=0.3 * MM, seg=1))
        for k in range(4):
            px_, py_ = (x, y - 3.8 * MM + k * 2.54 * MM) if vertical else (x - 3.8 * MM + k * 2.54 * MM, y)
            parts.append(aabb('fan_pin', px_ - 0.32 * MM, px_ + 0.32 * MM, py_ - 0.32 * MM, py_ + 0.32 * MM, 3.0 * MM, 6.0 * MM, [m['gold']]))

    # ── Развязывающие конденсаторы вдоль рамки сокета ──
    fx, fy = sock.FRAME_OUT[0] / 2 + 2.4 * MM, sock.FRAME_OUT[1] / 2 + 2.0 * MM
    r = tex.rng(9)
    for k in range(34):
        y = SY - fy + 6 * MM + k * (2 * fy - 12 * MM) / 33
        for x in (SX - fx, SX - fx - 1.8 * MM):
            parts += mlcc(x, y, True, m)
    for k in range(22):
        x = SX - sock.FRAME_OUT[0] / 2 + 8 * MM + k * 5.2 * MM
        for yy in (SY + fy + 0.6 * MM, SY - fy - 0.6 * MM):
            if r.random() < 0.8:
                parts += mlcc(x, yy, False, m)
    o = bl.join(parts, 'details')
    o.parent = root
    return o


def header(x, y, rows, cols, m, cap=False):
    """Штыревой разъём 2,54 мм: пластиковое основание и позолоченные штыри; cap — джампер."""
    p = 2.54 * MM
    w, d = cols * p, rows * p
    out = [aabb('hdr_base', x - w / 2, x + w / 2, y - d / 2, y + d / 2, 0, 2.5 * MM, [m['nylon']], bevel=0.15 * MM)]
    for i in range(cols):
        for j in range(rows):
            px_, py_ = x - w / 2 + p / 2 + i * p, y - d / 2 + p / 2 + j * p
            out.append(aabb('hdr_pin', px_ - 0.32 * MM, px_ + 0.32 * MM, py_ - 0.32 * MM, py_ + 0.32 * MM, 2.5 * MM, 8.5 * MM, [m['gold']]))
    if cap:
        out.append(aabb('jumper', x - w / 2 + 0.2 * MM, x - w / 2 + 2 * p - 0.2 * MM, y - 1.2 * MM, y + 1.2 * MM, 2.6 * MM, 8.4 * MM, [m['jumper']], bevel=0.3 * MM, seg=1))
    return out


def mlcc(x, y, vertical, m, l=1.0 * MM, w=0.5 * MM, h=0.5 * MM):
    t = l * 0.22
    out = [bl.box('mb', (l - 2 * t, w * 0.96, h * 0.96), (0, 0, 0), mats=[m['ceramic']])]
    out += [bl.box('mt', (t, w, h), (s * (l / 2 - t / 2), 0, 0), mats=[m['tin']]) for s in (-1, 1)]
    rot = Matrix.Rotation(math.pi / 2 if vertical else 0, 4, 'Z')
    for o in out:
        o.data.transform(Matrix.Translation((x, y, 0)) @ rot)
    return out


def _uv_cyl(obj):
    """Цилиндрическая развёртка боковин: u — угол, v — высота."""
    me = obj.data
    uvl = me.uv_layers.get('UVMap') or me.uv_layers.new(name='UVMap')
    zs = [v.co.z for v in me.vertices]
    z0, z1 = min(zs), max(zs)
    for poly in me.polygons:
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            u = (math.atan2(co.y, co.x) / (2 * math.pi)) % 1.0
            uvl.data[li].uv = (u, (co.z - z0) / max(1e-9, z1 - z0))


PREVIEWS = {
    # Как на mb.png: высоко над платой, со стороны юго-запада
    'hero': dict(cam=(-0.26, -0.36, 0.34), target=(0.0, 0.0, 0.0), lens=40),
    'vrm': dict(cam=(0.02, -0.12, 0.12), target=(0.09, 0.0, 0.0), lens=45),
    'top': dict(cam=(0.0, -0.01, 0.62), target=(0, 0, 0), lens=40),
}
