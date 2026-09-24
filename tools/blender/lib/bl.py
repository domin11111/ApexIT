"""
Хелперы Blender для сборки моделей: геометрия, PBR-материалы, UV, запекание AO, экспорт GLB, превью.

Единицы — метры, размеры задаются в миллиметрах через MM. Ось Z — вверх (Blender); экспортёр
переводит в Y-up glTF: (x, y, z)_blender → (x, z, -y)_gltf. Лицевая сторона плоских деталей
(модуль памяти, видеокарта) смотрит в −Y Blender, то есть в +Z glTF — как у процедурных моделей сайта.
"""
from __future__ import annotations

import math
from pathlib import Path
from typing import Iterable, Sequence

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

MM = 0.001
ROOT = Path(__file__).resolve().parent.parent  # tools/blender
REPO = ROOT.parent.parent
BUILD = ROOT / '.build'

Vec2 = tuple[float, float]
Vec3 = tuple[float, float, float]


# ── Сцена ────────────────────────────────────────────────────────────────────


def reset() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.length_unit = 'MILLIMETERS'


def empty(name: str, parent: bpy.types.Object | None = None, loc: Vec3 = (0, 0, 0)) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_size = 0.01
    obj.location = loc
    bpy.context.scene.collection.objects.link(obj)
    if parent:
        obj.parent = parent
    return obj


def link(obj: bpy.types.Object, parent: bpy.types.Object | None = None) -> bpy.types.Object:
    if obj.name not in bpy.context.scene.collection.objects:
        bpy.context.scene.collection.objects.link(obj)
    if parent:
        obj.parent = parent
    return obj


def to_gltf(v: Vec3) -> list[float]:
    """Вектор Blender → glTF (для смещений разлёта в extras)."""
    return [round(v[0], 6), round(v[2], 6), round(-v[1], 6)]


def rig(obj: bpy.types.Object, **markup) -> bpy.types.Object:
    """
    Разметка контракта rig.ts в custom properties → extras glTF → userData three.js.
    explode задаётся в осях Blender и конвертируется.
    """
    for key, value in markup.items():
        if key == 'explode':
            value = to_gltf(value)
        obj[key] = value
    return obj


# ── Геометрия ────────────────────────────────────────────────────────────────


def rrect(w: float, h: float, r: float, seg: int = 6) -> list[Vec2]:
    """Прямоугольник со скруглёнными углами, против часовой стрелки, центр в нуле."""
    if r <= 0:
        return [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]
    r = min(r, w / 2, h / 2)
    pts: list[Vec2] = []
    for cx, cy, a0 in ((w / 2 - r, -h / 2 + r, -90), (w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180)):
        for i in range(seg + 1):
            a = math.radians(a0 + 90 * i / seg)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def _bevel(bm: bmesh.types.BMesh, edges: list, offset: float, seg: int) -> None:
    if offset > 0 and edges:
        bmesh.ops.bevel(
            bm,
            geom=edges,
            offset=offset,
            offset_type='OFFSET',
            segments=seg,
            profile=0.5,
            affect='EDGES',
            clamp_overlap=True,
            harden_normals=False,
        )


