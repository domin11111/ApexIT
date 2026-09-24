import { BoxGeometry, CylinderGeometry, ExtrudeGeometry, Group, Mesh, Object3D, Shape, type BufferGeometry, type Material } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildTraceGeometry, createTraceMaterial } from '../../traces';
import { stickerLabel, type LabelLine } from '../labels';
import type { MaterialKit } from '../materials';
import { box, group, instanced, mark, range, type Placement } from './parts';

const HALF_W = 1;
const HALF_H = 0.22;
const THICKNESS = 0.024;
const SURFACE = THICKNESS / 2;

/** Контур DDR5 RDIMM: ключ почти по центру снизу и боковые выемки фиксаторов. */
function outline(): Shape {
  const s = new Shape();
  s.moveTo(-HALF_W, -HALF_H);
  s.lineTo(-0.005, -HALF_H);
  s.lineTo(-0.005, -HALF_H + 0.05);
  s.lineTo(0.035, -HALF_H + 0.05);
  s.lineTo(0.035, -HALF_H);
  s.lineTo(HALF_W, -HALF_H);
  s.lineTo(HALF_W, -0.02);
  s.lineTo(HALF_W - 0.035, -0.02);
  s.lineTo(HALF_W - 0.035, 0.03);
  s.lineTo(HALF_W, 0.03);
  s.lineTo(HALF_W, HALF_H);
  s.lineTo(-HALF_W, HALF_H);
  s.lineTo(-HALF_W, 0.03);
  s.lineTo(-HALF_W + 0.035, 0.03);
  s.lineTo(-HALF_W + 0.035, -0.02);
  s.lineTo(-HALF_W, -0.02);
  s.closePath();
  return s;
}

function pcbGeometry(): BufferGeometry {
  const geometry = new ExtrudeGeometry(outline(), { depth: THICKNESS, bevelEnabled: false });
  geometry.translate(0, 0, -THICKNESS / 2);
  return geometry;
}

const STACK_X = [-0.87, -0.7, -0.53, -0.36, -0.19, 0.19, 0.36, 0.53, 0.7, 0.87];
const STACK_Y = 0.02;
const LAYERS = 8;
const LAYER_GAP = 0.028;
const TSV = [-0.04, 0, 0.04].flatMap((x) => [-0.025, 0.025].map((y) => [x, y] as const));

/**
 * Одна сторона модуля (лицевая или обратная): 10 стеков 3DS.
 * Каждый слой кристаллов всех стеков — один InstancedMesh, поэтому разлёт слоя двигает
 * его целиком, а сторона стоит ~11 вызовов отрисовки вместо ~150.
 * Узел стороны смотрит локальной осью +Z от платы наружу.
 */
function side(name: string, kit: MaterialKit, tsvMaterial: Material): Group {
  const node = group(new Group(), name, []);
  const die = new BoxGeometry(0.128, 0.1, 0.0028);
  for (let layer = 0; layer < LAYERS; layer++) {
    const slab = instanced(
      `${name}_layer_${layer}`,
      die,
      kit.silicon,
      STACK_X.map((x) => ({ position: [x, STACK_Y, 0.003 + layer * 0.0034] })),
    );
    node.add(mark(slab, { explode: [0, 0, layer * LAYER_GAP], explodeRange: [0.25, 1] }));
  }

  // Нити TSV: геометрия начинается у платы и растёт наружу вместе с масштабом узла
  const thread = new CylinderGeometry(0.0022, 0.0022, 0.03, 6);
  thread.rotateX(Math.PI / 2);
  thread.translate(0, 0, 0.015);
  const threads = instanced(
    `${name}_tsv`,
    thread,
    tsvMaterial,
    STACK_X.flatMap((x) => TSV.map(([dx, dy]): Placement => ({ position: [x + dx, STACK_Y + dy, 0] }))),
  );
  node.add(mark(threads, { explodeScale: [1, 1, 8.2], explodeRange: [0.25, 1], glow: 'tsv', glowMax: 5 }));

  const molds = instanced(
    `${name}_mold`,
    new BoxGeometry(0.15, 0.12, 0.032),
    kit.mold,
    STACK_X.map((x) => ({ position: [x, STACK_Y, 0.016] })),
  );
  node.add(mark(molds, { explode: [0, 0, 0.42], explodeRange: [0, 0.55] }));
  return node;
}

/**
 * Модуль DDR5 RDIMM 288-pin: плата в плоскости XY (x — длина, y — высота), лицевая сторона — z > 0.
 * Узлы: pcb, dram_stack_N (якоря хотспотов: 0–9 лицевые, 10–19 обратные), rcd, pmic, spd, contacts, edge.
 */
