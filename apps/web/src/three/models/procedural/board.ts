import { BoxGeometry, EdgesGeometry, Group, LineBasicMaterial, LineSegments, Mesh, Object3D } from 'three';
import { buildTraceGeometry, createTraceMaterial, type TracePath } from '../../traces';
import type { MaterialKit } from '../materials';
import { box, group, instanced, mark, rounded, type Placement } from './parts';

/**
 * Раскладка схемы серверной платы SP7 (плоскость XZ, верх платы — y = 0).
 * Экспортируется: сцена сборки ставит в эти точки процессор, память и видеокарту,
 * конфигуратор (этап 6) — подсвечивает занятые слоты.
 */
export const BOARD = {
  width: 4.4,
  depth: 3.2,
  socket: { x: -0.55, z: -0.25, size: 1.05 },
  /** Слоты DIMM вдоль оси Z по обе стороны сокета */
  dimms: [-1.95, -1.8, -1.65, -1.5, 0.4, 0.55, 0.7, 0.85].map((x) => ({ x, z: -0.25 })),
  dimmLength: 1.7,
  pcie: { x: 1.15, z: 1.15, length: 2 },
} as const;

/** Трассы между сокетом, слотами памяти и PCIe — ортогональные участки с фасками, как на плате. */
function boardTraces(): TracePath[] {
  const { socket, dimms, pcie } = BOARD;
  const edgeL = socket.x - socket.size / 2;
  const edgeR = socket.x + socket.size / 2;
  const paths: TracePath[] = [];
  // Сокет → слоты памяти (по три трассы на слот, разнесённые по z)
  dimms.forEach(({ x }, i) => {
    for (const dz of [-0.4, 0, 0.4]) {
      const z = socket.z + dz + (i % 4) * 0.035;
      const from = x < socket.x ? edgeL : edgeR;
      const knee = from + (x < socket.x ? -0.12 : 0.12);
      paths.push([
        [from, z],
        [knee, z],
        [knee + (x < socket.x ? -0.08 : 0.08), z + 0.08],
        [x, z + 0.08],
      ]);
    }
  });
  // Сокет → PCIe x16: пучок линий к слоту
  for (let lane = 0; lane < 8; lane++) {
    const x0 = socket.x + 0.1 + lane * 0.04;
    const z0 = socket.z + socket.size / 2;
    const x1 = pcie.x - pcie.length / 2 + 0.2 + lane * 0.1;
    paths.push([
      [x0, z0],
      [x0, z0 + 0.25 + lane * 0.02],
      [x0 + 0.3, z0 + 0.55 + lane * 0.02],
      [x1, z0 + 0.55 + lane * 0.02],
      [x1, pcie.z - 0.06],
    ]);
  }
  return paths;
}

/**
 * Полупрозрачная схема серверной платы для сцены сборки: текстолит, контур сокета SP7,
 * 8 слотов DIMM, слот PCIe x16 и светящиеся трассы между ними.
 * Узлы: board, socket, dimm_slot_N, pcie_slot, traces (канал glow 'board').
 */
export function buildBoard(kit: MaterialKit): Group {
  const root = group(new Group(), 'motherboard', []);
  const { width, depth, socket, dimms, dimmLength, pcie } = BOARD;

  root.add(rounded('board', [width, 0.04, depth], 0.03, kit.schematic, [0, -0.02, 0], 2));

  // Контур платы — тонкая линия, чтобы схема читалась на тёмном фоне
  const frame = new LineSegments(
    new EdgesGeometry(new BoxGeometry(width, 0.04, depth)),
    new LineBasicMaterial({ color: '#3a4458', transparent: true, opacity: 0.8 }),
  );
  frame.position.y = -0.02;
  frame.name = 'board_frame';
  root.add(frame);

  // Сокет: рамка-фиксатор и контактное поле
  const socketNode = new Object3D();
  socketNode.name = 'socket';
  socketNode.position.set(socket.x, 0, socket.z);
  const s = socket.size;
  socketNode.add(
    box('socket_frame_n', [s + 0.12, 0.05, 0.06], kit.outline, [0, 0.025, -s / 2 - 0.03]),
    box('socket_frame_s', [s + 0.12, 0.05, 0.06], kit.outline, [0, 0.025, s / 2 + 0.03]),
    box('socket_frame_w', [0.06, 0.05, s], kit.outline, [-s / 2 - 0.03, 0.025, 0]),
    box('socket_frame_e', [0.06, 0.05, s], kit.outline, [s / 2 + 0.03, 0.025, 0]),
    box('socket_field', [s, 0.004, s], kit.gold, [0, 0.002, 0]),
  );
  root.add(socketNode);

  // Слоты DIMM вдоль Z
  const slots: Placement[] = dimms.map(({ x, z }) => ({ position: [x, 0.03, z] }));
  root.add(instanced('dimm_slots', new BoxGeometry(0.07, 0.06, dimmLength), kit.plastic, slots));
  dimms.forEach(({ x, z }, i) => {
    const anchor = new Object3D();
    anchor.name = `dimm_slot_${i}`;
    anchor.position.set(x, 0.06, z);
    root.add(anchor);
  });

  // Слот PCIe x16 вдоль X у переднего края
  const pcieNode = box('pcie_slot', [pcie.length * 0.55, 0.06, 0.08], kit.plastic, [pcie.x - pcie.length * 0.2, 0.03, pcie.z]);
  root.add(pcieNode);

  // Модули VRM вокруг сокета — «городская застройка» схемы
  const vrm: Placement[] = [];
  for (let i = 0; i < 12; i++) vrm.push({ position: [socket.x - 0.45 + i * 0.08, 0.02, socket.z - s / 2 - 0.28] });
  root.add(instanced('vrm', new BoxGeometry(0.06, 0.04, 0.06), kit.darkMetal, vrm));

  // Трассы: рисуются от сокета наружу (uReveal) и светятся импульсами
  const traceMaterial = createTraceMaterial({ color: kit.accent, intensity: 0, spacing: 1.4, speed: 0.45, reveal: 0 });
  const traces = new Mesh(buildTraceGeometry(boardTraces(), 0.012, 21), traceMaterial);
  traces.name = 'traces_mesh';
  traces.position.y = 0.002;
  root.add(mark(group(new Group(), 'traces', [traces]), { glow: 'board', glowMax: 1 }));

  return root;
}
