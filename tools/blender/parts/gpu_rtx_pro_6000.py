"""
NVIDIA RTX PRO 6000 Blackwell Server Edition — пассивная FHFL-карта (266,7 × 111,15 мм, два слота).

Референс: references/components/NVIDIA RTX PRO 6000 Blackwell.png. Разбор ракурса по перспективе:
грань с рёбрами и графитовой полосой — верхняя кромка толщиной ~38 мм (длина к ней ≈ 7 : 1),
гладкая грань над ней — большая боковая панель. Рёбра — торцы пластин радиатора, видимые через
открытую кромку; полоса с логотипом NVIDIA — у открытого торца (забор воздуха), шильдик — у брекета.

Оси Blender: X — длина (брекет на −X, открытый торец на +X), Z — высота (контакты PCIe внизу),
лицевая панель (сторона кристалла) смотрит в −Y — в glTF это +Z, как у процедурной модели сайта.

Узлы: gpu → shroud (front_panel, band), backplate, heatsink (fins, vapor_chamber, pads), pcb,
gpu_package, gpu_die, vram (vram_0…15), vrm, pcie_edge, io_bracket, power.
"""
from __future__ import annotations

import math

import bpy
import numpy as np
from mathutils import Matrix

import bl
import dieshot
import tex
from bl import MM

NAME = 'gpu-rtx-pro-6000-se'
TEX = bl.BUILD / 'tex' / 'gpu'
ACCENT = '#76b900'

L = 266.7 * MM
XB, XE = -L / 2, L / 2  # брекет, открытый торец
Z0, Z1 = 11.0 * MM, 111.15 * MM  # низ и верх кожуха
Y0, Y1 = -19.0 * MM, 19.0 * MM
SK = 1.2 * MM
BAND_Y = 5.5 * MM  # графитовая полоса: y ∈ [BAND_Y, Y1]
BAND_T = 2.5 * MM
PCB_Y = (8.4 * MM, 10.0 * MM)
PCB_Z = (8.25 * MM, 108.0 * MM)
FIN = dict(x0=XB + 14 * MM, x1=XE - 12 * MM, pitch=1.42 * MM, t=0.45 * MM, y0=-17.6 * MM, y1=3.0 * MM)
VC_Y = (3.0 * MM, 6.0 * MM)
FIN_TOP_Z = 88.0 * MM  # выше — пластины доходят до полосы, ниже — испарительная камера
GPU_C = (-8.0 * MM, 60.0 * MM)  # центр корпуса GB202 (x, z)
PKG = 55.0 * MM
DIE_W, DIE_H = 24.4 * MM, 30.7 * MM
FINGERS_X = (XB + 42.4 * MM, XB + 42.4 * MM + 89.0 * MM)


def vram_layout() -> list[tuple[float, float, bool]]:
    """16 × GDDR7 вокруг GB202: 5 сверху, 5 снизу, по 3 слева и справа. (x, z, повернут)."""
    gx, gz = GPU_C
    out = [(gx + (i - 2) * 15 * MM, gz + 36.5 * MM, False) for i in range(5)]
    out += [(gx + (i - 2) * 15 * MM, gz - 36.5 * MM, False) for i in range(5)]
    out += [(gx - 37.5 * MM, gz + (i - 1) * 15 * MM, True) for i in range(3)]
    out += [(gx + 37.5 * MM, gz + (i - 1) * 15 * MM, True) for i in range(3)]
    return out


def chokes() -> list[tuple[float, float]]:
    right = [(x * MM, z * MM) for z in (44.0, 76.0) for x in (64, 76, 88, 100, 112)]
    left = [(x * MM, z * MM) for z in (44.0, 76.0) for x in (-120, -108, -96)]
    return right + left


# ── Размещение на стороне платы ──────────────────────────────────────────────

ROT_FRONT = Matrix.Rotation(math.pi / 2, 4, 'X')  # призма XY/+Z → (x, z) на плате, толщина в −Y


def on_front(obj, x, z, y_base):
    """Призма (в XY, толщина +Z) → на лицевую сторону: основание на y_base, толщина в −Y."""
    obj.data.transform(Matrix.Translation((x, y_base, z)) @ ROT_FRONT)
    obj.data.update()
    return obj


def slab(name, w, h, t, mats, x, z, y_base, bevel=0.0, seg=1, r=0.0, uv=True, parent=None):
    o = bl.prism(name, bl.rrect(w, h, r, seg=3), 0, t, mats=mats, bevel=bevel, seg=seg, parent=parent)
    if uv:
        bl.uv_planar(o, (-w / 2, -h / 2, w / 2, h / 2))
    return on_front(o, x, z, y_base)


def aabb(name, x0, x1, y0, y1, z0, z1, mats, bevel=0.0, seg=1, parent=None, r=0.0):
    """Параллелепипед по границам (в осях Blender)."""
    o = bl.prism(name, bl.rrect(x1 - x0, y1 - y0, r, seg=3), z0, z1, mats=mats, bevel=bevel, seg=seg, parent=parent)
    o.data.transform(Matrix.Translation(((x0 + x1) / 2, (y0 + y1) / 2, 0)))
    return o


def uv_box(obj, axis, bounds):
    bl.uv_planar(obj, bounds, axis=axis)


