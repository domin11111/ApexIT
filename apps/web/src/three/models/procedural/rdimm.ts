import { BoxGeometry, CylinderGeometry, ExtrudeGeometry, Group, Mesh, Shape } from 'three';
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

const STACK_X = [-0.87, -0.7, -0.53, -0.36, -0.19, 0.19, 0.36, 0.53, 0.7, 0.87];
const LAYERS = 8;

/**
 * Стек 3DS: восемь кристаллов DRAM под крышкой из компаунда.
 * В разобранном виде компаунд уходит, слои расходятся, а между ними светятся нити TSV.
 * Локальная ось +Z смотрит от платы наружу.
 */
function dramStack(name: string, kit: MaterialKit, tsvMaterial: Mesh['material']): Group {
  const stack = group(new Group(), name, []);
  for (let layer = 0; layer < LAYERS; layer++) {
    stack.add(
      mark(box(`${name}_die_${layer}`, [0.128, 0.1, 0.0028], kit.silicon, [0, 0, 0.003 + layer * 0.0034]), {
        explode: [0, 0, layer * 0.028],
        explodeRange: [0.25, 1],
      }),
    );
  }

  const tsvGeometry = new CylinderGeometry(0.0022, 0.0022, 0.03, 6);
  tsvGeometry.rotateX(Math.PI / 2);
  tsvGeometry.translate(0, 0, 0.015); // нить растёт от платы
  const tsv = group(new Group(), `${name}_tsv`, []);
  for (const x of [-0.04, 0, 0.04]) {
    for (const y of [-0.025, 0.025]) {
      const thread = new Mesh(tsvGeometry, tsvMaterial);
      thread.position.set(x, y, 0);
      tsv.add(thread);
    }
  }
  stack.add(mark(tsv, { explodeScale: [1, 1, 8.2], explodeRange: [0.25, 1], glow: 'tsv', glowMax: 5 }));

  stack.add(mark(box(`${name}_mold`, [0.15, 0.12, 0.032], kit.mold, [0, 0, 0.016]), { explode: [0, 0, 0.42], explodeRange: [0, 0.55] }));
  return stack;
}

/**
 * Модуль DDR5 RDIMM 288-pin: плата в плоскости XY (x — длина, y — высота), лицевая сторона — z > 0.
 * Узлы: pcb, dram_stack_N (0–9 лицевые, 10–19 обратные), rcd, pmic, spd, contacts.
 */
export function buildRdimm(kit: MaterialKit, marking: LabelLine[] = []): Group {
  const root = group(new Group(), 'rdimm', []);

  const pcbGeometry = new ExtrudeGeometry(outline(), { depth: THICKNESS, bevelEnabled: false });
  pcbGeometry.translate(0, 0, -THICKNESS / 2);
  const pcb = new Mesh(pcbGeometry, kit.pcb);
  pcb.name = 'pcb';
  root.add(pcb);

  const tsvMaterial = kit.glow();
  STACK_X.forEach((x, i) => {
    const front = dramStack(`dram_stack_${i}`, kit, tsvMaterial);
    front.position.set(x, 0.02, SURFACE);
    const back = dramStack(`dram_stack_${i + STACK_X.length}`, kit, tsvMaterial);
    back.position.set(x, 0.02, -SURFACE);
    back.rotation.y = Math.PI;
    root.add(front, back);
  });

  root.add(box('rcd', [0.1, 0.09, 0.012], kit.mold, [0, 0.02, SURFACE + 0.006]));
  root.add(
    group(new Group(), 'pmic', [
      box('pmic_chip', [0.07, 0.05, 0.01], kit.mold, [0.78, 0.165, SURFACE + 0.005]),
      box('pmic_inductor_0', [0.045, 0.045, 0.02], kit.darkMetal, [0.66, 0.165, SURFACE + 0.01]),
      box('pmic_inductor_1', [0.045, 0.045, 0.02], kit.darkMetal, [0.9, 0.165, SURFACE + 0.01]),
    ]),
  );
  root.add(box('spd', [0.035, 0.03, 0.006], kit.mold, [-0.1, 0.17, SURFACE + 0.003]));

  // Наклейка с маркировкой над левыми стеками
  const sticker = marking.length > 0 ? stickerLabel('sticker', marking, [0.52, 0.07]) : null;
  sticker?.position.set(-0.6, 0.175, SURFACE + 0.0006);
  if (sticker) root.add(sticker);

  // Конденсаторы вдоль верхнего края с обеих сторон
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

  return root;
}
