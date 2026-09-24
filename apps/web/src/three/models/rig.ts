import { Mesh, Texture, Vector3, type Material, type Object3D } from 'three';

/*
 * Контракт 3D-модели — одинаковый для процедурных моделей и GLB от 3D-художника
 * (в glTF поля задаются через extras узлов и попадают в userData):
 *
 *  node.name                      узел для хотспота (Hotspot.anchorNode): ihs, ccd_0, vram, fan_0 …
 *  userData.explode = [x, y, z]   смещение при explode = 1 (exploded view)
 *  userData.explodeScale = [x,y,z] масштаб при explode = 1 (например, растущие нити TSV)
 *  userData.explodeRange = [a, b] на каком отрезке общего explode двигается узел — для очерёдности
 *  userData.glow = 'ccd.3'        канал подсветки; уровень берётся из controls.glow['ccd.3'] или ['ccd']
 *  userData.glowMax = 3           яркость при уровне 1
 *  userData.spin = 'x' | 'y' | 'z' узел вращается со скоростью controls.spin (рад/с) — вентиляторы
 *
 * Сцена управляет моделью только через RigControls, поэтому замена процедурной модели на GLB
 * не требует правок сцены.
 */

export type RigControls = {
  /** 0 — собрано, 1 — полностью разобрано */
  explode: number;
  /** Уровни подсветки по каналам, 0…1 */
  glow: Record<string, number>;
  /** Скорость вращения, рад/с */
  spin: number;
};

export const createRigControls = (init: Partial<RigControls> = {}): RigControls => ({
  explode: 0,
  glow: {},
  spin: 0,
  ...init,
});

type Axis = 'x' | 'y' | 'z';
type ExplodePart = {
  node: Object3D;
  basePosition: Vector3;
  offset: Vector3 | null;
  baseScale: Vector3;
  targetScale: Vector3 | null;
  range: [number, number];
};
type GlowPart = { material: Material; channel: string; max: number };
type SpinPart = { node: Object3D; axis: Axis };

export type Rig = { explode: ExplodePart[]; glow: GlowPart[]; spin: SpinPart[] };

const vec = (value: unknown): Vector3 | null =>
  Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === 'number')
    ? new Vector3(value[0], value[1], value[2])
    : null;

const isAxis = (value: unknown): value is Axis => value === 'x' || value === 'y' || value === 'z';

/** Один раз обходит модель и запоминает узлы с разметкой userData. */
export function collectRig(root: Object3D): Rig {
  const rig: Rig = { explode: [], glow: [], spin: [] };

  root.traverse((node) => {
    const data = node.userData;
    const offset = vec(data.explode);
    const targetScale = vec(data.explodeScale);
    if (offset || targetScale) {
      const range: [number, number] = Array.isArray(data.explodeRange)
        ? [Number(data.explodeRange[0] ?? 0), Number(data.explodeRange[1] ?? 1)]
        : [0, 1];
      rig.explode.push({
        node,
        basePosition: node.position.clone(),
        offset,
        baseScale: node.scale.clone(),
        targetScale,
        range,
      });
    }

    if (typeof data.glow === 'string') {
      const max = typeof data.glowMax === 'number' ? data.glowMax : 3;
      node.traverse((child) => {
        if (!(child instanceof Mesh)) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) rig.glow.push({ material, channel: data.glow as string, max });
      });
    }

    if (isAxis(data.spin)) rig.spin.push({ node, axis: data.spin });
  });

  return rig;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** Уровень канала: точное совпадение ('ccd.3'), иначе групповой ('ccd'). */
export function glowLevel(levels: Record<string, number>, channel: string): number {
  return levels[channel] ?? levels[channel.split('.')[0] ?? ''] ?? 0;
}

function setGlow(material: Material, value: number) {
  if ('emissiveIntensity' in material && typeof material.emissiveIntensity === 'number') {
    material.emissiveIntensity = value;
  } else if ('uniforms' in material) {
    const uniforms = (material as Material & { uniforms: Record<string, { value: unknown }> }).uniforms;
    if (uniforms.uIntensity) uniforms.uIntensity.value = value;
  }
}

/** Применяет controls к модели. Вызывается в useFrame. */
export function applyRig(rig: Rig, controls: RigControls, delta: number): void {
  for (const part of rig.explode) {
    const [from, to] = part.range;
    const t = smooth(clamp01((controls.explode - from) / Math.max(1e-6, to - from)));
    if (part.offset) part.node.position.copy(part.basePosition).addScaledVector(part.offset, t);
    if (part.targetScale) part.node.scale.copy(part.baseScale).lerp(part.targetScale, t);
  }

  for (const part of rig.glow) setGlow(part.material, glowLevel(controls.glow, part.channel) * part.max);

  if (controls.spin !== 0) {
    for (const part of rig.spin) part.node.rotation[part.axis] += controls.spin * delta;
  }
}

/** Все имена узлов модели — для проверки хотспотов и отладки. */
export function nodeNames(root: Object3D): Set<string> {
  const names = new Set<string>();
  root.traverse((node) => {
    if (node.name) names.add(node.name);
  });
  return names;
}

/** Освобождает геометрии, материалы и текстуры модели. */
export function disposeModel(root: Object3D): void {
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    node.geometry.dispose();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof Texture) value.dispose();
      }
      material.dispose();
    }
  });
}
