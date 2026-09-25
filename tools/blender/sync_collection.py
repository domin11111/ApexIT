"""
После пересборки моделей: python tools/blender/sync_collection.py

Обновляет в packages/collection/src/products/*.ts поля model.sizeBytes, mobileSizeBytes и triangles
по файлам apps/web/public/models и отчётам сборки (.build/<имя>.anchors.json), а также раскладку
сцены сборки apps/web/src/three/models/assembly-layout.json (сокет, слоты, опорные точки деталей). Тест
apps/web/src/lib/model-source.test.ts сверяет эти числа с файлами и падает, если синхронизацию забыли.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent.parent
MODELS = REPO / 'apps' / 'web' / 'public' / 'models'
PRODUCTS = REPO / 'packages' / 'collection' / 'src' / 'products'

MODEL_RE = re.compile(r"model: \{ url: '/models/(?P<name>[a-z0-9-]+)\.glb', sizeBytes: \d+, mobileSizeBytes: \d+, triangles: \d+ \}")


LAYOUT = REPO / 'apps' / 'web' / 'src' / 'three' / 'models' / 'assembly-layout.json'


def report(name: str) -> dict:
    return json.loads((ROOT / '.build' / f'{name}.anchors.json').read_text(encoding='utf-8'))


def xz(node: dict) -> list[float]:
    return [node['origin'][0], node['origin'][2]]


def write_layout() -> None:
    """
    Раскладка сцены сборки: координаты сокета, слотов и опорных точек деталей — в нормализованном
    пространстве каждой модели (как после prepareGlb: наибольший габарит = 2, центр в нуле).
    scale — 2 / наибольший габарит в метрах: по нему сцена приводит детали к общему масштабу.
    """
    names = ('board-sp7', 'cpu-epyc-9996-sp7', 'rdimm-micron-512gb', 'rdimm-micron-512gb-lod', 'gpu-rtx-pro-6000-se')
    board, cpu, memory, filler, gpu = (report(n) for n in names)
    nodes, extra = board['nodes'], board['extra']
    layout = {
        'generator': 'tools/blender/sync_collection.py',
        'board': {
            'scale': board['scale'],
            'top': nodes['board']['top'][1],
            'socket': xz(nodes['socket']),
            'dimms': [xz(nodes[f'dimm_slot_{i}']) for i in range(16)],
            'pcie': [xz(nodes[f'pcie_slot_{k}']) for k in range(2)],
            # Габариты в тех же нормализованных единицах: [x, z] рамки сокета, длины слотов
            'socketFrame': [round(v * board['scale'], 4) for v in extra['socketFrame']],
            'dimmLength': round(extra['dimmLength'] * board['scale'], 4),
            'pcieLength': round(extra['pcieLength'] * board['scale'], 4),
        },
        'cpu': {'scale': cpu['scale'], 'contacts': cpu['nodes']['contacts']['origin']},
        'memory': {'scale': memory['scale'], 'contacts': memory['nodes']['contacts']['origin']},
        'filler': {'scale': filler['scale'], 'contacts': filler['nodes']['contacts']['origin']},
        'gpu': {'scale': gpu['scale'], 'fingers': gpu['nodes']['pcie_edge']['origin']},
        'seat': {k: round(v, 5) for k, v in extra['seat'].items()},
    }
    # Числовые массивы — в одну строку, как их оставил бы Prettier
    text = json.dumps(layout, indent=2)
    text = re.sub(r'\[\s+([-\d.,\s]+?)\s+\]', lambda m: '[' + re.sub(r',\s+', ', ', m[1]) + ']', text) + '\n'
    if not LAYOUT.exists() or LAYOUT.read_text(encoding='utf-8') != text:
        LAYOUT.write_bytes(text.encode('utf-8'))
        print(f'{LAYOUT.name}: обновлена')
    else:
        print(f'{LAYOUT.name}: без изменений')


def main() -> None:
    write_layout()
    for path in sorted(PRODUCTS.glob('*.ts')):
        text = path.read_text(encoding='utf-8')
        match = MODEL_RE.search(text)
        if not match:
            continue
        name = match['name']
        desktop = (MODELS / f'{name}.glb').stat().st_size
        mobile = (MODELS / f'{name}-mobile.glb').stat().st_size
        report = ROOT / '.build' / f'{name}.anchors.json'
        triangles = json.loads(report.read_text(encoding='utf-8'))['triangles']
        line = f"model: {{ url: '/models/{name}.glb', sizeBytes: {desktop}, mobileSizeBytes: {mobile}, triangles: {triangles} }}"
        if match[0] != line:
            path.write_bytes(text.replace(match[0], line).encode('utf-8'))  # LF и на Windows
            print(f'{path.name}: {line}')
        else:
            print(f'{path.name}: без изменений')


main()
