import { BoxGeometry, Group, type Object3D } from 'three';
import { engravedLabel, type LabelLine } from '../labels';
import type { MaterialKit } from '../materials';
import { gpuDieTexture } from '../textures';
import { box, group, instanced, mark, range, type Placement } from './parts';

/*
 * NVIDIA RTX PRO 6000 Blackwell Server Edition (FHFL, двухслотовая, пассивная) — по фото NVIDIA:
 * корпус из анодированного алюминия цвета шампанского с мелким поперечным оребрением,
 * графитовая верхняя кромка с логотипом, открытый задний торец с рёбрами радиатора,
 * полноразмерный брекет с вентиляционной решёткой и четырьмя DisplayPort.
 *
 * Пространство модели: x — длина (брекет на x = −1), y — высота (разъём PCIe снизу), z — толщина.
 */
const BODY = { x0: -0.985, x1: 1, y0: -0.33, y1: 0.4, z: 0.3 };
const SKIN = 0.012;
/** Лицевая панель обрывается у заднего торца — там видны рёбра радиатора */
const FIN_WINDOW_X = 0.86;
const PCB_Z = -0.118;

/**
 * Узлы: shroud (лицевая панель + кромка с логотипом), backplate, heatsink (рёбра + испарительная
 * камера), pcb, gpu_package, gpu_die, vram (vram_0…15), pcie_edge, io_bracket, power.
 * Разобранный вид: кожух уходит вверх, радиатор — следом, открывая кристалл и память.
 */
