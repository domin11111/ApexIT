"""
После пересборки моделей: python tools/blender/sync_collection.py

Обновляет в packages/collection/src/products/*.ts поля model.sizeBytes, mobileSizeBytes и triangles
по файлам apps/web/public/models и отчётам сборки (.build/<имя>.anchors.json). Тест
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


def main() -> None:
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
            path.write_text(text.replace(match[0], line), encoding='utf-8')
            print(f'{path.name}: {line}')
        else:
            print(f'{path.name}: без изменений')


main()
