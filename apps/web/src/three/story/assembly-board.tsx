'use client';

import { useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { MathUtils, Mesh, type Group, type Material, type ShaderMaterial } from 'three';
import { BOARD_DISPLAY, BOARD_LAYOUT, BOARD_TOP, BOARD_YAW, FILLER_ORDER, ASSEMBLY } from '@/story/assembly';
import { BOARD_Y, type StoryPose } from '@/story/director';
import { RDIMM_FILLER_URL } from '../models/fillers';
import { prepareGlb } from '../models/glb';
import { useModelUrl, type ModelSource } from '../models/product-model';
import { buildTraceGeometry, createTraceMaterial, type TracePath } from '../traces';

const BOARD: ModelSource = { url: '/models/board-sp7.glb', mobileUrl: '/models/board-sp7-mobile.glb' };
/** Облегчённый модуль памяти (без слоёв кристаллов и пассивки, текстуры 1024 px) — статисты в слотах */
const FILLER_URL = RDIMM_FILLER_URL;

/** Длина трасс (в единицах модели платы), которая прорисована при reveal = 1 */
const REVEAL_LENGTH = 0.8;

/**
 * Светящиеся трассы поверх текстолита, в координатах модели платы: шины памяти от рамки сокета
 * под банки DIMM и линии PCIe к слотам x16. Видны в просветах между компонентами, как на плате.
 */
function boardTraces(): TracePath[] {
  const { socket, socketFrame, dimms, pcie, pcieLength } = BOARD_LAYOUT;
  const [sx, sz] = socket as [number, number];
  const fw = socketFrame[0]! / 2;
  const fh = socketFrame[1]! / 2;
  const paths: TracePath[] = [];

  // Шины памяти: по 12 линий на сторону, от-под рамки сокета до дальнего слота банка
  for (const side of [-1, 1]) {
    const far = dimms[side < 0 ? 7 : 15]![0]! + side * 0.02;
    for (let lane = 0; lane < 12; lane++) {
      const z = sz - 0.34 + lane * 0.062;
      const x0 = sx + side * (fw - 0.03);
      const knee = x0 + side * (0.012 + (lane % 3) * 0.004);
      paths.push([
        [x0, z],
        [knee, z],
        [knee + side * 0.01, z + 0.01],
        [far, z + 0.01],
      ]);
    }
  }

  // PCIe x16: 16 линий от южной кромки сокета веером к ближнему слоту, по всей длине разъёма.
  // Линия, что начинается западнее, поворачивает раньше и уходит дальше на запад — пучок без пересечений.
  const [px, pz0] = pcie[0] as [number, number];
  const [, pz1] = pcie[1] as [number, number];
  const south = sz + fh - 0.03;
  const c = 0.008; // фаска на поворотах
  const route = (x0: number, z: number, x1: number, end: number): TracePath => [
    [x0, south],
    [x0, z - c],
    [x0 - c, z],
    [x1 + c, z],
    [x1, z + c],
    [x1, end],
  ];
  for (let lane = 0; lane < 16; lane++) {
    const x0 = sx - 0.3 + lane * 0.018;
    const x1 = px - pcieLength / 2 + 0.03 + lane * ((pcieLength - 0.06) / 15);
    paths.push(route(x0, south + 0.02 + lane * 0.006, x1, pz0 - 0.028));
  }
  // Второй слот: линии спускаются восточнее первого разъёма и заходят в дальний
  for (let lane = 0; lane < 8; lane++) {
    const x0 = sx - 0.02 + lane * 0.018;
    const x1 = px + pcieLength / 2 - 0.04 - (7 - lane) * 0.035;
    paths.push(route(x0, pz1 - 0.08 + lane * 0.006, x1, pz1 - 0.028));
  }
  return paths;
}

/**
 * Реальная плата SP7 для сцены сборки: GLB из tools/blender, модули-статисты в слотах DIMM
 * и светящиеся трассы. Позы задаёт режиссёр (pose.board, pose.fillers); монтируется после прелоадера,
 * чтобы 4,5 МБ платы не задерживали первый экран.
 */
export function AssemblyBoard({ accent, getPose }: { accent: string; getPose: () => StoryPose | null }) {
  const { gl, camera, scene } = useThree();
  const { scene: boardScene } = useGLTF(useModelUrl(BOARD), true, true);
  const { scene: fillerScene } = useGLTF(FILLER_URL, true, true);
  const holder = useRef<Group>(null);
  const fading = useRef(false);

  const parts = useMemo(() => {
    const board = prepareGlb(boardScene);
    const materials: Material[] = [];
    board.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      for (const m of Array.isArray(node.material) ? node.material : [node.material]) {
        m.userData.baseOpacity = m.opacity;
        m.userData.baseTransparent = m.transparent;
        materials.push(m);
      }
    });

    const traceMaterial = createTraceMaterial({ color: accent, intensity: 0, spacing: 0.45, speed: 0.45, reveal: 0 });
    const traces = new Mesh(buildTraceGeometry(boardTraces(), 0.0042, 21), traceMaterial);
    traces.name = 'traces_mesh';
    traces.position.y = BOARD_LAYOUT.top + 0.0004;
    traces.renderOrder = 1;
    board.add(traces);

    // Один подготовленный модуль, остальные — клоны с общими геометриями и материалами
    const filler = prepareGlb(fillerScene);
    const fillers = FILLER_ORDER.map(() => filler.clone(true));
    return { board, materials, traces, traceMaterial: traceMaterial as ShaderMaterial, fillers };
  }, [boardScene, fillerScene, accent]);

  useEffect(
    () => () => {
      parts.traces.geometry.dispose();
      parts.traceMaterial.dispose();
    },
    [parts],
  );

  // Шейдеры платы компилируются заранее, а не рывком посреди скролла, когда она впервые появится
  useEffect(() => {
    const root = holder.current;
    if (!root) return;
    const nodes = [root, parts.board, ...parts.fillers];
    const visible = nodes.map((node) => node.visible);
    for (const node of nodes) node.visible = true;
    gl.compileAsync(root, camera, scene).catch(() => undefined);
    nodes.forEach((node, i) => (node.visible = visible[i]!));
  }, [gl, camera, scene, parts]);

  useFrame(() => {
    const p = getPose();
    if (!p) return;
    const { board, materials, traceMaterial, fillers } = parts;
    const bs = p.board.scale;
    const show = p.board.visibility;

    board.visible = show > 0.01;
    const grow = 0.9 + 0.1 * show;
    board.position.set(p.board.x, BOARD_Y - BOARD_TOP * bs * grow, 0);
    board.rotation.set(0, BOARD_YAW, 0);
    board.scale.setScalar(BOARD_DISPLAY * bs * grow);

    // Прозрачность — только пока плата проявляется: сложной непрозрачной модели не нужна сортировка
    const fade = show < 0.999;
    for (const m of materials) {
      if (fading.current !== fade) {
        m.transparent = fade || (m.userData.baseTransparent as boolean);
        m.needsUpdate = true;
      }
      m.opacity = (m.userData.baseOpacity as number) * show;
    }
    fading.current = fade;

    traceMaterial.uniforms.uIntensity!.value = p.board.traces * show;
    traceMaterial.uniforms.uReveal!.value = p.board.reveal * REVEAL_LENGTH;

    // Статисты занимают слоты по очереди, парами от сокета наружу
    const stagger = 0.04;
    fillers.forEach((filler, i) => {
      const mount = ASSEMBLY.fillers[FILLER_ORDER[i]!]!;
      const t = MathUtils.clamp((p.fillers - i * stagger) / (1 - (fillers.length - 1) * stagger), 0, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      filler.visible = show > 0.01 && t > 0;
      filler.position.set(
        p.board.x + mount.position[0] * bs,
        BOARD_Y + (mount.position[1] + (1 - eased) * 2.6) * bs,
        mount.position[2] * bs,
      );
      filler.rotation.set(0, mount.yaw, (1 - eased) * 0.4);
      filler.scale.setScalar(mount.scale * bs);
    });
  });

  return (
    <group ref={holder}>
      <primitive object={parts.board} visible={false} />
      {parts.fillers.map((filler, i) => (
        <primitive key={`filler-${i}`} object={filler} visible={false} />
      ))}
    </group>
  );
}