# ── Текстуры ─────────────────────────────────────────────────────────────────


def _mm(v):
    return v / MM


class Sheet:
    def __init__(self, w_px, h_px, bounds, ss=2):
        self.x0, self.y0, self.x1, self.y1 = bounds
        self.w, self.h = w_px, h_px
        self.kx = w_px / (self.x1 - self.x0)
        self.ky = h_px / (self.y1 - self.y0)
        self.cv = tex.Canvas(w_px, h_px, ss)

    def px(self, x, y):
        return (x - self.x0) * self.kx, (self.y1 - y) * self.ky

    def rect(self, cx, cy, w, h, fill=255, radius=0.0):
        a = self.px(cx - w / 2, cy + h / 2)
        b = self.px(cx + w / 2, cy - h / 2)
        self.cv.rect(a[0], a[1], b[0], b[1], fill, radius * self.kx)

    def circle(self, cx, cy, r, fill=255):
        x, y = self.px(cx, cy)
        self.cv.ellipse(x, y, r * self.kx, fill)

    def line(self, pts, width, fill=255):
        self.cv.line([self.px(x, y) for x, y in pts], width * self.kx, fill)

    def text(self, x, y, s, font, size, fill=255, anchor='la', tracking=0.0, stretch=1.0):
        px, py = self.px(x, y)
        self.cv.text(px, py, s, font, size * self.ky, fill, anchor, tracking, stretch)

    def array(self):
        return self.cv.array()


