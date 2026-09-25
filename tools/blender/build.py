"""
Сборка модели: blender -b --factory-startup -P tools/blender/build.py -- <деталь> [--preview hero delid ...] [--no-export]

Деталь — модуль из parts/ с функцией build() → корневой Empty, константой NAME и словарём PREVIEWS.
Результат: apps/web/public/models/<NAME>.glb, .build/<NAME>.blend, превью — .build/previews/<NAME>_<вид>.png.
"""
from __future__ import annotations

import argparse
import json
import importlib
import math
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path[:0] = [str(ROOT / '.deps'), str(ROOT / 'lib'), str(ROOT / 'parts')]

import bpy  # noqa: E402

import bl  # noqa: E402

MODELS = bl.REPO / 'apps' / 'web' / 'public' / 'models'


def parse() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index('--') + 1 :] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('part')
    ap.add_argument('--preview', nargs='*', default=None, help='виды из PREVIEWS; без значений — все')
    ap.add_argument('--no-export', action='store_true')
    ap.add_argument('--samples', type=int, default=96)
    ap.add_argument('--res', type=int, nargs=2, default=(1600, 1200))
    return ap.parse_args(argv)


def descendants(obj):
    out = [obj]
    for c in obj.children:
        out.extend(descendants(c))
    return out


def set_explode(root, value: float) -> None:
    """Повторяет applyRig: смещение из extras (glTF) → оси Blender, плавность smoothstep по explodeRange."""
    for o in descendants(root):
        if 'explode' not in o and 'explodeScale' not in o:
            continue
        a, b = list(o.get('explodeRange', [0, 1]))
        t = min(1, max(0, (value - a) / max(1e-6, b - a)))
        t = t * t * (3 - 2 * t)
        if 'explode' in o:
            if '__base' not in o:
                o['__base'] = list(o.location)
            gx, gy, gz = o['explode']
            base = o['__base']
            o.location = (base[0] + gx * t, base[1] - gz * t, base[2] + gy * t)
        if 'explodeScale' in o:
            # glTF (x, y, z) ↔ Blender (x, z, y) для масштаба
            sx, sy, sz = o['explodeScale']
            o.scale = (1 + (sx - 1) * t, 1 + (sz - 1) * t, 1 + (sy - 1) * t)


def set_glow(strength: float) -> None:
    for m in bpy.data.materials:
        if m.get('glow') and m.node_tree:
            m.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = strength


def preview(name: str, key: str, cfg: dict, root, samples: int, res) -> Path:
    """
    Студия, повторяющая сцену сайта: тёмный зал, ключевой прожектор сверху, заполняющий слева,
    контровой сзади и панели-Lightformer, которые видны только в отражениях металла.
    """
    bl.clear_preview_rig()
    bl.studio_world(cfg.get('hdri', 'studio'), cfg.get('env', 0.25), cfg.get('env_rot', 0.6), cfg.get('bg', 0.012))
    target = cfg.get('target', (0, 0, 0))
    cam = cfg['cam']
    bl.camera(cam, target, cfg.get('lens', 60), up=cfg.get('up'))
    d = math.dist(cam, target)
    tx, ty, tz = target
    k = cfg.get('light', 1.0)
    if cfg.get('below'):
        # Вид снизу: студия зеркалится, иначе металл снизу отражает только тёмный пол
        d = -d
        tz = tz
    bl.area_light('__preview_key', (tx - 0.25 * d, ty - 0.2 * d, tz + 1.6 * d), target, 70 * k * d * d, 0.6 * abs(d))
    bl.area_light('__preview_fill', (tx - 1.4 * d, ty - 0.9 * d, tz + 0.5 * d), target, 18 * k * d * d, 0.8 * abs(d), (0.8, 0.85, 1.0))
    bl.area_light('__preview_rim', (tx + 0.6 * d, ty + 1.3 * d, tz + 0.3 * d), target, 30 * k * d * d, 0.4 * abs(d), (0.9, 0.93, 1.0))
    if cfg.get('panels', True):
        s = cfg.get('panel', 6.0)
        bl.lightformer('__preview_lf_top', (tx, ty + 0.3 * d, tz + 2.2 * d), target, (3.0 * abs(d), 1.2 * abs(d)), s)
        bl.lightformer('__preview_lf_left', (tx - 2.0 * d, ty, tz + 0.6 * d), target, (0.35 * abs(d), 2.2 * abs(d)), s * 1.3)
        bl.lightformer('__preview_lf_right', (tx + 2.0 * d, ty + 0.5 * d, tz + 0.7 * d), target, (0.3 * abs(d), 2.0 * abs(d)), s)
        bl.lightformer('__preview_lf_front', (tx, ty - 2.2 * d, tz + 0.2 * d), target, (2.4 * abs(d), 0.25 * abs(d)), s * 0.6)
    hidden = []
    for node in cfg.get('hide', []):
        obj = bpy.data.objects.get(node)
        if obj:
            for o in descendants(obj):
                o.hide_render = True
                hidden.append(o)
    set_explode(root, cfg.get('explode', 0.0))
    set_glow(cfg.get('glow', 0.0))
    out = bl.BUILD / 'previews' / f'{name}_{key}.png'
    bl.render(out, res, samples, cfg.get('exposure', 0.0))
    for o in hidden:
        o.hide_render = False
    set_explode(root, 0.0)
    return out