def prism(
    name: str,
    outline: Sequence[Vec2],
    z0: float,
    z1: float,
    mats: Sequence[bpy.types.Material | None] = (),
    bevel: float = 0.0,
    bevel_bottom: float | None = None,
    seg: int = 2,
    holes: Sequence[Sequence[Vec2]] = (),
    loc: Vec3 = (0, 0, 0),
    parent: bpy.types.Object | None = None,
    smooth_angle: float = 35,
) -> bpy.types.Object:
    """
    Призма по контуру (с отверстиями), кромки скруглены фаской bevel.
    Слоты материалов: 0 — верх, 1 — низ, 2 — боковины (если передан один — везде он).
    """
    bm = bmesh.new()
    loops = [list(outline)] + [list(h) for h in holes]
    bottoms, tops = [], []
    for li, loop in enumerate(loops):
        vb = [bm.verts.new((x, y, z0)) for x, y in loop]
        vt = [bm.verts.new((x, y, z1)) for x, y in loop]
        n = len(loop)
        for i in range(n):
            j = (i + 1) % n
            f = bm.faces.new((vb[i], vb[j], vt[j], vt[i]) if li == 0 else (vb[j], vb[i], vt[i], vt[j]))
            f.material_index = 2
        bottoms.append(vb)
        tops.append(vt)
    bm.edges.ensure_lookup_table()
    # Крышки: для контура с отверстиями — через triangle_fill по рёбрам
    for verts, idx, flip in ((tops, 0, False), (bottoms, 1, True)):
        if len(loops) == 1:
            ring = verts[0] if not flip else list(reversed(verts[0]))
            f = bm.faces.new(ring)
            f.material_index = idx
        else:
            edges = []
            for ring in verts:
                for i in range(len(ring)):
                    e = bm.edges.get((ring[i], ring[(i + 1) % len(ring)]))
                    edges.append(e)
            res = bmesh.ops.triangle_fill(bm, use_beauty=True, use_dissolve=True, edges=edges, normal=(0, 0, -1 if flip else 1))
            for f in res['geom']:
                if isinstance(f, bmesh.types.BMFace):
                    f.material_index = idx
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    top_edges = [e for e in bm.edges if all(abs(v.co.z - z1) < 1e-9 for v in e.verts) and len(e.link_faces) == 2 and any(f.material_index == 2 for f in e.link_faces)]
    bot_edges = [e for e in bm.edges if all(abs(v.co.z - z0) < 1e-9 for v in e.verts) and len(e.link_faces) == 2 and any(f.material_index == 2 for f in e.link_faces)]
    _bevel(bm, top_edges, bevel, seg)
    bm.edges.ensure_lookup_table()
    bot_edges = [e for e in bot_edges if e.is_valid]
    _bevel(bm, bot_edges, bevel if bevel_bottom is None else bevel_bottom, seg)
    obj = _obj_from_bm(name, bm, mats, loc, parent, smooth_angle)
    return obj


def box(name: str, size: Vec3, loc: Vec3 = (0, 0, 0), mats=(), bevel: float = 0.0, seg: int = 2, parent=None, r: float = 0.0) -> bpy.types.Object:
    """Параллелепипед; loc — центр основания по XY и низ по Z."""
    w, d, h = size
    return prism(name, rrect(w, d, r), 0, h, mats=mats, bevel=bevel, seg=seg, loc=loc, parent=parent)


def cylinder(name: str, radius: float, height: float, loc: Vec3 = (0, 0, 0), mats=(), verts: int = 24, bevel: float = 0.0, seg: int = 2, parent=None) -> bpy.types.Object:
    outline = [(radius * math.cos(2 * math.pi * i / verts), radius * math.sin(2 * math.pi * i / verts)) for i in range(verts)]
    return prism(name, outline, 0, height, mats=mats, bevel=bevel, seg=seg, loc=loc, parent=parent, smooth_angle=50)


def _obj_from_bm(name, bm, mats, loc, parent, smooth_angle) -> bpy.types.Object:
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for f in me.polygons:
        f.use_smooth = True
    me.set_sharp_from_angle(angle=math.radians(smooth_angle))
    obj = bpy.data.objects.new(name, me)
    obj.location = loc
    link(obj, parent)
    set_mats(obj, mats)
    return obj


def set_mats(obj: bpy.types.Object, mats: Sequence) -> None:
    mats = list(mats)
    if not mats:
        return
    if len(mats) == 1:
        mats = mats * 3
    while len(mats) < 3:
        mats.append(mats[-1])
    for m in mats:
        obj.data.materials.append(m)
    # Лишние слоты без граней экспортёр пропускает


def mesh_from_data(name: str, verts, faces, mats=(), parent=None, loc=(0, 0, 0), smooth_angle=35, mat_index=None) -> bpy.types.Object:
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    me.validate()
    if mat_index is not None:
        me.polygons.foreach_set('material_index', np.asarray(mat_index, dtype=np.int32))
    for f in me.polygons:
        f.use_smooth = True
    me.set_sharp_from_angle(angle=math.radians(smooth_angle))
    obj = bpy.data.objects.new(name, me)
    obj.location = loc
    link(obj, parent)
    for m in mats:
        obj.data.materials.append(m)
    return obj