export function buildGpu(kit: MaterialKit, marking: LabelLine[] = []): Group {
  const root = group(new Group(), 'gpu', []);
  const bodyW = BODY.x1 - BODY.x0;
  const bodyH = BODY.y1 - BODY.y0;
  const cx = (BODY.x0 + BODY.x1) / 2;
  const cy = (BODY.y0 + BODY.y1) / 2;
  const [logo, model] = marking;

  // ── Кожух: лицевая панель с оребрением и графитовая кромка ────────────────
  const frontW = FIN_WINDOW_X - BODY.x0;
  const front = box('shroud_front', [frontW, bodyH, SKIN], kit.champagne, [(BODY.x0 + FIN_WINDOW_X) / 2, cy, BODY.z / 2 - SKIN / 2]);
  const top = box('shroud_top', [bodyW, 0.016, BODY.z], kit.graphite, [cx, BODY.y1 + 0.008, 0]);
  const shroudParts: Object3D[] = [front, top];

  // Логотип на графитовой кромке у заднего торца (как на фото сверху)
  const logoLabel = logo ? engravedLabel('shroud_logo', [logo], [0.42, 0.11], { opacity: 0.85, roughness: 0.35 }) : null;
  if (logoLabel) {
    logoLabel.rotation.x = -Math.PI / 2;
    logoLabel.position.set(0.66, BODY.y1 + 0.0165, 0);
    shroudParts.push(logoLabel);
  }
  // Название модели — тонкая печать на лицевой панели у брекета
  const modelLabel = model ? engravedLabel('shroud_model', [model], [0.5, 0.05], { color: '#3a3226', opacity: 0.8, metalness: 0.6 }) : null;
  if (modelLabel) {
    modelLabel.position.set(BODY.x0 + 0.34, BODY.y1 - 0.06, BODY.z / 2 + 0.0008);
    shroudParts.push(modelLabel);
  }
  root.add(mark(group(new Group(), 'shroud', shroudParts), { explode: [0, 0.7, 0.5], explodeRange: [0, 0.55] }));

  // ── Тыльная панель (сторона платы) — тоже с оребрением ────────────────────
  root.add(
    group(new Group(), 'backplate', [
      box('backplate_panel', [bodyW, bodyH, SKIN], kit.champagne, [cx, cy, -BODY.z / 2 + SKIN / 2]),
    ]),
  );

  // ── Радиатор: пластины вдоль потока воздуха, видны на открытом торце ──────
  const fins: Placement[] = range(-0.075, 0.13, 0.0085).map((z) => ({ position: [cx + 0.01, cy + 0.02, z] }));
  root.add(
    mark(
      group(new Group(), 'heatsink', [
        box('vapor_chamber', [1.6, 0.6, 0.012], kit.aluminum, [0.02, 0.02, PCB_Z + 0.035]),
        instanced('heatsink_fins', new BoxGeometry(bodyW - 0.02, bodyH - 0.06, 0.0035), kit.finMetal, fins),
      ]),
      { explode: [0, 0.36, 0.28], explodeRange: [0.15, 0.7] },
    ),
  );

  // ── Плата, корпус GB202 и видеопамять ──────────────────────────────────────
  const face = PCB_Z + 0.008;
  root.add(box('pcb', [1.93, 0.72, 0.016], kit.pcb, [-0.02, 0, PCB_Z]));

  // Корпус чипа по фото: металлизированная подложка, кольцо конденсаторов, кристалл с серебристым бортом
  const pkg = 0.42;
  const packageParts: Object3D[] = [box('gpu_substrate', [pkg, pkg, 0.008], kit.packageMetal, [0, 0, 0])];
  const caps: Placement[] = [];
  for (const t of range(-0.17, 0.17, 0.017)) {
    caps.push({ position: [t, 0.165, 0.005] }, { position: [t, -0.165, 0.005] }, { position: [0.175, t, 0.005] }, { position: [-0.175, t, 0.005] });
  }
  packageParts.push(instanced('gpu_caps', new BoxGeometry(0.008, 0.005, 0.004), kit.ceramic, caps));
  packageParts.push(box('gpu_die_rim', [0.27, 0.235, 0.006], kit.aluminum, [0, 0, 0.006]));
  const gpuPackage = group(new Group(), 'gpu_package', packageParts);
  gpuPackage.position.set(0.05, 0.02, face + 0.004);
  root.add(gpuPackage);
  root.add(
    mark(box('gpu_die', [0.25, 0.215, 0.008], kit.die(gpuDieTexture()), [0.05, 0.02, face + 0.017]), { glow: 'die', glowMax: 3 }),
  );

  const vramPositions: Array<[number, number]> = [
    ...[-0.2, -0.07, 0.05, 0.17, 0.3].map((x): [number, number] => [x, 0.3]),
    ...[-0.2, -0.07, 0.05, 0.17, 0.3].map((x): [number, number] => [x, -0.26]),
    ...[-0.1, 0.02, 0.14].map((y): [number, number] => [-0.3, y]),
    ...[-0.1, 0.02, 0.14].map((y): [number, number] => [0.4, y]),
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

  // Тёмная кромка платы видна снизу корпуса, над разъёмом
  root.add(box('pcb_edge', [bodyW - 0.02, 0.03, 0.02], kit.pcb, [cx, BODY.y0 - 0.012, PCB_Z]));

  // ── Разъём PCIe x16 ─────────────────────────────────────────────────────────
  const fingers: Placement[] = [];
  for (const x of range(-0.6, 0.18, 0.0105)) {
    fingers.push({ position: [x, -0.385, PCB_Z + 0.0085] }, { position: [x, -0.385, PCB_Z - 0.0085] });
  }
  root.add(
    group(new Group(), 'pcie_edge', [
      box('pcie_tongue', [0.8, 0.06, 0.016], kit.pcb, [-0.21, -0.385, PCB_Z]),
      instanced('pcie_fingers', new BoxGeometry(0.007, 0.048, 0.001), kit.gold, fingers),
    ]),
  );

  // ── Полноразмерный брекет: решётка сверху, четыре DisplayPort 2.1b снизу ──
  const vents: Placement[] = [];
  for (const z of range(-0.105, 0.105, 0.03)) {
    for (const y of [0.13, 0.31]) vents.push({ position: [-1.0, y, z] });
  }
  root.add(
    group(new Group(), 'io_bracket', [
      box('bracket_plate', [0.012, 0.9, BODY.z], kit.aluminum, [-0.994, 0.035, 0]),
      box('bracket_tab', [0.07, 0.012, BODY.z], kit.aluminum, [-1.024, 0.48, 0]),
      instanced('bracket_vents', new BoxGeometry(0.004, 0.15, 0.016), kit.plastic, vents),
      ...[-0.27, -0.18, -0.09, 0].map((y, i) => box(`displayport_${i}`, [0.02, 0.05, 0.12], kit.plastic, [-1.003, y, 0])),
    ]),
  );

  // Разъём питания 12V-2x6 на заднем торце — как у серверных карт
  root.add(box('power', [0.03, 0.05, 0.11], kit.plastic, [BODY.x1 + 0.01, 0.24, -0.03]));

  return root;
}