def stats(root) -> str:
    tris = 0
    meshes = 0
    for o in descendants(root):
        if o.type == 'MESH':
            meshes += 1
            o.data.calc_loop_triangles()
            tris += len(o.data.loop_triangles)
    return f'{meshes} мешей, {tris:,} треугольников'.replace(',', ' ')


def anchors(root) -> dict:
    """
    Якоря для хотспотов в пространстве модели на сайте: prepareGlb центрирует модель по габаритам
    и масштабирует наибольший габарит до 2. Для каждого именованного узла — центр и верх его мешей
    (или положение пустышки), в осях glTF.
    """
    from mathutils import Vector

    bpy.context.view_layer.update()

    def to_gltf(v):
        return Vector((v.x, v.z, -v.y))

    def mesh_bounds(objs):
        pts = [to_gltf(o.matrix_world @ Vector(c)) for o in objs if o.type == 'MESH' for c in o.bound_box]
        if not pts:
            return None
        lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
        hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
        return lo, hi

    lo, hi = mesh_bounds(descendants(root))
    center = (lo + hi) / 2
    scale = 2 / max(hi - lo)
    norm = lambda v: [round(c, 4) for c in ((v - center) * scale)]  # noqa: E731
    nodes = {}
    for o in descendants(root)[1:]:
        if o.name.startswith('__'):
            continue
        b = mesh_bounds(descendants(o))
        origin = norm(to_gltf(o.matrix_world.translation))
        if b:
            blo, bhi = b
            c = (blo + bhi) / 2
            nodes[o.name] = {'origin': origin, 'center': norm(c), 'top': norm(Vector((c.x, bhi.y, c.z))), 'front': norm(Vector((c.x, c.y, bhi.z))), 'size': [round(s * scale, 4) for s in (bhi - blo)]}
        else:
            nodes[o.name] = {'origin': origin, 'center': origin}
    tris = 0
    for o in descendants(root):
        if o.type == 'MESH':
            o.data.calc_loop_triangles()
            tris += len(o.data.loop_triangles)
    return {'triangles': tris, 'scale': round(scale, 6), 'size': [round(s * scale, 4) for s in (hi - lo)], 'nodes': nodes}


def shrink_textures(max_px: int) -> None:
    """Мобильный вариант: все текстуры не больше max_px по большей стороне."""
    for img in bpy.data.images:
        if not img.has_data and img.source == 'FILE':
            img.reload()
        w, h = img.size
        if max(w, h) > max_px:
            k = max_px / max(w, h)
            img.scale(max(4, int(w * k)), max(4, int(h * k)))


def main() -> None:
    args = parse()
    t0 = time.time()
    bl.reset()
    part = importlib.import_module(args.part)
    root = part.build()
    print(f'[build] {part.NAME}: {stats(root)} за {time.time() - t0:.1f} с')

    bl.BUILD.mkdir(parents=True, exist_ok=True)
    # Текстуры внутри .blend: файл открывается сам по себе, без папки .build/tex
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(bl.BUILD / f'{part.NAME}.blend'), compress=True)
    info = anchors(root)
    info['extra'] = getattr(part, 'EXTRA', {})
    (bl.BUILD / f'{part.NAME}.anchors.json').write_text(json.dumps(info, ensure_ascii=False, indent=1), encoding='utf-8')

    if not args.no_export:
        set_glow(1.0)
        if getattr(part, 'MAX_TEXTURE', None):
            shrink_textures(part.MAX_TEXTURE)
        out = MODELS / f'{part.NAME}.glb'
        bl.export_glb(out, root)
        print(f'[build] GLB {out} — {out.stat().st_size / 1e6:.2f} МБ')

    if args.preview is not None:
        keys = args.preview or list(part.PREVIEWS)
        for key in keys:
            p = preview(part.NAME, key, part.PREVIEWS[key], root, args.samples, args.res)
            print(f'[build] превью {p}')

    # Мобильный вариант — последним: уменьшение текстур необратимо в пределах сессии
    if not args.no_export and getattr(part, 'MOBILE', True):
        set_glow(1.0)
        shrink_textures(1024)
        out = MODELS / f'{part.NAME}-mobile.glb'
        bl.export_glb(out, root, quality=80)
        print(f'[build] GLB (mobile) {out} — {out.stat().st_size / 1e6:.2f} МБ')
    print(f'[build] готово за {time.time() - t0:.1f} с')


main()