def join(objs: list[bpy.types.Object], name: str) -> bpy.types.Object:
    """
    Сливает объекты в один в мировом пространстве (материалы объединяются по слотам).
    Родители и трансформации исходных объектов запекаются в вершины, результат — без родителя
    и с единичной трансформацией: так слияние не зависит от того, к чему объекты были привязаны.
    """
    objs = [o for o in objs if o is not None]
    bpy.context.view_layer.update()
    for o in objs:
        mw = o.matrix_world.copy()
        o.parent = None
        o.data.transform(mw)
        o.matrix_world = Matrix.Identity(4)
    ctx = {'active_object': objs[0], 'selected_editable_objects': objs, 'selected_objects': objs}
    with bpy.context.temp_override(**ctx):
        bpy.ops.object.join()
    objs[0].name = name
    objs[0].data.name = name
    return objs[0]


def adopt(obj: bpy.types.Object, parent: bpy.types.Object) -> bpy.types.Object:
    """Привязывает объект к родителю, сохраняя его мировое положение."""
    bpy.context.view_layer.update()
    mw = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_world = mw
    return obj


def apply_transform(obj: bpy.types.Object) -> None:
    mw = obj.matrix_basis.copy()
    obj.data.transform(mw)
    obj.matrix_basis = Matrix.Identity(4)


def instance_grid(proto: bpy.types.Object, positions: Iterable[Vec3], name: str, rotations: Iterable[float] | None = None, parent=None) -> bpy.types.Object:
    """Копии прототипа (меш сливается в один объект — один вызов отрисовки)."""
    src = proto.data
    bm = bmesh.new()
    rots = list(rotations) if rotations is not None else None
    for i, p in enumerate(positions):
        m = Matrix.Translation(Vector(p))
        if rots is not None:
            m = m @ Matrix.Rotation(rots[i], 4, 'Z')
        tmp = src.copy()
        tmp.transform(m)
        bm.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    for m in src.materials:
        me.materials.append(m)
    link(obj, parent)
    return obj


def remove(obj: bpy.types.Object) -> None:
    bpy.data.objects.remove(obj, do_unlink=True)


# ── UV ───────────────────────────────────────────────────────────────────────


def uv_planar(obj: bpy.types.Object, bounds: tuple[float, float, float, float], axis: str = 'Z', flip_u: bool = False, only_mat: int | None = None, uv_name: str = 'UVMap') -> None:
    """
    Проекция UV вдоль оси в пределах bounds (u0, v0, u1, v1) в координатах объекта.
    axis 'Z' → (x, y); 'Y' → (x, z); 'X' → (y, z). only_mat — только грани с этим слотом.
    """
    me = obj.data
    uv = me.uv_layers.get(uv_name) or me.uv_layers.new(name=uv_name)
    u0, v0, u1, v1 = bounds
    ia, ib = {'Z': (0, 1), 'Y': (0, 2), 'X': (1, 2)}[axis]
    for poly in me.polygons:
        if only_mat is not None and poly.material_index != only_mat:
            continue
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            u = (co[ia] - u0) / (u1 - u0)
            v = (co[ib] - v0) / (v1 - v0)
            uv.data[li].uv = (1 - u if flip_u else u, v)


def uv_lightmap(obj: bpy.types.Object, name: str = 'AO', margin: float = 0.004) -> None:
    """Уникальная развёртка второго канала для AO (Smart UV Project)."""
    me = obj.data
    layer = me.uv_layers.get(name) or me.uv_layers.new(name=name)
    me.uv_layers.active = layer
    with bpy.context.temp_override(active_object=obj, selected_editable_objects=[obj], object=obj):
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=margin, correct_aspect=True, scale_to_bounds=True)
        bpy.ops.object.mode_set(mode='OBJECT')
    me.uv_layers.active = me.uv_layers[0]


# ── Материалы ────────────────────────────────────────────────────────────────


def load_image(path: Path | str, color: bool = True, name: str | None = None) -> bpy.types.Image:
    img = bpy.data.images.load(str(path), check_existing=True)
    if name:
        img.name = name
    img.colorspace_settings.name = 'sRGB' if color else 'Non-Color'
    return img


def _gltf_output_group() -> bpy.types.NodeTree:
    """Группа «glTF Material Output»: экспортёр берёт из неё occlusion."""
    group = bpy.data.node_groups.get('glTF Material Output')
    if group:
        return group
    group = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
    group.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    group.interface.new_socket('Thickness', in_out='INPUT', socket_type='NodeSocketFloat')
    return group