export function buildRdimm(kit: MaterialKit, marking: LabelLine[] = []): Group {
  const root = group(new Group(), 'rdimm', []);

  const pcb = new Mesh(pcbGeometry(), kit.pcb);
  pcb.name = 'pcb';
  root.add(pcb);

  const tsvMaterial = kit.glow();
  const front = side('front', kit, tsvMaterial);
  front.position.z = SURFACE;
  const back = side('back', kit, tsvMaterial);
  back.position.z = -SURFACE;
  back.rotation.y = Math.PI;
  root.add(front, back);

  // Пустые якоря для хотспотов — по одному на стек
  STACK_X.forEach((x, i) => {
    const frontAnchor = new Object3D();
    frontAnchor.name = `dram_stack_${i}`;
    frontAnchor.position.set(x, STACK_Y, SURFACE + 0.02);
    const backAnchor = new Object3D();
    backAnchor.name = `dram_stack_${i + STACK_X.length}`;
    backAnchor.position.set(x, STACK_Y, -SURFACE - 0.02);
    root.add(frontAnchor, backAnchor);
  });

  root.add(box('rcd', [0.1, 0.09, 0.012], kit.mold, [0, STACK_Y, SURFACE + 0.006]));
  root.add(
    group(new Group(), 'pmic', [
      box('pmic_chip', [0.07, 0.05, 0.01], kit.mold, [0.78, 0.165, SURFACE + 0.005]),
      box('pmic_inductor_0', [0.045, 0.045, 0.02], kit.darkMetal, [0.66, 0.165, SURFACE + 0.01]),
      box('pmic_inductor_1', [0.045, 0.045, 0.02], kit.darkMetal, [0.9, 0.165, SURFACE + 0.01]),
    ]),
  );
  root.add(box('spd', [0.035, 0.03, 0.006], kit.mold, [-0.1, 0.17, SURFACE + 0.003]));

  const sticker = marking.length > 0 ? stickerLabel('sticker', marking, [0.52, 0.07]) : null;
  sticker?.position.set(-0.6, 0.175, SURFACE + 0.0006);
  if (sticker) root.add(sticker);

  const passives: Placement[] = [];
  for (const x of range(-0.9, 0.5, 0.07)) {
    passives.push({ position: [x, 0.12, SURFACE + 0.004] }, { position: [x, 0.12, -SURFACE - 0.004] });
  }
  root.add(instanced('passives', new BoxGeometry(0.018, 0.01, 0.008), kit.ceramic, passives));

  // 288 позолоченных контактов: по 144 на сторону, с разрывом под ключ
  const fingers: Placement[] = [];
  const pitch = 1.9 / 146;
  for (let i = 0; i < 146 && fingers.length < 288; i++) {
    const x = -0.95 + pitch * (i + 0.5);
    if (x > -0.02 && x < 0.05) continue;
    fingers.push({ position: [x, -HALF_H + 0.028, SURFACE + 0.0006] }, { position: [x, -HALF_H + 0.028, -SURFACE - 0.0006] });
  }
  root.add(instanced('contacts', new BoxGeometry(pitch * 0.68, 0.052, 0.0012), kit.gold, fingers));

  // Светящаяся кромка вдоль верхнего края — «яркий» модуль в сравнении энергопотребления
  const edgeMaterial = createTraceMaterial({ color: kit.accent, intensity: 0, spacing: 0.9, speed: 0.5 });
  const edgeGeometry = buildTraceGeometry([[[-0.96, 0], [0.96, 0]]], 0.006, 4);
  edgeGeometry.rotateX(Math.PI / 2);
  const edges = [SURFACE + 0.0008, -SURFACE - 0.0008].map((z, i) => {
    const edge = new Mesh(edgeGeometry, edgeMaterial);
    edge.name = `edge_${i}`;
    edge.position.set(0, HALF_H - 0.012, z);
    return edge;
  });
  root.add(mark(group(new Group(), 'edge', edges), { glow: 'edge', glowMax: 1 }));

  return root;
}

/**
 * Облегчённый модуль (3 вызова отрисовки): статисты сцен — «четыре модуля по 128 ГБ»
 * и заполнение слотов на схеме платы. dim — тусклый вариант.
 */
export function buildRdimmSimple(kit: MaterialKit, { dim = false }: { dim?: boolean } = {}): Group {
  const root = group(new Group(), 'rdimm_simple', []);
  const pcb = new Mesh(pcbGeometry(), dim ? kit.dimPcb : kit.pcb);
  pcb.name = 'pcb';

  const chip = new BoxGeometry(0.15, 0.12, 0.03);
  const chips = mergeGeometries(
    STACK_X.flatMap((x) =>
      [SURFACE + 0.015, -SURFACE - 0.015].map((z) => chip.clone().translate(x, STACK_Y, z)),
    ),
  );
  const packages = new Mesh(chips, dim ? kit.dimMold : kit.mold);
  packages.name = 'packages';

  const fingers = new Mesh(new BoxGeometry(1.9, 0.052, THICKNESS + 0.003), dim ? kit.dimMold : kit.gold);
  fingers.name = 'contacts';
  fingers.position.y = -HALF_H + 0.028;

  root.add(pcb, packages, fingers);
  return root;
}
