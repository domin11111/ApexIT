import { BoxGeometry, Group, Mesh } from 'three';
import { buildTraceGeometry, createTraceMaterial, generateTraces, rectPath } from '../../traces';
import { engravedLabel, type LabelLine } from '../labels';
import type { MaterialKit } from '../materials';
import { coreGridTexture, ioDieTexture } from '../textures';
import { box, group, instanced, mark, range, rounded, type Placement } from './parts';

export type CpuVariant = 'SP5' | 'SP7';

type Die = { x: number; z: number; w: number; d: number };
type Layout = {
  width: number;
  depth: number;
  ccds: Die[];
  iods: Die[];
  /** Сетка ядер на чиплете: [колонки, ряды] */
  cores: [number, number];
};

const grid = (xs: number[], zs: number[], w: number, d: number): Die[] =>
  zs.flatMap((z) => xs.map((x) => ({ x, z, w, d })));

/**
 * SP7 (EPYC 9006 «Venice»): 8 чиплетов Zen 6c по 32 ядра и два I/O-кристалла.
 * SP5 (EPYC 9005 «Turin Dense»): 12 чиплетов Zen 5c по 16 ядер и один I/O-кристалл.
 * Порядок ccd_N — слева направо, сверху вниз: так сцена 2 подсвечивает их по очереди.
 */
const LAYOUTS: Record<CpuVariant, Layout> = {
  SP7: {
    width: 2,
    depth: 1.8,
    iods: [
      { x: 0, z: -0.19, w: 0.5, d: 0.34 },
      { x: 0, z: 0.19, w: 0.5, d: 0.34 },
    ],
    ccds: [...grid([-0.69, -0.43], [-0.2, 0.2], 0.22, 0.36), ...grid([0.43, 0.69], [-0.2, 0.2], 0.22, 0.36)],
    cores: [4, 8],
  },
  SP5: {
    width: 1.92,
    depth: 1.84,
    iods: [{ x: 0, z: 0, w: 0.46, d: 0.72 }],
    ccds: [...grid([-0.66, -0.44], [-0.5, 0, 0.5], 0.18, 0.32), ...grid([0.44, 0.66], [-0.5, 0, 0.5], 0.18, 0.32)],
    cores: [4, 4],
  },
};

export const CPU_CCD_COUNT: Record<CpuVariant, number> = { SP5: 12, SP7: 8 };

/**
 * Серверный процессор: подложка в плоскости XZ (верх на y = 0), крышка IHS над кристаллами,
 * контактные площадки LGA снизу. Узлы: substrate, ihs, ccd_N, iod_N, caps, contacts, traces.
 */
