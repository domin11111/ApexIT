import { BoxGeometry, CylinderGeometry, ExtrudeGeometry, Group, Mesh, Path, Shape, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { engravedLabel, type LabelLine } from '../labels';
import type { MaterialKit } from '../materials';
import { coreGridTexture } from '../textures';
import { box, group, instanced, mark, range, rounded, type Placement } from './parts';

// Габариты корпуса: x — длина (брекет на x = −1), y — высота (разъём PCIe снизу), z — толщина
const BODY = { x0: -0.97, x1: 1, y0: -0.4, y1: 0.45, z: 0.26 };
const FANS = [
  { name: 'fan_0', x: -0.45 },
  { name: 'fan_1', x: 0.52 },
] as const;
const FAN_Y = 0.02;
const FAN_R = 0.3;

function roundedRect(shape: Shape | Path, x0: number, y0: number, x1: number, y1: number, r: number) {
  shape.moveTo(x0 + r, y0);
  shape.lineTo(x1 - r, y0);
  shape.quadraticCurveTo(x1, y0, x1, y0 + r);
  shape.lineTo(x1, y1 - r);
  shape.quadraticCurveTo(x1, y1, x1 - r, y1);
  shape.lineTo(x0 + r, y1);
  shape.quadraticCurveTo(x0, y1, x0, y1 - r);
  shape.lineTo(x0, y0 + r);
  shape.quadraticCurveTo(x0, y0, x0 + r, y0);
}

/** Лицевая панель кожуха с двумя отверстиями под вентиляторы (сквозной продув). */
function frontPlate(): BufferGeometry {
  const shape = new Shape();
  roundedRect(shape, BODY.x0, BODY.y0, BODY.x1, BODY.y1, 0.05);
  for (const fan of FANS) {
    const hole = new Path();
    hole.absarc(fan.x, FAN_Y, FAN_R, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  const geometry = new ExtrudeGeometry(shape, {
    depth: 0.022,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.004,
    bevelSegments: 2,
    curveSegments: 48,
  });
  geometry.translate(0, 0, BODY.z / 2 - 0.026);
  return geometry;
}

/** Крыльчатка: ступица + 9 лопастей с наклоном, одной геометрией. */
function fanGeometry(): BufferGeometry {
  const hub = new CylinderGeometry(0.075, 0.075, 0.03, 32);
  hub.rotateX(Math.PI / 2);
  const blades: BufferGeometry[] = [hub];
  for (let i = 0; i < 9; i++) {
    const blade = new BoxGeometry(0.2, 0.075, 0.005);
    blade.rotateX(0.55); // шаг лопасти
    blade.translate(0.175, 0, 0);
    blade.rotateZ((i / 9) * Math.PI * 2);
    blades.push(blade);
  }
  return mergeGeometries(blades.map((g) => g.toNonIndexed()));
}

/**
 * Профессиональная видеокарта двухслотового исполнения.
 * Узлы: shroud (кожух + вентиляторы fan_0/fan_1 + световая полоса), backplate, heatsink,
 * pcb, gpu_die, vram (vram_0…15), pcie_edge, io_bracket, power.
 */
export function buildGpu(kit: MaterialKit, marking: LabelLine[] = []): Group {
  const root = group(new Group(), 'gpu', []);
  const bodyW = BODY.x1 - BODY.x0;
  const bodyH = BODY.y1 - BODY.y0;
  const cx = (BODY.x0 + BODY.x1) / 2;
  const cy = (BODY.y0 + BODY.y1) / 2;

  // ── Кожух: уходит к зрителю и вверх в разобранном виде ─────────────────────
  const plate = new Mesh(frontPlate(), kit.darkMetal);
  plate.name = 'shroud_plate';

  const fanMesh = fanGeometry();
  const fans = FANS.map((fan) => {
    const rotor = mark(new Mesh(fanMesh, kit.plastic), { spin: 'z' });
    rotor.name = `${fan.name}_rotor`;
    const node = group(new Group(), fan.name, [rotor]);
    node.position.set(fan.x, FAN_Y, BODY.z / 2 - 0.035);
    return node;
  });

  const rails = [
    box('shroud_rail_top', [bodyW, 0.03, BODY.z - 0.03], kit.darkMetal, [cx, BODY.y1 - 0.015, 0]),
    box('shroud_rail_bottom', [bodyW, 0.03, BODY.z - 0.03], kit.darkMetal, [cx, BODY.y0 + 0.015, 0]),
    box('shroud_rail_end', [0.03, bodyH, BODY.z - 0.03], kit.darkMetal, [BODY.x1 - 0.015, cy, 0]),
  ];
  const lightbar = mark(box('lightbar', [1.5, 0.01, 0.004], kit.glow(), [cx + 0.05, BODY.y1 - 0.045, BODY.z / 2 + 0.001]), {
    glow: 'lightbar',
    glowMax: 6,
  });
  // Шильдик на нижней полосе лицевой панели, под вентиляторами
  const badge = marking.length > 0 ? engravedLabel('shroud_marking', marking, [0.95, 0.09], { opacity: 0.75, roughness: 0.4 }) : null;
  badge?.position.set(cx, BODY.y0 + 0.06, BODY.z / 2 + 0.001);

  root.add(
    // Кожух уходит вверх и чуть вперёд — открывает плату фронтальной камере, а не заслоняет её
    mark(group(new Group(), 'shroud', [plate, ...fans, ...rails, lightbar, ...(badge ? [badge] : [])]), {
      explode: [0, 1.05, 0.3],
      explodeRange: [0, 0.6],
    }),
  );

  // ── Тыльная пластина ──────────────────────────────────────────────────────
  root.add(
    mark(group(new Group(), 'backplate', [rounded('backplate_plate', [bodyW, bodyH, 0.018], 0.03, kit.darkMetal, [cx, cy, -BODY.z / 2 + 0.009])]), {
      explode: [0, 0, -0.45],
      explodeRange: [0, 0.6],
    }),
  );

  // ── Радиатор: рёбра видны сквозь вентиляторы ───────────────────────────────
  const fins: Placement[] = range(-0.88, 0.9, 0.024).map((x) => ({ position: [x, cy + 0.01, 0.035] }));
  root.add(
    mark(group(new Group(), 'heatsink', [instanced('heatsink_fins', new BoxGeometry(0.005, bodyH - 0.12, 0.13), kit.aluminum, fins)]), {
      explode: [0, 0.55, 0.15],
      explodeRange: [0.1, 0.7],
    }),
  );

  // ── Плата, кристалл и видеопамять ──────────────────────────────────────────
  const pcbZ = -0.055;
  const face = pcbZ + 0.008;
  root.add(box('pcb', [1.75, 0.76, 0.016], kit.pcb, [-0.05, -0.02, pcbZ]));
  root.add(box('gpu_package', [0.42, 0.38, 0.008], kit.substrate, [0.05, 0.02, face + 0.004]));
  root.add(mark(box('gpu_die', [0.26, 0.22, 0.012], kit.die(coreGridTexture(12, 8)), [0.05, 0.02, face + 0.014]), { glow: 'die', glowMax: 4 }));

  const vramPositions: Array<[number, number]> = [
    ...[-0.2, -0.07, 0.05, 0.17, 0.3].map((x): [number, number] => [x, 0.31]),
    ...[-0.2, -0.07, 0.05, 0.17, 0.3].map((x): [number, number] => [x, -0.27]),
    ...[-0.08, 0.02, 0.12].map((y): [number, number] => [-0.28, y]),
    ...[-0.08, 0.02, 0.12].map((y): [number, number] => [0.38, y]),
  ];
  const vramMaterial = kit.die(null);
  root.add(
    mark(
      group(
        new Group(),
        'vram',
        vramPositions.map(([x, y], i) => box(`vram_${i}`, [0.075, 0.065, 0.01], vramMaterial, [x, y, face + 0.005])),
      ),
      { glow: 'vram', glowMax: 2.5 },
    ),
  );

  // ── Разъём PCIe x16: язычок платы с позолоченными ламелями ─────────────────
  const fingers: Placement[] = [];
  for (const x of range(-0.6, 0.24, 0.0105)) {
    fingers.push({ position: [x, -0.44, pcbZ + 0.0085] }, { position: [x, -0.44, pcbZ - 0.0085] });
  }
  root.add(
    group(new Group(), 'pcie_edge', [
      box('pcie_tongue', [0.86, 0.08, 0.016], kit.pcb, [-0.18, -0.44, pcbZ]),
      instanced('pcie_fingers', new BoxGeometry(0.007, 0.055, 0.001), kit.gold, fingers),
    ]),
  );

  // ── Брекет с четырьмя DisplayPort 2.1b ─────────────────────────────────────
  root.add(
    group(new Group(), 'io_bracket', [
      box('bracket_plate', [0.018, 0.94, 0.3], kit.aluminum, [-0.99, 0.02, 0]),
      ...[0.26, 0.11, -0.04, -0.19].map((y, i) => box(`displayport_${i}`, [0.03, 0.085, 0.05], kit.plastic, [-1.005, y, -0.04])),
    ]),
  );

  root.add(box('power', [0.1, 0.035, 0.05], kit.plastic, [0.6, BODY.y1 + 0.017, -0.02]));

  return root;
}