def tex_panel(W=2048, seed=1):
    """Анодированный алюминий цвета шампанского: продольная шлифовка, лёгкая неравномерность анодирования."""
    Hp = W // 2
    n_low = tex.fbm(Hp, W, 500, 3, seed=seed)
    from PIL import Image

    streak = np.asarray(Image.fromarray(tex.value_noise(Hp, max(8, W // 64), 1.0, seed=seed + 1)).resize((W, Hp), Image.BICUBIC), np.float32)
    grain = tex.value_noise(Hp, W, 1.2, seed=seed + 2)
    # Сатин после пескоструя и анодирования: блик широкий, часть отражения рассеянная — металличность < 1,
    # иначе в тёмном зале панель отражает только темноту и уходит в бронзу
    col = np.array(tex.hex_rgb('#cbc3b0'), np.float32)
    base = np.ones((Hp, W, 3), np.float32) * col * (0.97 + 0.04 * n_low + 0.01 * (streak - 0.5))[..., None]
    rough = 0.45 + 0.03 * n_low + 0.02 * (streak - 0.5) + 0.02 * (grain - 0.5)
    height = 0.2 * streak + 0.25 * grain
    normal = tex.normal_from_height(height, 0.5)
    # 0,35: анодированный сатин — в тёмном зале сайта цвет держится рассеянным светом ключа и заполнения
    return base, rough, np.full_like(rough, 0.35), normal


def tex_band(W=4096):
    """
    Графитовая кромка: логотип NVIDIA у открытого торца, шов и эмблема у брекета.
    Рисуем так, как кромку видно на фото (лицевая панель сверху, открытый торец слева):
    в этой системе x' = −x, y' = −y, затем поворачиваем текстуру на 180° в систему UV.
    """
    lx0, lx1 = -_mm(XE), -_mm(XB)
    ly0, ly1 = -_mm(Y1), -_mm(BAND_Y)
    Hp = int(W * (ly1 - ly0) / (lx1 - lx0))
    sh = Sheet(W, Hp, (lx0, ly0, lx1, ly1), ss=3)
    logo = tex.logo_mask('nvidia_logo_eye', int(7 * sh.ky * 3))
    lh = 6.4
    lw = lh * logo.width / logo.height
    x, y = sh.px(lx0 + 6.0, (ly0 + ly1) / 2 + lh / 2)
    sh.cv.paste_mask(logo, x, y, w=lw * sh.kx)
    ink = sh.array()
    em = Sheet(W, Hp, (lx0, ly0, lx1, ly1), ss=3)
    cx, cy = lx1 - 16.0, (ly0 + ly1) / 2
    em.rect(cx, cy, 16.0, 6.4, 255, radius=0.8)
    em.rect(cx, cy, 15.2, 5.6, 0, radius=0.6)
    em.text(cx, cy + 0.15, 'RTX PRO', 'bahnschrift.ttf', 2.4, 255, anchor='mm', tracking=0.12)
    emblem = em.array()
    seam = Sheet(W, Hp, (lx0, ly0, lx1, ly1), ss=3)
    seam.rect(lx1 - 30.0, cy, 0.35, ly1 - ly0, 255)
    sm = seam.array()
    ink, emblem, sm = (np.rot90(a, 2) for a in (ink, emblem, sm))

    n = tex.fbm(Hp, W, 40, 3, seed=5)
    grain = tex.value_noise(Hp, W, 1.0, seed=6)
    base = np.ones((Hp, W, 3), np.float32) * np.array(tex.hex_rgb('#2e2e2d'), np.float32) * (0.95 + 0.08 * n)[..., None]
    base = tex.mix_rgb(base, np.array(tex.hex_rgb('#e2e2e0'), np.float32), ink)
    base = tex.mix_rgb(base, np.array(tex.hex_rgb('#9a9a96'), np.float32), emblem * 0.9)
    base = tex.mix_rgb(base, np.array((0.02, 0.02, 0.02), np.float32), sm)
    rough = 0.46 + 0.06 * n + 0.04 * (grain - 0.5) + 0.06 * ink
    metal = 0.6 * (1 - ink) * (1 - emblem * 0.3)
    height = 0.25 * grain + 0.4 * ink - 1.5 * sm
    normal = tex.normal_from_height(tex.blur(height, 0.5), 0.8)
    return base, rough, metal, normal


def tex_pcb(W=2048):
    """Лицевая сторона платы: чёрная маска, площадки под GB202, GDDR7 и фазы питания, трассы, переходные."""
    lx0, lx1 = _mm(XB), _mm(XE)
    lz0, lz1 = 0.0, _mm(PCB_Z[1])
    Hp = int(W * (lz1 - lz0) / (lx1 - lx0))
    b = (lx0, lz0, lx1, lz1)
    r = tex.rng(12)
    base = np.ones((Hp, W, 3), np.float32) * np.array(tex.hex_rgb('#101312'), np.float32)
    base *= (0.9 + 0.2 * tex.fbm(Hp, W, 150, 4, seed=3))[..., None]
    tr = Sheet(W, Hp, b)
    gx, gz = _mm(GPU_C[0]), _mm(GPU_C[1])
    # Шины памяти: веером от корпуса к чипам GDDR7
    for vx, vz, rot in vram_layout():
        vx, vz = _mm(vx), _mm(vz)
        for k in range(10):
            off = (k - 4.5) * 0.9
            if rot:
                tr.line([(gx + (22 if vx > gx else -22), gz + off * 1.2), (vx, vz + off)], 0.18, 150)
            else:
                tr.line([(gx + off * 1.2, gz + (22 if vz > gz else -22)), (vx + off, vz)], 0.18, 150)
    # Линии PCIe к контактам
    for k in range(40):
        x = _mm(FINGERS_X[0]) + 3 + k * 2.1
        tr.line([(x, 8.5), (x, 14 + (k % 5)), (gx - 20 + k * 0.9, 30)], 0.16, 120)
    for _ in range(60):
        y = r.uniform(12, 104)
        x0 = r.uniform(-130, 60)
        tr.line([(x0, y), (x0 + r.uniform(10, 60), y)], 0.14, 100)
    traces = tex.blur(tr.array(), 0.7)
    cu = Sheet(W, Hp, b)
    # Контакты PCIe x16: 11 + 71 с ключом
    fx0 = _mm(FINGERS_X[0])
    xs = [fx0 + 0.5 + i * 1.0 for i in range(11)] + [fx0 + 11.65 + 1.9 + 0.5 + i * 1.0 for i in range(71)]
    for x in xs:
        cu.rect(x, 4.35, 0.7, 7.4, radius=0.15)
    for x, z in chokes():
        for s in (-1, 1):
            cu.rect(_mm(x) + s * 3.6, _mm(z), 2.6, 9.0)
    copper = cu.array()
    via = Sheet(W, Hp, b, ss=1)
    for _ in range(700):
        via.circle(r.uniform(-130, 130), r.uniform(12, 105), 0.2)
    vias = via.array()
    base = base * (1 + 0.5 * traces[..., None]) + 0.015 * vias[..., None]
    base = tex.mix_rgb(base, np.array(tex.hex_rgb('#e0b868'), np.float32), copper)
    rough = 0.32 + 0.06 * tex.fbm(Hp, W, 60, 3, seed=8) - 0.1 * copper
    height = 0.8 * traces + 0.5 * vias + 1.4 * copper
    normal = tex.normal_from_height(tex.blur(height, 0.7), 1.0)
    return base, rough, copper, normal


def tex_ic(w_mm, h_mm, lines, seed=0, Wpx=512, base_hex='#1b1c1e', ink_hex='#8c8d90'):
    Hpx = int(Wpx * h_mm / w_mm)
    sh = Sheet(Wpx, Hpx, (0, 0, w_mm, h_mm), ss=3)
    y = h_mm * 0.5 + 0.8 * (len(lines) - 1) / 2 + 0.4
    for s, size in lines:
        sh.text(w_mm / 2, y, s, 'OCRAEXT.TTF', size, 255, anchor='mm', tracking=0.05)
        y -= size * 1.6
    sh.circle(1.0, h_mm - 1.0, 0.4)
    mark = sh.array()
    n = tex.fbm(Hpx, Wpx, 30, 3, seed=seed)
    base = np.ones((Hpx, Wpx, 3), np.float32) * np.array(tex.hex_rgb(base_hex), np.float32) * (0.9 + 0.2 * n)[..., None]
    base = tex.mix_rgb(base, np.array(tex.hex_rgb(ink_hex), np.float32), mark * 0.85)
    rough = 0.6 + 0.1 * n + 0.1 * mark
    normal = tex.normal_from_height(tex.blur(-0.6 * mark, 0.5), 1.0)
    return base, rough, np.zeros_like(rough), normal


def tex_sticker(W=1200):
    """Наклейка на тыльной панели: модель, P/N, S/N, штрихкоды."""
    lw, lh = 60.0, 22.0
    Hp = int(W * lh / lw)
    sh = Sheet(W, Hp, (0, 0, lw, lh), ss=2)
    logo = tex.logo_mask('nvidia_logo_eye', int(4.0 * sh.ky * 2))
    x, y = sh.px(2.5, lh - 1.8)
    sh.cv.paste_mask(logo, x, y, h=3.4 * sh.ky)
    sh.text(2.5, lh - 7.3, 'RTX PRO 6000 Blackwell Server Edition', 'arialbd.ttf', 2.0, 255)
    sh.text(2.5, lh - 10.0, '96GB GDDR7  PCIe 5.0 x16  600W', 'arial.ttf', 1.7, 255)
    sh.text(2.5, lh - 12.6, 'P/N 900-2G153-0000-000   S/N 1325025014382', 'arial.ttf', 1.45, 255)
    tex.barcode(sh.cv, *sh.px(2.5, lh - 13.8), 36 * sh.kx, 3.2 * sh.ky, seed=41)
    tex.barcode(sh.cv, *sh.px(2.5, lh - 17.8), 30 * sh.kx, 2.6 * sh.ky, seed=42)
    tex.datamatrix(sh.cv, *sh.px(47.0, lh - 8.0), 10.0 * sh.kx, n=20, seed=43)
    sh.text(52.0, 2.0, 'MADE IN TAIWAN', 'arialbd.ttf', 1.3, 255, anchor='ms')
    ink = sh.array()
    n = tex.fbm(Hp, W, 5, 3, seed=44)
    base = np.ones((Hp, W, 3), np.float32) * np.array(tex.hex_rgb('#efefec'), np.float32) * (0.97 + 0.04 * n)[..., None]
    base = tex.mix_rgb(base, np.array(tex.hex_rgb('#151515'), np.float32), ink)
    rough = 0.42 + 0.08 * n
    normal = tex.normal_from_height(tex.blur(0.3 * n, 0.6), 0.5)
    return base, rough, np.zeros_like(rough), normal


def tex_dp(W=256):
    """Торец DisplayPort: металлический кожух, тёмная полость, язычок с контактами."""
    w_mm, h_mm = 16.6, 6.0
    Hp = int(W * h_mm / w_mm)
    sh = Sheet(W, Hp, (0, 0, w_mm, h_mm), ss=4)
    # Полость со скошенным углом
    pts = [(0.5, 0.5), (16.1, 0.5), (16.1, 5.5), (2.2, 5.5), (0.5, 3.8)]
    sh.cv.poly([sh.px(x, y) for x, y in pts], 255)
    cavity = sh.array()
    tg = Sheet(W, Hp, (0, 0, w_mm, h_mm), ss=4)
    tg.rect(8.3, 2.3, 12.6, 1.3)
    tongue = tg.array()
    pins = Sheet(W, Hp, (0, 0, w_mm, h_mm), ss=4)
    for k in range(10):
        pins.rect(2.9 + k * 1.2, 2.3, 0.5, 1.1)
    pin = pins.array()
    base = np.ones((Hp, W, 3), np.float32) * np.array(tex.hex_rgb('#c2c4c6'), np.float32)
    base = tex.mix_rgb(base, np.array((0.015, 0.015, 0.016), np.float32), cavity)
    base = tex.mix_rgb(base, np.array((0.05, 0.05, 0.055), np.float32), tongue)
    base = tex.mix_rgb(base, np.array(tex.hex_rgb('#d8b060'), np.float32), pin)
    metal = (1 - cavity) + pin
    rough = 0.3 + 0.5 * cavity * (1 - pin)
    height = -2.0 * cavity + 0.8 * tongue
    normal = tex.normal_from_height(tex.blur(height, 0.8), 2.0)
    return base, rough, np.clip(metal, 0, 1), normal


def save_set(name, parts):
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


# ── Сборка ───────────────────────────────────────────────────────────────────


def build():
    TEX.mkdir(parents=True, exist_ok=True)
    root = bl.empty('gpu')

    save_set('panel', tex_panel())
    save_set('panel_back', tex_panel(seed=7))
    save_set('band', tex_band())
    save_set('pcb', tex_pcb())
    save_set('vram', tex_ic(14.0, 12.0, [('SEC 609', 1.1), ('K4VCF325ZC-SC28', 1.0), ('XRA6392F', 0.9)], seed=21))
    save_set('pstage', tex_ic(5.0, 6.0, [('55B', 0.8)], seed=22, Wpx=128))
    save_set('sticker', tex_sticker())
    save_set('dp', tex_dp())
    tex.save(dieshot.gb202(1024, int(1024 * DIE_H / DIE_W)), TEX / 'gb202.png')

    champagne = pbr('champagne', 'panel')
    champagne_b = pbr('champagne_back', 'panel_back')
    band_m = pbr('graphite_band', 'band')
    graphite = bl.solid('graphite', bl.srgb('#2e2e2d'), 0.6, 0.46)
    fin_m = bl.solid('fin', bl.srgb('#c9c0ad'), 1.0, 0.3)  # AO допишем после запекания
    vc = bl.solid('vapor_chamber', bl.srgb('#cbc5ba'), 1.0, 0.28)
    copper_edge = bl.solid('copper', bl.srgb('#c88452'), 1.0, 0.35)
    pads = bl.solid('thermal_pad', bl.srgb('#8f959b'), 0.0, 0.85)
    pcb_m = pbr('pcb', 'pcb')
    pcb_edge = bl.solid('pcb_edge', bl.srgb('#27261c'), 0.0, 0.7)
    gold = bl.solid('gold', bl.srgb('#e0b868'), 1.0, 0.22)
    substrate = bl.solid('gpu_substrate', bl.srgb('#27342f'), 0.0, 0.35, coat=0.4, coat_roughness=0.2)
    stiffener = bl.solid('stiffener', bl.srgb('#b9bdc1'), 1.0, 0.33)
    die_img = bl.load_image(TEX / 'gb202.png')
    die_m = bl.material('gb202', base_tex=die_img, emission_tex=die_img, emission_strength=1.0, metallic=0.0, roughness=0.22, specular=0.35)
    die_m['glow'] = True
    die_edge = bl.solid('die_edge', bl.srgb('#3a3f47'), 0.5, 0.3)
    vram_m = pbr('vram', 'vram', emission_color=bl.srgb(ACCENT), emission_strength=1.0)
    vram_m['glow'] = True
    mold_side = bl.solid('mold_side', bl.srgb('#141517'), 0.0, 0.7)
    ferrite = bl.solid('choke', bl.srgb('#3d3e41'), 0.35, 0.5)
    pstage_m = pbr('pstage', 'pstage')
    plastic = bl.solid('connector', bl.srgb('#0d0d0e'), 0.0, 0.6)
    ceramic = bl.solid('mlcc_body', bl.srgb('#6e5a44'), 0.0, 0.5)
    tin = bl.solid('mlcc_term', bl.srgb('#c4c1b8'), 1.0, 0.32)
    polycap = bl.solid('polycap', bl.srgb('#141416'), 0.0, 0.45)
    steel = bl.solid('bracket_steel', bl.srgb('#c7cacc'), 1.0, 0.34)
    dp_face = pbr('dp_face', 'dp')
    dp_shell = bl.solid('dp_shell', bl.srgb('#c2c4c6'), 1.0, 0.3)
    sticker_m = pbr('sticker', 'sticker')
    sticker_edge = bl.solid('sticker_edge', bl.srgb('#e8e8e4'), 0.0, 0.5)

    # ── Кожух: лицевая панель и графитовая кромка улетают вверх и вперёд ──
    shroud = bl.rig(bl.empty('shroud', root), explode=(0, -67 * MM, 115 * MM), explodeRange=[0.0, 0.55])
    front = aabb('front_panel', XB, XE, Y0, Y0 + SK, Z0, Z1, [champagne, champagne, champagne], bevel=0.5 * MM, seg=2, parent=shroud)
    bl.uv_planar(front, (XB, Z0, XE, Z1), axis='Y')
    band = aabb('band', XB, XE, BAND_Y, Y1, Z1 - BAND_T, Z1, [band_m, graphite, graphite], bevel=0.6 * MM, seg=2, parent=shroud)
    bl.uv_planar(band, (XB, BAND_Y, XE, Y1), only_mat=0)
    # Нижняя крышка под радиатором
    bottom = aabb('bottom_cover', XB, XE, Y0, PCB_Y[0] - 0.8 * MM, Z0, Z0 + SK, [champagne], bevel=0.3 * MM, seg=1, parent=shroud)
    bl.uv_planar(bottom, (XB, Y0, XE, Y1))

    # ── Тыльная панель ──
    back = bl.empty('backplate', root)
    bp = aabb('back_panel', XB, XE, Y1 - SK, Y1, Z0, Z1 - BAND_T, [champagne_b, champagne_b, champagne_b], bevel=0.5 * MM, seg=2, parent=back)
    bl.uv_planar(bp, (XB, Z0, XE, Z1), axis='Y')
    bb = aabb('back_bottom', XB, XE, PCB_Y[1] + 0.8 * MM, Y1, Z0, Z0 + SK, [champagne_b], bevel=0.3 * MM, seg=1, parent=back)
    bl.uv_planar(bb, (XB, Y0, XE, Y1))
    st = bl.prism('sticker', bl.rrect(60 * MM, 22 * MM, 1.5 * MM), 0, 0.08 * MM, mats=[sticker_m, sticker_edge, sticker_edge], parent=back)
    bl.uv_planar(st, (-30 * MM, -11 * MM, 30 * MM, 11 * MM))
    # Лицом в +Y; локальная X → мировая −X, чтобы текст читался при взгляде сзади
    st.data.transform(Matrix.Translation((XB + 48 * MM, Y1, 33 * MM)) @ Matrix(((-1, 0, 0, 0), (0, 0, 1, 0), (0, 1, 0, 0), (0, 0, 0, 1))))

    # ── Радиатор: пластины поперёк длины, испарительная камера, термопрокладки ──
    heat = bl.rig(bl.empty('heatsink', root), explode=(0, -30 * MM, 75 * MM), explodeRange=[0.15, 0.7])
    n_fins = int((FIN['x1'] - FIN['x0']) / FIN['pitch'])
    fin_z0, fin_z1 = Z0 + 1.6 * MM, Z1 - 0.5 * MM
    # Пластина Г-образная: над компонентами платы (z > FIN_TOP_Z) доходит до графитовой полосы
    fin_y1 = BAND_Y - 0.15 * MM
    proto = bl.join([
        aabb('fin_a', -FIN['t'] / 2, FIN['t'] / 2, FIN['y0'], FIN['y1'], fin_z0, fin_z1, [fin_m]),
        aabb('fin_b', -FIN['t'] / 2, FIN['t'] / 2, FIN['y1'] - 0.05 * MM, fin_y1, FIN_TOP_Z, fin_z1, [fin_m]),
    ], 'fin')
    bl.uv_planar(proto, (FIN['y0'], fin_z0, fin_y1, fin_z1), axis='X')
    fins = [bl.instance_grid(proto, [(FIN['x0'] + i * FIN['pitch'], 0, 0)], f'fin_{i}') for i in range(n_fins)]
    bl.remove(proto)
    vcham = aabb('vapor_chamber', XB + 50 * MM, XB + 190 * MM, VC_Y[0], VC_Y[1], Z0 + 4 * MM, FIN_TOP_Z - 1.0 * MM, [vc, vc, copper_edge], bevel=0.6 * MM, seg=2, parent=heat)
    pad_parts = []
    for x, z, rot in vram_layout():
        w, h = (12.4 * MM, 14.4 * MM) if rot else (14.4 * MM, 12.4 * MM)
        pad_parts.append(slab('pad', w, h, 1.0 * MM, [pads], x, z, VC_Y[1] + 1.1 * MM, uv=False))
    bl.join(pad_parts, 'thermal_pads').parent = heat

    # ── Плата ──
    pcb_outline = _pcb_outline()
    pcb = bl.prism('pcb', pcb_outline, -(PCB_Y[1] - PCB_Y[0]) / 2, (PCB_Y[1] - PCB_Y[0]) / 2, mats=[pcb_m, pcb_m, pcb_edge], bevel=0.1 * MM, seg=1, parent=root)
    pcb.data.transform(Matrix.Translation((0, sum(PCB_Y) / 2, 0)) @ ROT_FRONT)
    me = pcb.data
    uvl = me.uv_layers.new(name='UVMap')
    for poly in me.polygons:
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            uvl.data[li].uv = ((co.x - XB) / L, co.z / PCB_Z[1])
    # Контакты PCIe — отдельный узел для хотспота (геометрия — в текстуре платы)
    bl.empty('pcie_edge', root, (sum(FINGERS_X) / 2, sum(PCB_Y) / 2, 4.2 * MM))

    # ── GB202 ──
    gx, gz = GPU_C
    pkg = bl.empty('gpu_package', root)
    slab('gpu_substrate', PKG, PKG, 1.4 * MM, [substrate, substrate, pcb_edge], gx, gz, PCB_Y[0], bevel=0.15 * MM, uv=False).parent = pkg
    ring = bl.prism('stiffener', bl.rrect(46 * MM, 50 * MM, 2 * MM), 0, 0.7 * MM, mats=[stiffener], holes=[bl.rrect(DIE_W + 5 * MM, DIE_H + 5 * MM, 1.2 * MM)], bevel=0.12 * MM, seg=1)
    on_front(ring, gx, gz, PCB_Y[0] - 1.4 * MM).parent = pkg
    caps = []
    for k in range(18):
        for s in (-1, 1):
            t = (k - 8.5) * 2.4 * MM
            for (cx, cz, vert) in ((gx + t, gz + s * 26.4 * MM, False), (gx + s * 24.4 * MM, gz + t, True)):
                caps += _mlcc_on(cx, cz, PCB_Y[0] - 1.4 * MM, 1.0 * MM, 0.5 * MM, 0.5 * MM, vert, ceramic, tin)
    bl.join(caps, 'gpu_caps').parent = pkg
    die = slab('gpu_die', DIE_W, DIE_H, 1.0 * MM, [die_m, die_m, die_edge], gx, gz, PCB_Y[0] - 1.4 * MM, bevel=0.05 * MM, parent=root)
    bl.rig(die, glow='die', glowMax=3)

    # ── GDDR7 ──
    vram = bl.rig(bl.empty('vram', root), glow='vram', glowMax=2.5)
    for i, (x, z, rot) in enumerate(vram_layout()):
        w, h = (12.0 * MM, 14.0 * MM) if rot else (14.0 * MM, 12.0 * MM)
        o = slab(f'vram_{i}', w, h, 1.3 * MM, [vram_m, vram_m, mold_side], x, z, PCB_Y[0], bevel=0.1 * MM, seg=2, parent=vram)
        if rot:
            _rotate_uv(o)

    # ── Питание: дроссели, силовые каскады, полимерные конденсаторы, разъём 12V-2x6 ──
    vrm = bl.empty('vrm', root)
    parts = []
    for x, z in chokes():
        parts.append(slab('choke', 10.4 * MM, 10.4 * MM, 5.0 * MM, [ferrite], x, z, PCB_Y[0], bevel=0.4 * MM, seg=2, uv=False))
        parts.append(slab('pstage', 5.0 * MM, 6.0 * MM, 0.9 * MM, [pstage_m, pstage_m, mold_side], x, z - 9.0 * MM, PCB_Y[0], bevel=0.05 * MM))
    for k in range(8):
        parts.append(slab('polycap', 7.3 * MM, 4.3 * MM, 1.9 * MM, [polycap], (62 + k * 7.6) * MM, 60 * MM, PCB_Y[0], bevel=0.2 * MM, uv=False))
    bl.join(parts, 'vrm_parts').parent = vrm
    power = bl.empty('power', root)
    conn = aabb('power_connector', XE - 12 * MM, XE - 1.5 * MM, 0.8 * MM, PCB_Y[0], 86 * MM, 100 * MM, [plastic], bevel=0.4 * MM, seg=1, parent=power)
    hole = bl.solid('hole', (0.004, 0.004, 0.004), 0.0, 0.9)
    for k in range(6):
        for j in range(2):
            aabb('pin_hole', XE - 1.6 * MM, XE - 1.45 * MM, 1.6 * MM + j * 3.2 * MM, 3.9 * MM + j * 3.2 * MM, (87.2 + k * 2.1) * MM, (88.9 + k * 2.1) * MM, [hole], parent=power)

    # ── Брекет с вентиляцией и четырьмя DisplayPort ──
    io = bl.empty('io_bracket', root)
    br = _bracket(steel)
    br.parent = io
    for k in range(4):
        z = (18 + k * 17) * MM
        yc = PCB_Y[0] - 3.2 * MM
        shell = aabb('dp_shell', XB - 0.2 * MM, XB + 9.5 * MM, yc - 3.0 * MM, yc + 3.0 * MM, z - 8.3 * MM, z + 8.3 * MM, [dp_shell], bevel=0.2 * MM, seg=1, parent=io)
        face = aabb('dp_face', XB - 0.35 * MM, XB - 0.2 * MM, yc - 3.0 * MM, yc + 3.0 * MM, z - 8.3 * MM, z + 8.3 * MM, [dp_face], parent=io)
        _uv_face_x(face, yc - 3.0 * MM, yc + 3.0 * MM, z - 8.3 * MM, z + 8.3 * MM)

    # ── AO: пластины радиатора (одна средняя в окружении соседей) и плата ──
    mid = fins[n_fins // 2]
    ao = bl.bake_ao([(mid, fin_m)], 512, TEX / 'fin_ao.png', samples=128, distance=12 * MM)
    fin_base = np.ones(ao.shape + (3,), np.float32) * np.array(tex.hex_rgb('#c9c0ad'), np.float32)
    tex.save(fin_base * (0.25 + 0.75 * ao[..., None]), TEX / 'fin_c.png')
    tex.save(tex.orm(ao, 0.3, 1.0, ao.shape), TEX / 'fin_orm.png')
    _swap_to_textured(fin_m, TEX / 'fin_c.png', TEX / 'fin_orm.png')
    fins_obj = bl.join(fins, 'fins')
    fins_obj.parent = heat

    for o in (shroud, heat, back):
        for c in [o] + list(o.children_recursive):
            c.hide_render = True
    ao = bl.bake_ao([(pcb, pcb_m)], 2048, TEX / 'pcb_ao.png', samples=96, distance=6 * MM)
    for o in (shroud, heat, back):
        for c in [o] + list(o.children_recursive):
            c.hide_render = False
    from PIL import Image

    c = np.asarray(Image.open(TEX / 'pcb_c.png'), np.float32) / 255
    orm_img = np.asarray(Image.open(TEX / 'pcb_orm.png'), np.float32) / 255
    h, w = c.shape[:2]
    a = np.clip(np.asarray(Image.fromarray(ao).resize((w, h), Image.BILINEAR), np.float32), 0, 1)
    orm_img[..., 0] = a
    tex.save(orm_img, TEX / 'pcb_orm.png')
    tex.save(c * (0.55 + 0.45 * a[..., None]), TEX / 'pcb_c.png')
    for img in bpy.data.images:
        if img.filepath and ('pcb_' in img.filepath):
            img.reload()
    return root


def _pcb_outline():
    """Плата: основной прямоугольник и язычок PCIe x16 с ключом между 11-м и 12-м контактами."""
    x0, x1 = XB + 0.8 * MM, XE - 3.0 * MM
    zb, zt = PCB_Z
    f0, f1 = FINGERS_X
    k0, k1 = f0 + 11.65 * MM, f0 + 11.65 * MM + 1.9 * MM
    c = 0.8 * MM
    return [
        (x0, zb),
        (f0 - 0.5 * MM, zb),
        (f0, zb - 0.5 * MM),
        (f0, c),
        (f0 + c, 0),
        (k0, 0),
        (k0, 5.9 * MM),
        (k1, 5.9 * MM),
        (k1, 0),
        (f1 - c, 0),
        (f1, c),
        (f1, zb - 0.5 * MM),
        (f1 + 0.5 * MM, zb),
        (x1, zb),
        (x1, zt),
        (x0, zt),
    ]


def _bracket(mat):
    """Полноразмерный брекет двухслотовой карты: пластина с прорезями, верхняя полка с пазом под винт."""
    yb0, yb1 = -20.0 * MM, 20.0 * MM
    zb0, zb1 = 4.0 * MM, 112.0 * MM
    slots = []
    for k in range(7):
        z = (84 + k * 3.8) * MM
        for y0, y1 in ((-16 * MM, -1.5 * MM), (1.5 * MM, 16 * MM)):
            slots.append([(y0, z), (y1, z), (y1, z + 2.2 * MM), (y0, z + 2.2 * MM)][::-1])
    # Окна под DisplayPort
    yc = PCB_Y[0] - 3.2 * MM
    for k in range(4):
        z = (18 + k * 17) * MM
        slots.append([(yc - 3.1 * MM, z - 8.4 * MM), (yc + 3.1 * MM, z - 8.4 * MM), (yc + 3.1 * MM, z + 8.4 * MM), (yc - 3.1 * MM, z + 8.4 * MM)][::-1])
    outline = [(yb0, zb0), (yb1, zb0), (yb1, zb1), (yb0, zb1)]
    plate = bl.prism('bracket_plate', outline, -0.9 * MM, 0, mats=[mat], holes=slots, bevel=0.15 * MM, seg=1)
    # Призма в (y, z) толщиной по X: (x, y, z)_prism → (z, x, y)_мир
    m = Matrix(((0, 0, 1, 0), (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
    plate.data.transform(Matrix.Translation((XB, 0, 0)) @ m)
    tab = aabb('bracket_tab', XB - 11.4 * MM, XB, yb0, yb1, zb1 - 0.9 * MM, zb1, [mat], bevel=0.15 * MM, seg=1)
    tongue = aabb('bracket_tongue', XB - 0.9 * MM, XB, -4.0 * MM, 4.0 * MM, -6.0 * MM, zb0, [mat], bevel=0.15 * MM, seg=1)
    return bl.join([plate, tab, tongue], 'bracket')


def _mlcc_on(x, z, y_base, l, w, h, vertical, body_mat, term_mat):
    t = l * 0.22
    parts = [bl.box('mb', (l - 2 * t + 0.02 * MM, w * 0.96, h * 0.96), (0, 0, 0), mats=[body_mat])]
    for s in (-1, 1):
        parts.append(bl.box('mt', (t, w, h), (s * (l / 2 - t / 2), 0, 0), mats=[term_mat]))
    for p in parts:
        if vertical:
            p.data.transform(Matrix.Rotation(math.pi / 2, 4, 'Z'))
        on_front(p, x, z, y_base)
    return parts


def _rotate_uv(obj):
    uv = obj.data.uv_layers[0]
    for d in uv.data:
        u, v = d.uv
        d.uv = (v, 1 - u)


def _uv_face(obj, x0, x1, z0, z1, flip_u=False):
    me = obj.data
    uvl = me.uv_layers.get('UVMap') or me.uv_layers.new(name='UVMap')
    for poly in me.polygons:
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            u = (co.x - x0) / (x1 - x0)
            uvl.data[li].uv = (1 - u if flip_u else u, (co.z - z0) / (z1 - z0))


def _uv_face_x(obj, y0, y1, z0, z1):
    """Торец, смотрящий в −X: при взгляде снаружи +Y — справа, поэтому u = (y1 − y) / …"""
    me = obj.data
    uvl = me.uv_layers.get('UVMap') or me.uv_layers.new(name='UVMap')
    for poly in me.polygons:
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            uvl.data[li].uv = ((co.z - z0) / (z1 - z0), (y1 - co.y) / (y1 - y0))


def _swap_to_textured(mat, color_path, orm_path):
    """Однотонный материал → текстурный (после запекания AO), с сохранением имени."""
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = bl.load_image(color_path)
    nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
    o = nt.nodes.new('ShaderNodeTexImage')
    o.image = bl.load_image(orm_path, color=False)
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(o.outputs['Color'], sep.inputs['Color'])
    nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
    nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    grp = nt.nodes.new('ShaderNodeGroup')
    grp.node_tree = bl._gltf_output_group()
    nt.links.new(sep.outputs['Red'], grp.inputs['Occlusion'])


PREVIEWS = {
    # Ракурс референса: взгляд на верхнюю кромку, лицевая панель — вверху кадра, открытый торец — слева
    'ref': dict(cam=(0.2, -0.045, 0.43), target=(0.0, 0.0, 0.1), lens=50, up=(0, -1, 0)),
    'hero': dict(cam=(0.26, -0.34, 0.22), target=(0.0, 0.0, 0.058), lens=45),
    'openend': dict(cam=(0.3, -0.12, 0.16), target=(0.12, 0.0, 0.06), lens=50),
    'bracket': dict(cam=(-0.3, -0.16, 0.14), target=(-0.13, 0.0, 0.055), lens=50),
    # Ракурс вьюера сайта (glTF 2,1 / 0,9 / 3,4 при длине 2 ед. = 266,7 мм)
    'exploded': dict(cam=(0.3, -0.48, 0.2), target=(0.0, -0.02, 0.1), lens=36, explode=1.0, glow=1.0),
    'topdetail': dict(cam=(0.16, -0.06, 0.2), target=(0.07, 0.0, 0.111), lens=60),
}