def material(
    name: str,
    color: Sequence[float] = (0.8, 0.8, 0.8),
    metallic: float = 0.0,
    roughness: float = 0.5,
    base_tex: bpy.types.Image | None = None,
    orm_tex: bpy.types.Image | None = None,
    normal_tex: bpy.types.Image | None = None,
    normal_strength: float = 1.0,
    emission_tex: bpy.types.Image | None = None,
    emission_color: Sequence[float] | None = None,
    emission_strength: float = 0.0,
    coat: float = 0.0,
    coat_roughness: float = 0.05,
    specular: float = 0.5,
    ior: float = 1.5,
    anisotropy: float = 0.0,
    aniso_rotation: float = 0.0,
    alpha: float = 1.0,
    uv: str = 'UVMap',
    ao_uv: str | None = None,
    thin_film: float = 0.0,
) -> bpy.types.Material:
    """
    Principled BSDF в форме, которую экспортёр glTF переводит без потерь:
    ORM-текстура (R — AO, G — roughness, B — metallic) через Separate Color, normal через Normal Map.
    Если orm_tex задан, metallic/roughness-константы — множители (glTF factor).
    """
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    # Односторонний материал: экспортёр пишет doubleSided, если отсечение задних граней выключено
    mat.use_backface_culling = True
    nt = mat.node_tree
    nodes, links = nt.nodes, nt.links
    bsdf = nodes.get('Principled BSDF')
    bsdf.location = (0, 0)

    def uvnode(uvname: str, y: float):
        n = nodes.new('ShaderNodeUVMap')
        n.uv_map = uvname
        n.location = (-900, y)
        return n

    def tex(img, y, uvname=uv):
        n = nodes.new('ShaderNodeTexImage')
        n.image = img
        n.location = (-600, y)
        n.interpolation = 'Linear'
        if uvname != 'UVMap':
            links.new(uvnode(uvname, y).outputs['UV'], n.inputs['Vector'])
        return n

    bsdf.inputs['Base Color'].default_value = (*color[:3], 1)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['IOR'].default_value = ior
    bsdf.inputs['Specular IOR Level'].default_value = specular
    bsdf.inputs['Alpha'].default_value = alpha
    if alpha < 1:
        mat.surface_render_method = 'BLENDED'

    if base_tex:
        t = tex(base_tex, 300)
        links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
    if orm_tex:
        t = tex(orm_tex, 0)
        sep = nodes.new('ShaderNodeSeparateColor')
        sep.location = (-300, 0)
        links.new(t.outputs['Color'], sep.inputs['Color'])
        links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
        links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
        if ao_uv is None:
            out = nodes.new('ShaderNodeGroup')
            out.node_tree = _gltf_output_group()
            out.location = (300, -400)
            links.new(sep.outputs['Red'], out.inputs['Occlusion'])
    if normal_tex:
        t = tex(normal_tex, -300)
        nm = nodes.new('ShaderNodeNormalMap')
        nm.location = (-300, -300)
        nm.inputs['Strength'].default_value = normal_strength
        if uv != 'UVMap':
            nm.uv_map = uv
        links.new(t.outputs['Color'], nm.inputs['Color'])
        links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    if emission_tex or emission_color:
        if emission_tex:
            t = tex(emission_tex, -600)
            links.new(t.outputs['Color'], bsdf.inputs['Emission Color'])
        else:
            bsdf.inputs['Emission Color'].default_value = (*emission_color[:3], 1)
        bsdf.inputs['Emission Strength'].default_value = emission_strength
    if coat > 0:
        bsdf.inputs['Coat Weight'].default_value = coat
        bsdf.inputs['Coat Roughness'].default_value = coat_roughness
    # Для моделей сайта анизотропию не задаём: three.js без касательных в GLB раздувает блики,
    # и bloom превращает их в ореол. Шлифовку передают карты нормалей и шероховатости.
    if anisotropy > 0:
        bsdf.inputs['Anisotropic'].default_value = anisotropy
        bsdf.inputs['Anisotropic Rotation'].default_value = aniso_rotation
    if thin_film > 0:
        bsdf.inputs['Thin Film Thickness'].default_value = thin_film
        bsdf.inputs['Thin Film IOR'].default_value = 1.45
    return mat


