import { Box3, Group, Mesh, Vector3, type Object3D } from 'three';

type Vec3Tuple = [number, number, number];

/**
 * Манифест готовой модели (GLB от стороннего автора): как привести её к контракту rig.
 * Хранится рядом с ассетом (Asset.meta), в админке будет редактироваться визуально.
 */
export type ModelManifest = {
  /** Поворот к нашей системе координат, градусы */
  rotation?: Vec3Tuple;
  /** Наш узел → имя узла в GLB: при загрузке узел переименовывается (для хотспотов) */
  nodes?: Record<string, string>;
  /** Разметка rig по нашим именам узлов; смещения — в локальных единицах родителя узла */
  rig?: Record<
    string,
    {
      explode?: Vec3Tuple;
      explodeScale?: Vec3Tuple;
      explodeRange?: [number, number];
      glow?: string;
      glowMax?: number;
      spin?: 'x' | 'y' | 'z';
    }
  >;
  /** Автор и лицензия — выводятся в титрах (CC-BY требует указания автора) */
  credit?: { author: string; url: string; license: string };
};

/**
 * Готовит загруженную сцену GLB: клонирует (кэш useGLTF общий), приводит к нашим осям и масштабу
 * (наибольший габарит = 2, центр в начале координат), переименовывает и размечает узлы.
 */
export function prepareGlb(scene: Object3D, manifest: ModelManifest = {}): Group {
  const model = scene.clone(true);
  // Материалы клонируем: подсветка одного экземпляра не должна задевать другие
  model.traverse((node) => {
    if (node instanceof Mesh) node.material = Array.isArray(node.material) ? node.material.map((m) => m.clone()) : node.material.clone();
  });

  if (manifest.rotation) {
    const [x, y, z] = manifest.rotation.map((deg) => (deg * Math.PI) / 180) as Vec3Tuple;
    model.rotation.set(x, y, z);
  }
  model.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(model);
  const size = bounds.getSize(new Vector3());
  const scale = 2 / Math.max(size.x, size.y, size.z, 1e-6);
  model.scale.multiplyScalar(scale);
  model.position.sub(bounds.getCenter(new Vector3()).multiplyScalar(scale));

  const root = new Group();
  root.name = 'glb';
  root.add(model);

  for (const [ours, theirs] of Object.entries(manifest.nodes ?? {})) {
    const node = root.getObjectByName(theirs);
    if (node) node.name = ours;
  }
  for (const [name, markup] of Object.entries(manifest.rig ?? {})) {
    const node = root.getObjectByName(name);
    if (node) Object.assign(node.userData, markup);
  }
  return root;
}
