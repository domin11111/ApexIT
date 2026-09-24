import {
  BoxGeometry,
  Euler,
  InstancedMesh,
  Matrix4,
  Mesh,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** Координаты и размеры — в пространстве модели (наибольший габарит = 2, Y вверх). */
type Vec3Tuple = [number, number, number];

export function box(name: string, [w, h, d]: Vec3Tuple, material: Material, position: Vec3Tuple = [0, 0, 0]): Mesh {
  const mesh = new Mesh(new BoxGeometry(w, h, d), material);
  mesh.name = name;
  mesh.position.set(...position);
  return mesh;
}

export function rounded(
  name: string,
  [w, h, d]: Vec3Tuple,
  radius: number,
  material: Material,
  position: Vec3Tuple = [0, 0, 0],
  segments = 3,
): Mesh {
  const mesh = new Mesh(new RoundedBoxGeometry(w, h, d, segments, radius), material);
  mesh.name = name;
  mesh.position.set(...position);
  return mesh;
}

export type Placement = { position: Vec3Tuple; rotation?: Vec3Tuple; scale?: Vec3Tuple };

/** Много одинаковых мелких деталей (контакты, конденсаторы, рёбра радиатора) — один draw call. */
export function instanced(name: string, geometry: BufferGeometry, material: Material, placements: Placement[]): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, placements.length);
  mesh.name = name;
  const matrix = new Matrix4();
  const quaternion = new Quaternion();
  const euler = new Euler();
  const position = new Vector3();
  const scale = new Vector3();
  placements.forEach((placement, i) => {
    quaternion.setFromEuler(euler.set(...(placement.rotation ?? [0, 0, 0])));
    matrix.compose(position.set(...placement.position), quaternion, scale.set(...(placement.scale ?? [1, 1, 1])));
    mesh.setMatrixAt(i, matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

/** Разметка узла для rig (см. rig.ts). */
export function mark<T extends Object3D>(
  node: T,
  data: {
    explode?: Vec3Tuple;
    explodeScale?: Vec3Tuple;
    explodeRange?: [number, number];
    glow?: string;
    glowMax?: number;
    spin?: 'x' | 'y' | 'z';
  },
): T {
  Object.assign(node.userData, data);
  return node;
}

export function range(from: number, to: number, step: number): number[] {
  const values: number[] = [];
  for (let v = from; v <= to + 1e-9; v += step) values.push(Math.round(v * 1e4) / 1e4);
  return values;
}

export function group<T extends Object3D>(root: T, name: string, children: Object3D[]): T {
  root.name = name;
  if (children.length > 0) root.add(...children);
  return root;
}
