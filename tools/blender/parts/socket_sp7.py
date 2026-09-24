"""
Сокет SP7 (LGA) с механизмом SRM — по references/components/sp7_sp8.png.

Пропорции по фото: поле контактов ≈ 2/3 ширины силовой рамки. Контакты — бронзовые «купола» пружин
с шагом 0,94 мм, поле разделено на четыре квадранта рёбрами корпуса, в центре — окно под конденсаторы
обратной стороны процессора (видны конденсаторы на плате). Вокруг: корпус из LCP, стальная
направляющая рамка (rail frame) с шарниром и пружинными проволоками у южного края, силовая рамка
(force frame) с винтами Torx по углам, чёрная планка фиксатора у северного края.

Оси: плата в плоскости XY, верх платы — z = 0; длинная сторона сокета — вдоль Y (север = +Y).
Узлы: socket → housing, contacts_field, rail_frame, force_frame, screws, lever, lsc_board.
Standalone-модель добавляет участок платы под сокетом (pcb_patch).
"""
from __future__ import annotations

import math

import bpy
import numpy as np
from mathutils import Matrix, Vector

import bl
import tex
from bl import MM

NAME = 'socket-sp7'
TEX = bl.BUILD / 'tex' / 'socket'

FIELD_W, FIELD_H = 86.0 * MM, 92.0 * MM
HOUSING_W, HOUSING_H = 96.0 * MM, 104.0 * MM
FLOOR_Z, RIM_Z = 2.4 * MM, 3.4 * MM
CAVITY_W, CAVITY_H = 17.0 * MM, 32.0 * MM
FRAME_OUT = (128.0 * MM, 150.0 * MM)
FRAME_IN = (114.0 * MM, 130.0 * MM)
FRAME_Z = 3.8 * MM
SCREWS = [(sx * 59.5 * MM, sy * 69.0 * MM) for sx in (-1, 1) for sy in (-1, 1)]
FOOTPRINT = FRAME_OUT
SEAT_Z = FLOOR_Z + 0.5 * MM  # низ подложки процессора на сжатых контактах


# ── Текстуры ─────────────────────────────────────────────────────────────────