def solid(name: str, color, metallic=0.0, roughness=0.5, **kw) -> bpy.types.Material:
    return material(name, color=color, metallic=metallic, roughness=roughness, **kw)


def srgb(hex_or_rgb) -> tuple[float, float, float]:
    """#rrggbb или (r, g, b) 0…255 в sRGB → линейный цвет для Principled."""
    if isinstance(hex_or_rgb, str):
        h = hex_or_rgb.lstrip('#')
        rgb = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    else:
        rgb = [c / 255 for c in hex_or_rgb]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb)


# ── Запекание AO ─────────────────────────────────────────────────────────────


def bake_ao(targets: list[tuple[bpy.types.Object, bpy.types.Material]], size: int, path: Path, samples: int = 256, distance: float = 0.01, uv: str = 'UVMap') -> np.ndarray:
    """
    Запекает AO всех targets в одну картинку size×size (грани с материалами из targets,
    UV-канал uv). Окклюдеры — вся видимая сцена. Возвращает массив float32 (H, W).
    """
    scene = bpy.context.scene
    setup_cycles(samples=samples)
    scene.world = scene.world or bpy.data.worlds.new('World')
    scene.world.light_settings.distance = distance
    img = bpy.data.images.new(f'bake_{path.stem}', size, size, float_buffer=True, alpha=False)
    img.colorspace_settings.name = 'Non-Color'
    added = []
    for obj, mat in targets:
        n = mat.node_tree.nodes.new('ShaderNodeTexImage')
        n.image = img
        n.name = '__bake__'
        if uv != 'UVMap':
            uvn = mat.node_tree.nodes.new('ShaderNodeUVMap')
            uvn.uv_map = uv
            mat.node_tree.links.new(uvn.outputs['UV'], n.inputs['Vector'])
            added.append((mat, uvn))
        mat.node_tree.nodes.active = n
        added.append((mat, n))
    objs = list({o.name: o for o, _ in targets}.values())
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    scene.render.bake.margin = 8
    scene.render.bake.use_clear = True
    bpy.ops.object.bake(type='AO')
    arr = np.empty(size * size * 4, dtype=np.float32)
    img.pixels.foreach_get(arr)
    ao = arr.reshape(size, size, 4)[::-1, :, 0].copy()
    for mat, n in added:
        mat.node_tree.nodes.remove(n)
    bpy.data.images.remove(img)
    return ao


# ── Рендер превью ────────────────────────────────────────────────────────────


def setup_cycles(samples: int = 128) -> None:
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for backend in ('OPTIX', 'CUDA'):
        try:
            prefs.compute_device_type = backend
            prefs.get_devices()
            gpus = [d for d in prefs.devices if d.type == backend]
            if gpus:
                for d in prefs.devices:
                    d.use = d.type == backend
                scene.cycles.device = 'GPU'
                break
        except TypeError:
            continue
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True


def studio_world(hdri: str = 'studio', strength: float = 1.0, rotation: float = 0.0, background: float | None = 0.02) -> None:
    """HDRI из комплекта Blender; фон — тёмный, в отражениях — HDRI."""
    scene = bpy.context.scene
    world = scene.world or bpy.data.worlds.new('World')
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    path = Path(bpy.utils.resource_path('LOCAL')) / 'datafiles' / 'studiolights' / 'world' / f'{hdri}.exr'
    env = nt.nodes.new('ShaderNodeTexEnvironment')
    env.image = bpy.data.images.load(str(path), check_existing=True)
    mapping = nt.nodes.new('ShaderNodeMapping')
    mapping.inputs['Rotation'].default_value = (0, 0, rotation)
    coord = nt.nodes.new('ShaderNodeTexCoord')
    nt.links.new(coord.outputs['Generated'], mapping.inputs['Vector'])
    nt.links.new(mapping.outputs['Vector'], env.inputs['Vector'])
    bg = nt.nodes.new('ShaderNodeBackground')
    bg.inputs['Strength'].default_value = strength
    nt.links.new(env.outputs['Color'], bg.inputs['Color'])
    out = nt.nodes.new('ShaderNodeOutputWorld')
    if background is None:
        nt.links.new(bg.outputs['Background'], out.inputs['Surface'])
        return
    # Камера видит ровный тёмный фон, отражения и освещение — от HDRI
    lp = nt.nodes.new('ShaderNodeLightPath')
    flat = nt.nodes.new('ShaderNodeBackground')
    flat.inputs['Color'].default_value = (background, background, background, 1)
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(lp.outputs['Is Camera Ray'], mix.inputs['Fac'])
    nt.links.new(bg.outputs['Background'], mix.inputs[1])
    nt.links.new(flat.outputs['Background'], mix.inputs[2])
    nt.links.new(mix.outputs['Shader'], out.inputs['Surface'])


