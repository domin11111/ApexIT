"""
Процессоры AMD EPYC — общий построитель корпуса; варианты — в cpu_sp7.py (Venice) и cpu_sp5.py (Turin).

Референсы: references/components/cpu2.png (Venice без крышки: 4 + 4 CCD, два I/O-кристалла, медные
полосы между рядами, чёрный компаунд, два ряда MLCC по периметру, золотой треугольник первого вывода)
и mb.png (никелированная крышка с лок-апом «AMD / EPYC»).

Ось X — ширина, Y — длина (верх cpu2.png = +Y), Z — вверх; верх подложки — z = 0.
Узлы (контракт rig.ts): <root> → substrate, caps, contacts, lsc, dies (ccd_N, iod_N, bridges, mold), ihs.
ccd_N — слева направо, сверху вниз: сцена «Чиплеты» подсвечивает их по порядку.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Callable

import numpy as np
from PIL import Image

import bl
import dieshot
import tex
from bl import MM

Die = tuple[float, float, float, float, bool, bool]  # x, y, w, h (м), поворот на 180°, зеркально


@dataclass(frozen=True)
class Variant:
    name: str  # имя GLB
    root: str  # корневой узел
    socket: str
    model: str  # маркировка модели на крышке
    opn: str
    pkg: tuple[float, float]  # подложка, м
    lid: tuple[float, float]
    lid_wall: float
    substrate: str  # цвет паяльной маски
    substrate_edge: str
    ccds: list[Die]
    iods: list[Die]
    ccd_cores: tuple[int, int]  # сетка ядер на снимке CCD: колонки × ряды
    mold: tuple[float, float] | None  # чёрный компаунд вокруг кристаллов (Venice) или underfill под каждым (Turin)
    bridges: bool
    caps: Callable[[], list[tuple[float, float, float]]]
    lsc_grid: tuple[int, int]  # конденсаторы на обратной стороне в центральной нише
    pads_margin: float = 2.5  # мм от края до поля контактов
    lsc_cavity: tuple[float, float] = (16.4, 31.2)  # мм
    iod_rot90: bool = False  # снимок I/O повёрнут на 90° (вертикальный кристалл)
    tex_dir: str = 'cpu'
    extras: dict = field(default_factory=dict)


PKG_T = 2.0 * MM
LID_T, LID_SKIRT = 4.3 * MM, 1.7 * MM
DIE_T = 0.78 * MM


class Sheet:
    """Холст текстуры в миллиметрах: bounds — (x0, y0, x1, y1) в мм, верх картинки = y1."""

    def __init__(self, bounds, w, h, ss=2):
        self.x0, self.y0, self.x1, self.y1 = bounds
        self.w, self.h = w, h
        self.kx = w / (self.x1 - self.x0)
        self.ky = h / (self.y1 - self.y0)
        self.cv = tex.Canvas(w, h, ss)

    def px(self, x, y):
        return (x - self.x0) * self.kx, (self.y1 - y) * self.ky

    def rect(self, cx, cy, w, h, fill=255, radius=0.0):
        x0, y0 = self.px(cx - w / 2, cy + h / 2)
        x1, y1 = self.px(cx + w / 2, cy - h / 2)
        self.cv.rect(x0, y0, x1, y1, fill, radius * self.kx)

    def circle(self, cx, cy, r, fill=255):
        x, y = self.px(cx, cy)
        self.cv.ellipse(x, y, r * self.kx, fill)

    def poly(self, pts, fill=255):
        self.cv.poly([self.px(x, y) for x, y in pts], fill)

    def text(self, x, y, s, font, size_mm, fill=255, anchor='la', tracking=0.0, stretch=1.0):
        px, py = self.px(x, y)
        self.cv.text(px, py, s, font, size_mm * self.ky, fill, anchor, tracking, stretch)

    def array(self):
        return self.cv.array()


def _mm(v):
    return v / MM


def perimeter_caps(half_x: float, half_y: float, span_x: float, span_y: float, gap: float = 1.9, pitch: float = 1.7):
    """Два ряда MLCC по периметру комплекса кристаллов (все размеры в мм): (x, y, поворот) в метрах."""
    caps = []
    n = int(span_x / pitch)
    for y in (half_y, half_y + gap):
        for sgn in (1, -1):
            for i in range(n):
                caps.append(((i - (n - 1) / 2) * pitch * MM, sgn * y * MM, 0.0))
    m = int(span_y / pitch)
    for x in (half_x, half_x + gap * 1.6):
        for sgn in (1, -1):
            for i in range(m):
                caps.append((sgn * x * MM, (i - (m - 1) / 2) * pitch * MM, math.pi / 2))
    return caps


def lsc_positions(v: Variant) -> list[tuple[float, float, float]]:
    cols, rows = v.lsc_grid
    return [((c - (cols - 1) / 2) * 2.1 * MM, (r - (rows - 1) / 2) * 1.85 * MM, 0.0) for c in range(cols) for r in range(rows)]


# ── Текстуры ─────────────────────────────────────────────────────────────────


def tex_substrate_top(v: Variant, size=2048):
    """Верх подложки: паяльная маска, медные полигоны под ней, площадки MLCC, поле бампов под кристаллами."""
    pw, ph = _mm(v.pkg[0]), _mm(v.pkg[1])
    b = (-pw / 2, -ph / 2, pw / 2, ph / 2)
    h = size
    w = int(size * pw / ph)
    base = np.ones((h, w, 3), np.float32) * np.array(tex.hex_rgb(v.substrate), np.float32)
    base *= (0.92 + 0.16 * tex.fbm(h, w, 180, 4, seed=3))[..., None]

    # Медные полигоны под маской: крупные плоскости питания чуть светлее и выпуклее
    copper = Sheet(b, w, h)
    for sx in (-1, 1):
        copper.rect(sx * (pw / 2 - 5.5), 0, 6.0, ph * 0.75, 110, radius=1.5)
    for sy in (-1, 1):
        copper.rect(0, sy * (ph / 2 - 6), pw * 0.72, 5.0, 110, radius=1.5)
    cu = tex.blur(copper.array(), 3.0)
    base = base * (1 + 0.04 * cu[..., None])

    # Поле C4-бампов под каждым кристаллом: открывается, когда кристаллы поднимаются
    bumps = Sheet(b, w, h, ss=1)
    for x, y, dw, dh, *_ in v.ccds + v.iods:
        for yy in np.arange(_mm(y - dh / 2) + 0.5, _mm(y + dh / 2) - 0.5, 0.62):
            for xx in np.arange(_mm(x - dw / 2) + 0.5, _mm(x + dw / 2) - 0.5, 0.62):
                bumps.circle(xx, yy, 0.2)
    bump = bumps.array()

    # Металл: площадки MLCC, треугольник первого вывода, реперы
    metal = Sheet(b, w, h)
    for x, y, rot in v.caps():
        cw, ch = (1.25, 0.62) if rot == 0 else (0.62, 1.25)
        for s in (-1, 1):
            ox, oy = (s * 0.42, 0) if rot == 0 else (0, s * 0.42)
            metal.rect(_mm(x) + ox, _mm(y) + oy, cw * 0.36 if rot == 0 else cw, ch if rot == 0 else ch * 0.36)
    metal.poly([(-pw / 2 + 0.8, ph / 2 - 0.8), (-pw / 2 + 4.2, ph / 2 - 0.8), (-pw / 2 + 0.8, ph / 2 - 4.2)])
    metal.circle(pw / 2 - 2.8, -ph / 2 + 2.8, 0.7)
    metal.rect(-pw / 2 + 2.4, -ph / 2 + 2.6, 1.0, 1.0)
    mk = metal.array()
    base = tex.mix_rgb(base, np.array(tex.hex_rgb('#d8b36a'), np.float32), mk)
    base = tex.mix_rgb(base, np.array(tex.hex_rgb('#b8bcbf'), np.float32), bump * 0.9)

    # Лазерная маркировка на подложке у края (светлая, едва заметная)
    mark = Sheet(b, w, h)
    mark.text(-pw / 2 + 14, -ph / 2 + 3.4, '9KT2615D00118  LOT 5B  ASSY MY', 'OCRAEXT.TTF', 1.05, 255, tracking=0.05)
    tex.datamatrix(mark.cv, *mark.px(pw / 2 - 10.5, -ph / 2 + 8.6), 4.2 * mark.kx, n=14, seed=21)
    mk2 = mark.array()
    base = tex.mix_rgb(base, np.array((0.6, 0.72, 0.7), np.float32), mk2 * 0.22)

    rough = 0.34 + 0.08 * tex.fbm(h, w, 60, 3, seed=5) - 0.12 * mk - 0.1 * bump
    metal_ch = np.clip(mk + bump, 0, 1)
    height = 0.6 * cu + 1.2 * mk + 1.0 * bump - 0.5 * mk2
    normal = tex.normal_from_height(tex.blur(height, 0.8), 1.4)
    return base, rough, metal_ch, normal


def tex_substrate_bottom(v: Variant, size=2048):
    """Контактные площадки LGA: шаг 0,94 мм, четыре квадранта, ниша под конденсаторы в центре."""
    pw, ph = _mm(v.pkg[0]), _mm(v.pkg[1])
    b = (-pw / 2, -ph / 2, pw / 2, ph / 2)
    h = size
    w = int(size * pw / ph)
    sh = Sheet(b, w, h, ss=1)
    pitch = 0.94
    nx = int((pw - 2 * v.pads_margin) / pitch)
    ny = int((ph - 2 * v.pads_margin) / pitch)
    cw, ch = v.lsc_cavity
    for j in range(ny):
        y = (j - (ny - 1) / 2) * pitch
        for i in range(nx):
            x = (i - (nx - 1) / 2) * pitch
            if abs(x) < cw / 2 and abs(y) < ch / 2:
                continue  # ниша LSC
            if abs(x) < 0.6 or abs(y) < 0.6:
                continue  # разделение на квадранты
            sh.circle(x, y, 0.3)
    pads = sh.array()
    base = np.ones((h, w, 3), np.float32) * np.array(tex.hex_rgb(v.substrate), np.float32) * 0.8
    base *= (0.94 + 0.12 * tex.fbm(h, w, 160, 3, seed=9))[..., None]
    gold = np.array(tex.hex_rgb('#e0bc72'), np.float32)
    base = tex.mix_rgb(base, gold, pads)
    lsc = Sheet(b, w, h)
    for x, y, _ in lsc_positions(v):
        for s in (-1, 1):
            lsc.rect(_mm(x) + s * 0.42, _mm(y), 0.36, 0.62)
    lk = lsc.array()
    base = tex.mix_rgb(base, gold, lk)
    tri = Sheet(b, w, h)
    tri.poly([(pw / 2 - 0.8, ph / 2 - 0.8), (pw / 2 - 4.2, ph / 2 - 0.8), (pw / 2 - 0.8, ph / 2 - 4.2)])  # снизу первый вывод справа
    tri.text(0, -ph / 2 + 1.4, f'AMD  {v.socket}  {v.opn}  E0', 'OCRAEXT.TTF', 1.1, 255, anchor='mm', tracking=0.08)
    tk = tri.array()
    base = tex.mix_rgb(base, np.array((0.62, 0.78, 0.74), np.float32), tk * 0.6)
    metal = np.clip(pads + lk, 0, 1)
    rough = 0.4 + 0.08 * tex.fbm(h, w, 50, 3, seed=4) - 0.18 * metal
    normal = tex.normal_from_height(-0.8 * pads, 1.0)
    return base, rough, metal, normal


def tex_ihs(v: Variant, size=2048):
    """Никелированная крышка: сатиновая шлифовка, лазерная маркировка лок-апа AMD EPYC и служебных строк."""
    lw, lh = _mm(v.lid[0]), _mm(v.lid[1])
    half = max(lw, lh) / 2
    b = (-half, -half, half, half)
    sh = Sheet(b, size, size)
    k = lw / 80.0  # раскладка маркировки подогнана под крышку Venice шириной 80 мм
    lock = tex.logo_mask('amd_epyc_lockup', int(15 * sh.ky))
    logo_w = 31.0 * k
    x0, y0 = sh.px(-logo_w / 2 - 1.5 * k, 13.5 * k)
    sh.cv.paste_mask(lock, x0, y0, w=logo_w * sh.kx)
    lines = [(v.model, 2.3), (v.opn, 2.0), ('2S1 2634PGU', 2.0), ('DIFFUSED IN TAIWAN', 1.6), ('MADE IN MALAYSIA', 1.6)]
    y = -18.5 * k
    for s, size_mm in lines:
        sh.text(-31.5 * k, y, s, 'OCRAEXT.TTF', size_mm * max(0.85, k), 255, anchor='ls', tracking=0.04)
        y -= size_mm * max(0.85, k) * 1.55
    tex.datamatrix(sh.cv, *sh.px(24.0 * k, -19.5 * k), 6.5 * k * sh.kx, n=16, seed=7)
    sh.poly([(-lw / 2 + 1.8, lh / 2 - 1.8), (-lw / 2 + 5.4, lh / 2 - 1.8), (-lw / 2 + 1.8, lh / 2 - 5.4)])
    mark = sh.array()

    n = size
    grain = tex.value_noise(n, n, 1.5, seed=11)
    # Шлифовка: шум, вытянутый вдоль X
    streak = np.asarray(Image.fromarray(tex.value_noise(n, n // 16, 1.2, seed=12)).resize((n, n), Image.BICUBIC), np.float32)
    low = tex.fbm(n, n, 400, 3, seed=13)
    base = np.ones((n, n, 3), np.float32) * np.array(tex.hex_rgb('#d6d8d9'), np.float32)
    base *= (0.975 + 0.03 * low + 0.015 * (streak - 0.5))[..., None]
    base = tex.mix_rgb(base, np.array(tex.hex_rgb('#1f2022'), np.float32), mark)
    rough = 0.3 + 0.03 * low + 0.03 * (streak - 0.5) + 0.02 * (grain - 0.5) + 0.28 * mark
    metal = 1.0 - 0.75 * mark
    height = 0.35 * streak + 0.1 * grain - 0.6 * mark
    normal = tex.normal_from_height(tex.blur(height, 0.6), 0.9)
    return base, rough, metal, normal


# ── Сборка ───────────────────────────────────────────────────────────────────


def build(v: Variant):
    TEX = bl.BUILD / 'tex' / v.tex_dir
    TEX.mkdir(parents=True, exist_ok=True)
    root = bl.empty(v.root)
    pkg_w, pkg_h = v.pkg
    lid_w, lid_h = v.lid
    scale = pkg_w / (88 * MM)  # разлёт подогнан под Venice

    mold = bl.solid('cpu_mold', bl.srgb('#0b0c0e'), 0.0, 0.22, coat=0.6, coat_roughness=0.08)
    underfill = bl.solid('underfill', bl.srgb('#1a1a17'), 0.0, 0.35)
    ceramic = bl.solid('mlcc_body', bl.srgb('#3d2c1f'), 0.0, 0.5)
    tin = bl.solid('mlcc_term', bl.srgb('#b9a98c'), 1.0, 0.35)
    edge = bl.solid('substrate_edge', bl.srgb(v.substrate_edge), 0.0, 0.5)

    # Текстуры подложки (AO допишем после запекания)
    top_base, top_rough, top_metal, top_nrm = tex_substrate_top(v)
    tex.save(top_nrm, TEX / 'substrate_top_n.png')
    tex.save(top_base, TEX / 'substrate_top_c.png')
    tex.save(tex.orm(1.0, top_rough, top_metal, top_base.shape[:2]), TEX / 'substrate_top_orm.png')
    bot_base, bot_rough, bot_metal, bot_nrm = tex_substrate_bottom(v)
    tex.save(bot_base, TEX / 'substrate_bottom_c.png')
    tex.save(tex.orm(1.0, bot_rough, bot_metal, bot_base.shape[:2]), TEX / 'substrate_bottom_orm.png')
    tex.save(bot_nrm, TEX / 'substrate_bottom_n.png')

    def pbr(name, stem, **kw):
        return bl.material(
            name,
            base_tex=bl.load_image(TEX / f'{stem}_c.png'),
            orm_tex=bl.load_image(TEX / f'{stem}_orm.png', color=False),
            normal_tex=bl.load_image(TEX / f'{stem}_n.png', color=False),
            metallic=1.0,
            roughness=1.0,
            **kw,
        )

    sub_top = pbr('substrate_top', 'substrate_top')
    sub_bot = pbr('substrate_bottom', 'substrate_bottom')

    # ── Подложка ──
    substrate = bl.prism('substrate', bl.rrect(pkg_w, pkg_h, 1.2 * MM), -PKG_T, 0, mats=[sub_top, sub_bot, edge], bevel=0.18 * MM, seg=2, parent=root)
    bounds = (-pkg_w / 2, -pkg_h / 2, pkg_w / 2, pkg_h / 2)
    bl.uv_planar(substrate, bounds, only_mat=0)
    bl.uv_planar(substrate, bounds, only_mat=1, flip_u=True)
    bl.uv_planar(substrate, bounds, only_mat=2)
    bl.empty('contacts', root, (0, 0, -PKG_T))

    # ── MLCC по периметру и на обратной стороне ──
    proto = _mlcc('mlcc_proto', 1.0 * MM, 0.5 * MM, 0.5 * MM, ceramic, tin)
    caps = v.caps()
    bl.instance_grid(proto, [(x, y, 0) for x, y, _ in caps], 'caps', [r for *_, r in caps], parent=root)
    lsc_proto = _mlcc('lsc_proto', 1.0 * MM, 0.5 * MM, 0.5 * MM, ceramic, tin, flip=True)
    lscs = lsc_positions(v)
    bl.instance_grid(lsc_proto, [(x, y, -PKG_T) for x, y, _ in lscs], 'lsc', [r for *_, r in lscs], parent=root)
    bl.remove(proto)
    bl.remove(lsc_proto)

    # ── Кристаллы ──
    ccd_w, ccd_h = v.ccds[0][2], v.ccds[0][3]
    iod_w, iod_h = v.iods[0][2], v.iods[0][3]
    if v.iod_rot90:
        iod_w, iod_h = iod_h, iod_w
    ccd_img = tex.save(dieshot.ccd(1024, int(1024 * ccd_h / ccd_w), cores=v.ccd_cores), TEX / 'ccd.png')
    iod_img = tex.save(dieshot.iod(1536, int(1536 * iod_h / iod_w)), TEX / 'iod.png')

    def die_mat(name, img):
        i = bl.load_image(img)
        m = bl.material(name, base_tex=i, emission_tex=i, emission_strength=1.0, metallic=0.0, roughness=0.26, specular=0.3)
        m['glow'] = True
        return m

    ccd_mat, iod_mat = die_mat('ccd', ccd_img), die_mat('iod', iod_img)
    si_edge = bl.solid('die_edge', bl.srgb('#3b4046'), 0.4, 0.3)

    dies = bl.rig(bl.empty('dies', root), explode=(0, 0, 6.2 * MM * scale), explodeRange=[0.45, 1.0])
    if v.mold:
        bl.prism('mold', bl.rrect(v.mold[0], v.mold[1], 2.4 * MM), 0, DIE_T - 0.03 * MM, mats=[mold], bevel=0.25 * MM, seg=3, parent=dies)
    else:
        # Без компаунда: у каждого кристалла тонкий бортик underfill
        fills = [bl.box('uf', (w + 0.8 * MM, h + 0.8 * MM, 0.12 * MM), (x, y, 0), mats=[underfill], bevel=0.1 * MM, seg=2, r=0.3 * MM) for x, y, w, h, *_ in v.ccds + v.iods]
        bl.join(fills, 'underfill').parent = dies
    lift = 0.0 if v.mold else 0.08 * MM
    for i, (x, y, w, h, rot, mirror) in enumerate(v.ccds):
        o = bl.box(f'ccd_{i}', (w, h, DIE_T), (x, y, lift), mats=[ccd_mat, ccd_mat, si_edge], bevel=0.04 * MM, seg=1, parent=dies)
        _uv_die(o, w, h, rot, mirror)
        bl.rig(o, glow=f'ccd.{i}', glowMax=4)
    for i, (x, y, w, h, rot, mirror) in enumerate(v.iods):
        o = bl.box(f'iod_{i}', (w, h, DIE_T), (x, y, lift), mats=[iod_mat, iod_mat, si_edge], bevel=0.04 * MM, seg=1, parent=dies)
        _uv_die(o, w, h, rot, mirror, rot90=v.iod_rot90)
        bl.rig(o, glow=f'iod.{i}', glowMax=3)
    if v.bridges:
        br_h = 1.9 * MM
        br_img = tex.save(dieshot.bridge(1024, int(1024 * br_h / ccd_w)), TEX / 'bridge.png')
        br_mat = bl.material('bridge', base_tex=bl.load_image(br_img), metallic=0.35, roughness=0.3)
        bridges = []
        for x, y, w, h, rot, _ in v.ccds:
            by = y - (h / 2 + 0.2 * MM + br_h / 2) * (1 if not rot else -1)
            o = bl.box('bridge', (w, br_h, DIE_T - 0.01 * MM), (x, by, 0), mats=[br_mat, br_mat, si_edge], bevel=0.03 * MM, seg=1)
            _uv_die(o, w, br_h, rot)
            bridges.append(o)
        bl.join(bridges, 'bridges').parent = dies

    # ── Крышка ──
    ihs_parts = tex_ihs(v)
    tex.save(ihs_parts[0], TEX / 'ihs_c.png')
    tex.save(tex.orm(1.0, ihs_parts[1], ihs_parts[2], ihs_parts[0].shape[:2]), TEX / 'ihs_orm.png')
    tex.save(ihs_parts[3], TEX / 'ihs_n.png')
    ihs_mat = pbr('ihs', 'ihs')
    ihs_under = bl.solid('ihs_inner', bl.srgb('#b58a5a'), 1.0, 0.45)  # медь под никелем изнутри
    ihs = bl.rig(bl.empty('ihs', root), explode=(55 * MM * scale, 4.4 * MM * scale, 41.8 * MM * scale), explodeRange=[0.0, 0.7])
    r = 4.0 * MM * scale
    plate = bl.prism('ihs_plate', bl.rrect(lid_w, lid_h, r), LID_SKIRT, LID_T, mats=[ihs_mat, ihs_under, ihs_mat], bevel=0.9 * MM, bevel_bottom=0.0, seg=4)
    skirt = bl.prism(
        'ihs_skirt',
        bl.rrect(lid_w, lid_h, r),
        0.0,
        LID_SKIRT,
        mats=[ihs_mat, ihs_mat, ihs_mat],
        holes=[bl.rrect(lid_w - 2 * v.lid_wall, lid_h - 2 * v.lid_wall, 1.5 * MM)],
        bevel=0.0,
        bevel_bottom=0.25 * MM,
        seg=2,
    )
    half = max(lid_w, lid_h) / 2
    for o in (plate, skirt):
        bl.uv_planar(o, (-half, -half, half, half))
    bl.join([plate, skirt], 'ihs_body').parent = ihs

    # ── AO верха подложки (крышка не участвует: под ней AO сделало бы подложку грязной в разобранном виде) ──
    for o in [ihs] + list(ihs.children):
        o.hide_render = True
    ao = bl.bake_ao([(substrate, sub_top)], 2048, TEX / 'substrate_top_ao.png', samples=128, distance=3 * MM)
    for o in [ihs] + list(ihs.children):
        o.hide_render = False
    h, w = top_base.shape[:2]
    ao = np.clip(np.asarray(Image.fromarray(ao).resize((w, h), Image.BILINEAR), np.float32), 0, 1)
    tex.save(tex.orm(ao, top_rough, top_metal, (h, w)), TEX / 'substrate_top_orm.png')
    tex.save(top_base * (0.55 + 0.45 * ao[..., None]), TEX / 'substrate_top_c.png')
    import bpy

    for img in bpy.data.images:
        if img.filepath and any(img.filepath.endswith(n) for n in ('substrate_top_orm.png', 'substrate_top_c.png')):
            img.reload()
    return root


def _uv_die(obj, w, h, rotated: bool, mirror: bool = False, rot90: bool = False):
    bl.uv_planar(obj, (-w / 2, -h / 2, w / 2, h / 2))
    uv = obj.data.uv_layers[0]
    for d in uv.data:
        u, vv = d.uv
        if rot90:
            u, vv = vv, 1 - u
        if rotated:
            u, vv = 1 - u, 1 - vv
        elif mirror:
            u = 1 - u
        d.uv = (u, vv)


def _mlcc(name, length, width, height, body_mat, term_mat, flip=False):
    """MLCC: керамический корпус и две лужёные торцевые обкладки."""
    t = length * 0.22
    z0 = -height if flip else 0.0
    body = bl.box(name + '_b', (length - 2 * t + 0.02 * MM, width * 0.96, height * 0.96), (0, 0, z0 + height * 0.02), mats=[body_mat])
    parts = [body]
    for s in (-1, 1):
        parts.append(bl.box(name + f'_t{s}', (t, width, height), (s * (length / 2 - t / 2), 0, z0), mats=[term_mat], bevel=0.05 * MM, seg=1))
    return bl.join(parts, name)


def previews(scale: float = 1.0) -> dict:
    s = scale
    return {
        # Как в mb.png: три четверти сверху
        'hero': dict(cam=(0.13 * s, -0.16 * s, 0.15 * s), target=(0, 0, 0.0), lens=70),
        # Как в cpu2.png: без крышки, почти сверху
        'delid': dict(cam=(0.0, -0.05 * s, 0.26 * s), target=(0, 0, 0), lens=85, hide=['ihs'], panels=False, light=1.4),
        'bottom': dict(cam=(0.08 * s, -0.12 * s, -0.16 * s), target=(0, 0, 0), lens=70, panels=False, env=1.4, light=0.0),
        'exploded': dict(cam=(0.2 * s, -0.24 * s, 0.2 * s), target=(0.02 * s, 0, 0.02 * s), lens=55, explode=1.0),
    }