def tex_field(size=3072):
    """
    Верх корпуса: поле контактов (купола пружин), рёбра квадрантов, ободок окна под конденсаторы.
    Покрывает весь корпус HOUSING_W × HOUSING_H.
    """
    k = size / (HOUSING_H / MM)  # пикселей на мм
    W = int(round(HOUSING_W / MM * k))
    H = size
    pitch_px = 0.94 * k
    # Тайл купола
    tp = int(round(pitch_px))
    yy, xx = np.mgrid[0:tp, 0:tp].astype(np.float32) - (tp - 1) / 2
    rr = np.sqrt(xx**2 + yy**2) / (0.27 * k)
    dome = np.sqrt(np.clip(1 - rr**2, 0, 1))
    hole = np.sqrt(xx**2 + yy**2) < 0.36 * k  # круглые гнёзда вокруг куполов, почти незаметные
    reps = (H // tp + 2, W // tp + 2)
    domes = np.tile(dome, reps)[:H, :W]
    holes = np.tile(hole.astype(np.float32), reps)[:H, :W]
    # Маска поля: внутри FIELD, вне рёбер квадрантов и окна
    ys = (np.arange(H, dtype=np.float32)[:, None] + 0.5) / k - HOUSING_H / MM / 2
    xs = (np.arange(W, dtype=np.float32)[None, :] + 0.5) / k - HOUSING_W / MM / 2
    in_field = (abs(xs) < FIELD_W / MM / 2) & (abs(ys) < FIELD_H / MM / 2)
    rib = (abs(xs) < 0.75) | (abs(ys) < 0.75)
    cavity_rim = (abs(xs) < CAVITY_W / MM / 2 + 1.3) & (abs(ys) < CAVITY_H / MM / 2 + 1.3)
    field = (in_field & ~rib & ~cavity_rim).astype(np.float32)
    rim_mask = (cavity_rim | (rib & in_field)).astype(np.float32)

    dome_m = domes * field
    hole_m = holes * field
    n = tex.fbm(H, W, 60, 3, seed=31)
    base = np.ones((H, W, 3), np.float32) * np.array(tex.hex_rgb('#1d1e20'), np.float32) * (0.92 + 0.16 * n)[..., None]
    base = tex.mix_rgb(base, np.array((0.03, 0.03, 0.032), np.float32), hole_m * 0.5)
    bronze = np.array(tex.hex_rgb('#7a5c38'), np.float32)
    base = tex.mix_rgb(base, bronze, np.clip(dome_m * 1.1, 0, 1))
    base = tex.mix_rgb(base, np.array(tex.hex_rgb('#3a4250'), np.float32), rim_mask)
    metal = np.clip(dome_m * 1.5, 0, 1)
    # Купола — шероховатая бронза: иначе издалека поле зеркалит свет и выглядит светлым пятном
    rough = 0.55 - 0.12 * metal + 0.05 * n - 0.1 * rim_mask
    height = 1.6 * dome_m - 0.25 * hole_m + 0.8 * rim_mask
    normal = tex.normal_from_height(tex.blur(height, 0.6), 2.2)
    # AO контактов: впадины между куполами темнее
    ao = np.clip(1 - 0.35 * hole_m * (1 - dome_m), 0, 1)
    return base, rough, metal, normal, ao


def tex_torx(size=256):
    """Головка винта Torx: шестилучевой шлиц, риски от затяжки."""
    c = (size - 1) / 2
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32) - c
    r = np.sqrt(xx**2 + yy**2) / c
    a = np.arctan2(yy, xx)
    star = 0.42 + 0.1 * np.cos(6 * a)
    recess = (r < star).astype(np.float32)
    recess = tex.blur(recess, 1.0)
    head = (r < 0.98).astype(np.float32)
    base = np.ones((size, size, 3), np.float32) * np.array(tex.hex_rgb('#8f9296'), np.float32)
    base = tex.mix_rgb(base, np.array((0.03, 0.03, 0.035), np.float32), recess)
    rough = 0.3 + 0.4 * recess
    height = -2.5 * recess + 0.3 * (1 - r) * head
    normal = tex.normal_from_height(tex.blur(height, 1.0), 6.0)
    return base, rough, np.clip(1 - recess, 0, 1), normal