def area_light(name: str, loc: Vec3, target: Vec3, power: float, size: float, color=(1, 1, 1)) -> bpy.types.Object:
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = power
    data.size = size
    data.color = color
    obj = bpy.data.objects.new(name, data)
    obj.location = loc
    link(obj)
    look_at(obj, target)
    return obj


def look_at(obj: bpy.types.Object, target: Vec3, up: Vec3 | None = None) -> None:
    """Направляет −Z объекта на target; up — какой мировой вектор считать «верхом» кадра."""
    f = (Vector(target) - obj.location).normalized()
    u = Vector(up or (0, 0, 1))
    if abs(f.dot(u.normalized())) > 0.999:
        u = Vector((0, 1, 0))
    r = f.cross(u).normalized()
    u = r.cross(f).normalized()
    m = Matrix((r, u, -f)).transposed()
    obj.rotation_euler = m.to_euler()


def camera(loc: Vec3, target: Vec3, lens: float = 50, ortho: float | None = None, up: Vec3 | None = None) -> bpy.types.Object:
    data = bpy.data.cameras.new('cam')
    data.lens = lens
    data.clip_start = 0.001
    data.clip_end = 100
    if ortho:
        data.type = 'ORTHO'
        data.ortho_scale = ortho
    obj = bpy.data.objects.new('cam', data)
    obj.location = loc
    link(obj)
    look_at(obj, target, up)
    bpy.context.scene.camera = obj
    return obj


def render(path: Path | str, res: tuple[int, int] = (1600, 1200), samples: int = 96, exposure: float = 0.0) -> None:
    scene = bpy.context.scene
    setup_cycles(samples)
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    # ACES — как ACESFilmicToneMapping на сайте: превью показывает цвета так же, как three.js
    scene.view_settings.view_transform = 'ACES 1.3'
    scene.view_settings.exposure = exposure
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def lightformer(name: str, loc: Vec3, target: Vec3, size: tuple[float, float], strength: float, color=(1, 1, 1)) -> bpy.types.Object:
    """Светящаяся панель, видимая только в отражениях и как источник света — аналог drei Lightformer."""
    w, h = size
    me = bpy.data.meshes.new(name)
    me.from_pydata([(-w / 2, -h / 2, 0), (w / 2, -h / 2, 0), (w / 2, h / 2, 0), (-w / 2, h / 2, 0)], [], [(0, 1, 2, 3)])
    obj = bpy.data.objects.new(name, me)
    obj.location = loc
    link(obj)
    look_at(obj, target)
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (*color, 1)
    em.inputs['Strength'].default_value = strength
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    me.materials.append(mat)
    obj.visible_camera = False
    obj.visible_shadow = False
    return obj


def clear_preview_rig() -> None:
    for obj in list(bpy.context.scene.objects):
        if obj.type in {'CAMERA', 'LIGHT'} or obj.name.startswith('__preview'):
            remove(obj)


# ── Экспорт ──────────────────────────────────────────────────────────────────


def export_glb(path: Path | str, root: bpy.types.Object, image_format: str = 'WEBP', quality: int = 88, compress: bool = True) -> None:
    """Экспорт иерархии root в GLB: extras (разметка rig), WebP-текстуры, meshopt-сжатие."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    for o in bpy.context.scene.objects:
        o.select_set(False)
    stack = [root]
    while stack:
        o = stack.pop()
        o.select_set(True)
        stack.extend(o.children)
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format='GLB',
        use_selection=True,
        export_extras=True,
        export_yup=True,
        export_apply=True,
        export_image_format=image_format,
        export_image_quality=quality,
        export_jpeg_quality=quality,
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_materials='EXPORT',
        export_cameras=False,
        export_lights=False,
        export_animation_mode='ACTIONS',
        export_meshopt_compression_enable=compress,
    )
