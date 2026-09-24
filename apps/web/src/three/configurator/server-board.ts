import { BoxGeometry, Group, Mesh, Object3D } from 'three';
import type { MaterialKit } from '../models/materials';
import { box, group, instanced, rounded, type Placement } from '../models/procedural/parts';
import { buildTraceGeometry, createTraceMaterial, type TracePath } from '../traces';
import { DIMM_LENGTH, GPU_Z, SOCKET_SIZE, type ServerLayout } from './layout';

/** Разъём PCIe под картой: контакты карты идут от −0.6 до +0.18 вдоль её длины */
const PCIE_SLOT = { offset: -0.21, length: 0.9 };

/** Трассы: от каждого сокета к его слотам памяти и пучок к ряду PCIe. */
function serverTraces({ sockets, dimms, gpus }: ServerLayout): TracePath[] {
  const paths: TracePath[] = [];
  const half = SOCKET_SIZE / 2;
  const nearest = (x: number) =>
    sockets.reduce((best, socket, i) => (Math.abs(socket.x - x) < Math.abs(sockets[best]!.x - x) ? i : best), 0);
  for (const [index, socket] of sockets.entries()) {
    // Слоты этого сокета — те, к которым он ближе остальных
    const own = dimms.filter((d) => nearest(d.x) === index);
    own.forEach((slot, i) => {
      const side = Math.sign(slot.x - socket.x);
      const from = socket.x + side * half;
      for (const dz of [-0.36, 0, 0.36]) {
        const z = socket.z + dz + (i % 4) * 0.03;
        const knee = from + side * 0.1;
        paths.push([
          [from, z],
          [knee, z],
          [knee + side * 0.06, z + 0.06],
          [slot.x, z + 0.06],
        ]);
      }
    });
  }
  // Сокеты → ряд PCIe: к каждой карте по паре линий
  gpus.forEach((gpu, i) => {
    const socket = sockets[i % sockets.length]!;
    for (const dx of [-0.05, 0.05]) {
      const x0 = socket.x + dx + (i - gpus.length / 2) * 0.04;
      const z0 = socket.z - half;
      const zMid = GPU_Z + 1.2 + (i % 5) * 0.05;
      paths.push([
        [x0, z0],
        [x0, zMid + 0.2],
        [x0 + Math.sign(gpu.x - x0) * 0.1, zMid],
        [gpu.x + dx, zMid],
        [gpu.x + dx, GPU_Z + PCIE_SLOT.offset + PCIE_SLOT.length / 2],
      ]);
    }
  });
  return paths;
}

/**
 * Серверная плата под выбранную платформу: число сокетов, слотов памяти и PCIe
 * берётся из раскладки. Текстолит, фиксаторы сокетов, слоты с защёлками, VRM и светящиеся трассы.
 */
export function buildServerBoard(kit: MaterialKit, layout: ServerLayout): Group {
  const { width, depth, center, sockets, dimms, gpus } = layout;
  const root = group(new Group(), 'server_board', []);

  root.add(rounded('pcb', [width, 0.05, depth], 0.04, kit.pcb, [center.x, -0.025, center.z], 2));

  const s = SOCKET_SIZE;
  sockets.forEach((socket, i) => {
    const node = new Object3D();
    node.name = `socket_${i}`;
    node.position.set(socket.x, 0, socket.z);
    node.add(
      box('socket_frame_n', [s + 0.14, 0.05, 0.07], kit.outline, [0, 0.025, -s / 2 - 0.035]),
      box('socket_frame_s', [s + 0.14, 0.05, 0.07], kit.outline, [0, 0.025, s / 2 + 0.035]),
      box('socket_frame_w', [0.07, 0.05, s], kit.outline, [-s / 2 - 0.035, 0.025, 0]),
      box('socket_frame_e', [0.07, 0.05, s], kit.outline, [s / 2 + 0.035, 0.025, 0]),
      box('socket_field', [s, 0.004, s], kit.gold, [0, 0.002, 0]),
    );
    root.add(node);

    // VRM перед сокетом
    const vrm: Placement[] = Array.from({ length: 12 }, (_, k) => ({
      position: [socket.x - 0.44 + k * 0.08, 0.025, socket.z - s / 2 - 0.3],
    }));
    root.add(instanced(`vrm_${i}`, new BoxGeometry(0.06, 0.05, 0.07), kit.darkMetal, vrm));
  });

  // Слоты DIMM с защёлками на концах
  const slots: Placement[] = dimms.map(({ x, z }) => ({ position: [x, 0.03, z] }));
  const latches: Placement[] = dimms.flatMap(({ x, z }) => [
    { position: [x, 0.05, z - DIMM_LENGTH / 2 - 0.04] },
    { position: [x, 0.05, z + DIMM_LENGTH / 2 + 0.04] },
  ]);
  root.add(instanced('dimm_slots', new BoxGeometry(0.06, 0.06, DIMM_LENGTH + 0.04), kit.plastic, slots));
  root.add(instanced('dimm_latches', new BoxGeometry(0.075, 0.1, 0.05), kit.outline, latches));

  // Слоты PCIe x16 под картами
  const pcie: Placement[] = gpus.map(({ x, z }) => ({ position: [x, 0.03, z + PCIE_SLOT.offset] }));
  root.add(instanced('pcie_slots', new BoxGeometry(0.07, 0.06, PCIE_SLOT.length), kit.plastic, pcie));

  // Трассы светятся цветом акцента процессора
  const traces = new Mesh(
    buildTraceGeometry(serverTraces(layout), 0.012, 29),
    createTraceMaterial({ color: kit.accent, intensity: 0.9, spacing: 1.5, speed: 0.4 }),
  );
  traces.name = 'traces';
  traces.position.y = 0.002;
  root.add(traces);

  return root;
}

/** Плата пересобирается при смене платформы: материалы общие, освобождаем только своё. */
export function disposeBoard(root: Object3D): void {
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    node.geometry.dispose();
    // Материал трасс создаётся на каждую сборку платы
    if (node.name === 'traces' && !Array.isArray(node.material)) node.material.dispose();
  });
}