def tex_steel(size=1024, hexc='#6b6e72', seed=0, brushed=True):
    """Сталь с пескоструем/шлифовкой: цвет с лёгкой неравномерностью, шероховатость, мелкий рельеф."""
    from PIL import Image

    n = tex.fbm(size, size, 200, 3, seed=seed)
    if brushed:
        st = np.asarray(Image.fromarray(tex.value_noise(size, size // 32, 1.0, seed=seed + 1)).resize((size, size), Image.BICUBIC), np.float32)
    else:
        st = tex.value_noise(size, size, 1.2, seed=seed + 1)
    base = np.ones((size, size, 3), np.float32) * np.array(tex.hex_rgb(hexc), np.float32) * (0.95 + 0.08 * n + 0.02 * (st - 0.5))[..., None]
    rough = 0.36 + 0.05 * n + 0.03 * (st - 0.5)
    normal = tex.normal_from_height(0.15 * st + 0.12 * tex.value_noise(size, size, 1.0, seed=seed + 2), 0.6)
    return base, rough, np.ones_like(rough), normal


def save_set(name, parts):
    base, rough, metal, normal = parts[:4]
    ao = parts[4] if len(parts) > 4 else 1.0
    tex.save(base, TEX / f'{name}_c.png')
    tex.save(tex.orm(ao, rough, metal, base.shape[:2]), TEX / f'{name}_orm.png')
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


def aabb(name, x0, x1, y0, y1, z0, z1, mats, bevel=0.0, seg=1, parent=None, r=0.0):
    o = bl.prism(name, bl.rrect(x1 - x0, y1 - y0, r, seg=3), z0, z1, mats=mats, bevel=bevel, seg=seg, parent=parent)
    o.data.transform(Matrix.Translation(((x0 + x1) / 2, (y0 + y1) / 2, 0)))
    return o


def tube(name, pts, radius, mat, parent=None, sides=10):
    """Проволока/стержень по ломаной (скруглённой кривой Безье) — сетка из кривой с bevel."""
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = radius
    cu.bevel_resolution = max(1, sides // 4)
    cu.use_fill_caps = True
    sp = cu.splines.new('POLY')
    sp.points.add(len(pts) - 1)
    for p, co in zip(sp.points, pts):
        p.co = (*co, 1)
    obj = bpy.data.objects.new(name, cu)
    bl.link(obj)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))
    bpy.data.objects.remove(obj)
    bpy.data.curves.remove(cu)
    mo = bpy.data.objects.new(name, me)
    bl.link(mo, parent)
    me.materials.clear()
    me.materials.append(mat)
    for f in me.polygons:
        f.use_smooth = True
    return mo


def arc(cx, cy, cz, r, a0, a1, n=10, plane='XZ'):
    out = []
    for i in range(n + 1):
        a = a0 + (a1 - a0) * i / n
        if plane == 'XZ':
            out.append((cx + r * math.cos(a), cy, cz + r * math.sin(a)))
        else:
            out.append((cx, cy + r * math.cos(a), cz + r * math.sin(a)))
    return out


def build_socket(parent=None, loc=(0, 0, 0)):
    """Сокет в сборе (без платы). Возвращает корневой Empty 'socket'."""
    TEX.mkdir(parents=True, exist_ok=True)
    root = bl.empty('socket', parent, loc)

    save_set('field', tex_field())
    save_set('torx', tex_torx())
    save_set('force_steel', tex_steel(hexc='#55585c', seed=3))
    save_set('rail_steel', tex_steel(hexc='#9a9da1', seed=5))

    field_m = pbr('socket_field', 'field')
    lcp = bl.solid('lcp', bl.srgb('#202124'), 0.0, 0.5)
    force_m = pbr('force_frame', 'force_steel')
    rail_m = pbr('rail_frame', 'rail_steel')
    torx_m = pbr('torx', 'torx')
    wire = bl.solid('spring_wire', bl.srgb('#b9bcbf'), 1.0, 0.22)
    rubber = bl.solid('latch_plastic', bl.srgb('#0c0c0d'), 0.0, 0.55)
    ceramic = bl.solid('lsc_body', bl.srgb('#5a4630'), 0.0, 0.45)
    tin = bl.solid('lsc_term', bl.srgb('#c9c6bd'), 1.0, 0.3)

    # ── Корпус: основание с окном и ободок ──
    hw, hh = HOUSING_W / 2, HOUSING_H / 2
    base = bl.prism('housing', bl.rrect(HOUSING_W, HOUSING_H, 1.5 * MM), 0, FLOOR_Z, mats=[field_m, lcp, lcp], holes=[bl.rrect(CAVITY_W, CAVITY_H, 0.8 * MM)], bevel=0.15 * MM, seg=1, parent=root)
    bl.uv_planar(base, (-hw, -hh, hw, hh))
    rim = bl.prism('housing_rim', bl.rrect(HOUSING_W, HOUSING_H, 1.5 * MM), FLOOR_Z, RIM_Z, mats=[lcp], holes=[bl.rrect(FIELD_W + 1.6 * MM, FIELD_H + 1.6 * MM, 1.0 * MM)], bevel=0.2 * MM, seg=1)
    # Ключи совмещения на внутренних стенках
    keys = [aabb('key', sx * (FIELD_W / 2 + 0.8 * MM) - 0.8 * MM, sx * (FIELD_W / 2 + 0.8 * MM) + 0.8 * MM, ky - 2.5 * MM, ky + 2.5 * MM, FLOOR_Z, RIM_Z + 0.4 * MM, [lcp], bevel=0.1 * MM) for sx in (-1, 1) for ky in (-24 * MM, 24 * MM)]
    # Ободок окна под конденсаторы
    cav_rim = bl.prism('cavity_rim', bl.rrect(CAVITY_W + 2.4 * MM, CAVITY_H + 2.4 * MM, 1.0 * MM), FLOOR_Z, FLOOR_Z + 0.45 * MM, mats=[bl.solid('rim_gray', bl.srgb('#3a4250'), 0.0, 0.4)], holes=[bl.rrect(CAVITY_W, CAVITY_H, 0.8 * MM)], bevel=0.1 * MM, seg=1)
    bl.join([rim, cav_rim] + keys, 'housing_walls').parent = root

    # Конденсаторы на плате в окне
    caps = []
    for c in range(4):
        for r in range(14):
            x, y = (c - 1.5) * 3.6 * MM, (r - 6.5) * 2.15 * MM
            t = 0.28 * MM
            caps.append(bl.box('lb', (1.0 * MM - 2 * t, 0.5 * MM, 0.48 * MM), (x, y, 0), mats=[ceramic]))
            for s in (-1, 1):
                caps.append(bl.box('lt', (t, 0.52 * MM, 0.5 * MM), (x + s * (0.5 * MM - t / 2), y, 0), mats=[tin]))
    bl.join(caps, 'lsc_board').parent = root

    # ── Силовая рамка ──
    fo, fi = FRAME_OUT, FRAME_IN
    force = bl.prism('force_frame', bl.rrect(fo[0], fo[1], 7 * MM), 0, FRAME_Z, mats=[force_m], holes=[bl.rrect(fi[0], fi[1], 3 * MM)], bevel=0.5 * MM, seg=2)
    bl.uv_planar(force, (-fo[0] / 2, -fo[1] / 2, fo[0] / 2, fo[1] / 2))
    bosses = []
    for x, y in SCREWS:
        b = bl.cylinder('boss', 5.2 * MM, 5.6 * MM, (x, y, 0), mats=[force_m], verts=28, bevel=0.4 * MM, seg=2)
        bl.uv_planar(b, (-fo[0] / 2, -fo[1] / 2, fo[0] / 2, fo[1] / 2))
        bosses.append(b)
    # Чёрная планка фиксатора у северного края и её стальное основание
    latch = aabb('latch_bar', -16 * MM, 16 * MM, fi[1] / 2 - 1.0 * MM, fi[1] / 2 + 5.5 * MM, FRAME_Z, FRAME_Z + 2.6 * MM, [rubber], bevel=0.5 * MM, seg=2)
    bl.join([force] + bosses, 'force_frame').parent = root
    latch.parent = root

    # ── Винты Torx ──
    heads = []
    for x, y in SCREWS:
        h = bl.cylinder('screw', 4.0 * MM, 2.4 * MM, (x, y, 5.6 * MM), mats=[torx_m, torx_m, force_m], verts=28, bevel=0.5 * MM, seg=3)
        bl.uv_planar(h, (-4 * MM, -4 * MM, 4 * MM, 4 * MM))
        heads.append(h)
    bl.join(heads, 'screws').parent = root

    # ── Направляющая рамка: рельсы Г-профиля, поперечины, шарнир ──
    rails = []
    xin, xout = HOUSING_W / 2 + 0.6 * MM, fi[0] / 2 - 0.6 * MM
    ylen = fi[1] / 2 - 1.2 * MM
    for sx in (-1, 1):
        x0, x1 = sorted((sx * xin, sx * xout))
        rails.append(aabb('rail_top', x0, x1, -ylen, ylen, 4.4 * MM, 5.2 * MM, [rail_m], bevel=0.25 * MM, seg=1))
        wx = sx * xin
        rails.append(aabb('rail_wall', min(wx, wx + sx * 0.8 * MM), max(wx, wx + sx * 0.8 * MM), -ylen, ylen, RIM_Z, 5.2 * MM, [rail_m], bevel=0.15 * MM, seg=1))
        # Выштамповки-язычки вдоль рельса
        for k in range(5):
            ty = (-40 + k * 20) * MM
            rails.append(aabb('tab', x0 + 1.2 * MM, x1 - 1.2 * MM, ty - 2.2 * MM, ty + 2.2 * MM, 5.2 * MM, 5.55 * MM, [rail_m], bevel=0.15 * MM, seg=1))
    for sy in (-1, 1):
        y0, y1 = sorted((sy * (HOUSING_H / 2 + 0.8 * MM), sy * ylen))
        rails.append(aabb('rail_cross', -xout, xout, y0, y1, 4.4 * MM, 5.2 * MM, [rail_m], bevel=0.25 * MM, seg=1))
    rail = bl.join(rails, 'rail_frame')
    rail.parent = root
    bl.uv_planar(rail, (-fo[0] / 2, -fo[1] / 2, fo[0] / 2, fo[1] / 2))

    # Шарнир вдоль южного края: стержень и три петли
    hy = -(ylen + 1.8 * MM)
    hinge = [tube('hinge_rod', [(-xout + 3 * MM, hy, 4.2 * MM), (xout - 3 * MM, hy, 4.2 * MM)], 1.5 * MM, rail_m, sides=12)]
    for kx in (-35, 0, 35):
        hinge.append(bl.cylinder('knuckle', 2.3 * MM, 9 * MM, (0, 0, 0), mats=[rail_m], verts=20, bevel=0.3 * MM, seg=1))
        hinge[-1].data.transform(Matrix.Translation((kx * MM - 4.5 * MM, hy, 4.2 * MM)) @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
    # Пружинные проволоки у южных углов: виток и рычаг
    for sx in (-1, 1):
        cx = sx * (xout - 6 * MM)
        coil = []
        for i in range(37):
            a = i / 36 * 2 * math.pi * 1.5
            coil.append((cx + sx * i * 0.12 * MM, hy + 2.6 * MM * math.cos(a), 4.2 * MM + 2.6 * MM * math.sin(a)))
        lever = coil + [(cx + sx * 6 * MM, hy - 2.6 * MM, 4.2 * MM), (cx + sx * 9 * MM, hy - 8 * MM, 3.0 * MM), (cx + sx * 9.5 * MM, hy - 12 * MM, 2.2 * MM)]
        hinge.append(tube('spring', lever, 0.55 * MM, wire, sides=8))
    bl.join(hinge, 'lever').parent = root

    # Мелкая AO-подсказка корпуса не нужна: поле контактов несёт свою AO в текстуре
    return root


# ── Standalone: сокет на участке платы ───────────────────────────────────────


def tex_patch(W=2048, size_mm=(190.0, 210.0), seed=1):
    """Участок чёрной платы: трассы веером от сокета, переходные, мелкая пассивка — как на фото."""
    w_mm, h_mm = size_mm
    Hpx = int(W * h_mm / w_mm)
    k = W / w_mm
    cv = tex.Canvas(W, Hpx, 2)
    r = tex.rng(seed)

    def px(x, y):
        return (x + w_mm / 2) * k, (h_mm / 2 - y) * k

    fx, fy = FRAME_OUT[0] / MM / 2 + 2, FRAME_OUT[1] / MM / 2 + 2
    for side in range(4):
        for i in range(60):
            t = (i - 30) / 30
            if side in (0, 1):
                sx = 1 if side == 0 else -1
                y0 = t * fy * 0.9
                pts = [(sx * fx, y0), (sx * (fx + 6 + abs(t) * 4), y0), (sx * (fx + 14 + abs(t) * 8), y0 + np.sign(t) * 8), (sx * w_mm / 2, y0 + np.sign(t) * 8)]
            else:
                sy = 1 if side == 2 else -1
                x0 = t * fx * 0.9
                pts = [(x0, sy * fy), (x0, sy * (fy + 5 + abs(t) * 4)), (x0 + np.sign(t) * 8, sy * (fy + 12 + abs(t) * 8)), (x0 + np.sign(t) * 8, sy * h_mm / 2)]
            cv.line([px(x, y) for x, y in pts], 0.16 * k, 150)
    traces = tex.blur(cv.array(), 0.7)
    vias = tex.Canvas(W, Hpx, 1)
    for _ in range(500):
        x, y = r.uniform(-w_mm / 2, w_mm / 2), r.uniform(-h_mm / 2, h_mm / 2)
        if abs(x) < fx and abs(y) < fy:
            continue
        vias.ellipse(*px(x, y), 0.22 * k)
    v = vias.array()
    n = tex.fbm(Hpx, W, 200, 4, seed=seed + 3)
    base = np.ones((Hpx, W, 3), np.float32) * np.array(tex.hex_rgb('#0f1012'), np.float32) * (0.9 + 0.2 * n)[..., None]
    base = base * (1 + 0.8 * traces[..., None]) + 0.012 * v[..., None]
    rough = 0.28 + 0.05 * n - 0.06 * traces
    normal = tex.normal_from_height(tex.blur(0.9 * traces + 0.5 * v, 0.7), 1.2)
    return base, rough, np.zeros_like(rough), normal


def build():
    root = bl.empty('socket_sp7')
    sock = build_socket(root)
    save_set('patch', tex_patch())
    patch_m = pbr('pcb_patch', 'patch', coat=0.3, coat_roughness=0.15)
    edge = bl.solid('pcb_edge', bl.srgb('#26241b'), 0.0, 0.7)
    pw, ph = 190 * MM, 210 * MM
    patch = bl.prism('pcb_patch', bl.rrect(pw, ph, 2 * MM), -1.6 * MM, 0, mats=[patch_m, edge, edge], bevel=0.2 * MM, seg=1, parent=root)
    bl.uv_planar(patch, (-pw / 2, -ph / 2, pw / 2, ph / 2))
    # AO платы под рамкой сокета
    ao = bl.bake_ao([(patch, patch_m)], 1024, TEX / 'patch_ao.png', samples=96, distance=8 * MM)
    from PIL import Image

    c = np.asarray(Image.open(TEX / 'patch_c.png'), np.float32) / 255
    orm_img = np.asarray(Image.open(TEX / 'patch_orm.png'), np.float32) / 255
    h, w = c.shape[:2]
    a = np.clip(np.asarray(Image.fromarray(ao).resize((w, h), Image.BILINEAR), np.float32), 0, 1)
    orm_img[..., 0] = a
    tex.save(orm_img, TEX / 'patch_orm.png')
    tex.save(c * (0.5 + 0.5 * a[..., None]), TEX / 'patch_c.png')
    for img in bpy.data.images:
        if img.filepath and 'patch_' in img.filepath:
            img.reload()
    return root


PREVIEWS = {
    # Как на фото: три четверти сверху, север вверху справа
    'ref': dict(cam=(0.13, -0.2, 0.2), target=(0.005, 0.0, 0.0), lens=55),
    'top': dict(cam=(0.0, -0.02, 0.32), target=(0, 0, 0), lens=60),
    'pins': dict(cam=(0.035, -0.05, 0.06), target=(0.012, 0.0, 0.002), lens=80),
    'hinge': dict(cam=(-0.09, -0.16, 0.07), target=(-0.03, -0.06, 0.004), lens=70),
}
