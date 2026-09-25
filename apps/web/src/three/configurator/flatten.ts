import {
  BufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Texture,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Часть «запечённой» модели: вся геометрия одного материала в координатах модели. */
export type FlatPart = { geometry: BufferGeometry; material: Material };

/** Приводит геометрию к общему виду для слияния: без индекса, только position / normal / uv. */
function normalize(geometry: BufferGeometry, matrix: Matrix4): BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  for (const name of Object.keys(flat.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') flat.deleteAttribute(name);
  }
  if (!flat.getAttribute('normal')) flat.computeVertexNormals();
  if (!flat.getAttribute('uv')) flat.setAttribute('uv', new BufferAttribute(new Float32Array(flat.getAttribute('position').count * 2), 2));
  flat.clearGroups();
  return flat.applyMatrix4(matrix);
}

/**
 * Модель → по одной геометрии на материал с «запечёнными» трансформациями.
 * Так десятки одинаковых компонентов (32 модуля памяти, 8 видеокарт) рисуются через InstancedMesh:
 * draw calls = число материалов модели, а не число деталей × число копий.
 * Материалы с собственными шейдерами (светящиеся трассы) пропускаются — им нужны свои атрибуты.
 */
export function flattenByMaterial(root: Object3D): FlatPart[] {
  root.updateMatrixWorld(true);
  const buckets = new Map<Material, BufferGeometry[]>();
  const instanceMatrix = new Matrix4();
  const world = new Matrix4();

  root.traverse((node) => {
    if (!(node instanceof Mesh) || !node.visible || Array.isArray(node.material)) return;
    const material = node.material as Material;
    if (!(material instanceof MeshStandardMaterial)) return;

    const list = buckets.get(material) ?? [];
    if (node instanceof InstancedMesh) {
      for (let i = 0; i < node.count; i++) {
        node.getMatrixAt(i, instanceMatrix);
        list.push(normalize(node.geometry, world.multiplyMatrices(node.matrixWorld, instanceMatrix)));
      }
    } else {
      list.push(normalize(node.geometry, node.matrixWorld));
    }
    buckets.set(material, list);
  });

  const parts: FlatPart[] = [];
  for (const [material, geometries] of buckets) {
    const merged = mergeGeometries(geometries, false);
    for (const geometry of geometries) geometry.dispose();
    if (merged) {
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      parts.push({ geometry: merged, material });
    }
  }
  return parts;
}

/**
 * Освобождает запечённые части. Текстуры GLB принадлежат общему кэшу загрузчика
 * (их использует и страница продукта) — для них textures: false.
 */
export function disposeParts(parts: readonly FlatPart[], { textures = true }: { textures?: boolean } = {}): void {
  for (const { geometry, material } of parts) {
    geometry.dispose();
    if (textures) {
      for (const value of Object.values(material)) {
        if (value instanceof Texture) value.dispose();
      }
    }
    material.dispose();
  }
}

/** Освобождает исходную модель после запекания: геометрии и материалы, не попавшие в запечённые части. */
export function disposeSource(root: Object3D, parts: readonly FlatPart[]): void {
  const kept = new Set(parts.map((part) => part.material));
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    node.geometry.dispose();
    const materials: Material[] = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (!kept.has(material)) material.dispose();
    }
  });
}