export function buildCpu(variant: CpuVariant, kit: MaterialKit, marking: LabelLine[] = []): Group {
  const { width, depth, ccds, iods, cores } = LAYOUTS[variant];
  const root = new Group();
  root.name = `cpu_${variant.toLowerCase()}`;

  // ── Подложка ───────────────────────────────────────────────────────────────
  root.add(rounded('substrate', [width, 0.06, depth], 0.015, kit.substrate, [0, -0.03, 0], 2));

  // ── Кристаллы: поднимаются, когда крышка уже ушла ──────────────────────────
  const coreTexture = coreGridTexture(...cores);
  const ioTexture = ioDieTexture();
  const dies = mark(group(new Group(), 'dies', []), { explode: [0, 0.14, 0], explodeRange: [0.45, 1] });
  ccds.forEach((die, i) => {
    const mesh = new Mesh(new BoxGeometry(die.w, 0.02, die.d), kit.die(coreTexture));
    mesh.name = `ccd_${i}`;
    mesh.position.set(die.x, 0.012, die.z);
    dies.add(mark(mesh, { glow: `ccd.${i}`, glowMax: 4 }));
  });
  iods.forEach((die, i) => {
    const mesh = new Mesh(new BoxGeometry(die.w, 0.02, die.d), kit.die(ioTexture));
    mesh.name = `iod_${i}`;
    mesh.position.set(die.x, 0.012, die.z);
    dies.add(mark(mesh, { glow: `iod.${i}`, glowMax: 3 }));
  });
  root.add(dies);

  // ── Конденсаторы вокруг кристаллов ─────────────────────────────────────────
  const caps: Placement[] = [];
  const edgeZ = depth / 2 - 0.26;
  for (const x of range(-width / 2 + 0.3, width / 2 - 0.3, 0.05)) {
    caps.push({ position: [x, 0.006, -edgeZ] }, { position: [x, 0.006, edgeZ] });
  }
  const iodEdge = Math.max(...iods.map((d) => d.x + d.w / 2)) + 0.045;
  for (const z of range(-0.36, 0.36, 0.06)) {
    caps.push({ position: [-iodEdge, 0.006, z], rotation: [0, Math.PI / 2, 0] });
    caps.push({ position: [iodEdge, 0.006, z], rotation: [0, Math.PI / 2, 0] });
  }
  root.add(instanced('caps', new BoxGeometry(0.024, 0.012, 0.012), kit.ceramic, caps));

  // ── Трассы на подложке: контур корпуса и разводка от кристаллов ─────────────
  const traceMaterial = createTraceMaterial({ color: kit.accent, intensity: 0, spacing: 1.2, speed: 0.4 });
  const outline = new Mesh(buildTraceGeometry([rectPath(width / 2 - 0.04, depth / 2 - 0.04)], 0.008, 3), traceMaterial);
  const fanout = new Mesh(
    buildTraceGeometry(
      generateTraces({ count: 36, seed: variant === 'SP7' ? 11 : 5, inner: 0.3, outer: 2, bounds: { w: width / 2 - 0.12, d: depth / 2 - 0.12 }, step: 0.08 }),
      0.005,
      9,
    ),
    traceMaterial,
  );
  outline.position.y = fanout.position.y = 0.0015;
  root.add(mark(group(new Group(), 'traces', [outline, fanout]), { glow: 'traces', glowMax: 1 }));

  // ── Крышка IHS: поднимается и уходит в сторону ─────────────────────────────
  const plateW = width - 0.24;
  const plateD = depth - 0.2;
  const skirt = 0.05;
  const ihs = mark(
    group(new Group(), 'ihs', [
      rounded('ihs_plate', [plateW, 0.05, plateD], 0.02, kit.ihs, [0, 0.062, 0]),
      rounded('ihs_plateau', [plateW - 0.26, 0.012, plateD - 0.3], 0.006, kit.ihs, [0, 0.09, 0], 2),
      // «Юбка» по периметру: крышка стоит на подложке, а не на кристаллах
      box('ihs_skirt_n', [plateW, 0.037, skirt], kit.ihs, [0, 0.0185, -plateD / 2 + skirt / 2]),
      box('ihs_skirt_s', [plateW, 0.037, skirt], kit.ihs, [0, 0.0185, plateD / 2 - skirt / 2]),
      box('ihs_skirt_w', [skirt, 0.037, plateD], kit.ihs, [-plateW / 2 + skirt / 2, 0.0185, 0]),
      box('ihs_skirt_e', [skirt, 0.037, plateD], kit.ihs, [plateW / 2 - skirt / 2, 0.0185, 0]),
    ]),
    { explode: [1.25, 0.95, -0.1], explodeRange: [0, 0.7] },
  );
  // Лазерная маркировка на крышке — читается с фронтальной камеры
  const label = marking.length > 0 ? engravedLabel('ihs_marking', marking, [plateW - 0.5, 0.42]) : null;
  if (label) {
    label.rotation.x = -Math.PI / 2;
    label.position.set(0, 0.0968, plateD / 2 - 0.42);
    ihs.add(label);
  }
  root.add(ihs);

  // ── Контактные площадки LGA снизу ──────────────────────────────────────────
  const pads: Placement[] = [];
  for (const x of range(-width / 2 + 0.1, width / 2 - 0.1, 0.03)) {
    for (const z of range(-depth / 2 + 0.1, depth / 2 - 0.1, 0.03)) pads.push({ position: [x, -0.0615, z] });
  }
  root.add(instanced('contacts', new BoxGeometry(0.02, 0.003, 0.02), kit.gold, pads));

  return root;
}
