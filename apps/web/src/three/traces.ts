import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  ShaderMaterial,
  Vector2,
  type ColorRepresentation,
} from 'three';
import { random, sharedUniforms } from './shared';

/** Трасса в плоскости: точки [x, z]. */
export type TracePath = Array<[number, number]>;

// 8 направлений: ортогональные и диагонали 45° — как разводка на печатной плате
const DIRECTIONS: Array<[number, number]> = [
  [1, 0],
  [Math.SQRT1_2, Math.SQRT1_2],
  [0, 1],
  [-Math.SQRT1_2, Math.SQRT1_2],
  [-1, 0],
  [-Math.SQRT1_2, -Math.SQRT1_2],
  [0, -1],
  [Math.SQRT1_2, -Math.SQRT1_2],
];

type TraceOptions = {
  count: number;
  seed: number;
  /** Радиус, с которого трассы стартуют */
  inner: number;
  /** Трасса заканчивается, выйдя за этот радиус… */
  outer: number;
  /** …или за прямоугольник |x| ≤ w, |z| ≤ d */
  bounds?: { w: number; d: number };
  /** Базовая длина участка */
  step?: number;
};

/**
 * Трассы расходятся от центра наружу: ортогональные участки чередуются с фасками 45°,
 * направление не отклоняется от «наружу» больше чем на 45° — узор читается как разводка.
 */
export function generateTraces({ count, seed, inner, outer, bounds, step = 0.2 }: TraceOptions): TracePath[] {
  const rnd = random(seed);
  const paths: TracePath[] = [];
  const outside = (x: number, z: number) =>
    Math.hypot(x, z) > outer || (bounds !== undefined && (Math.abs(x) > bounds.w || Math.abs(z) > bounds.d));

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (rnd() - 0.5) * 0.25;
    let x = Math.cos(angle) * inner;
    let z = Math.sin(angle) * inner;
    const outward = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
    let direction = outward;
    const path: TracePath = [[x, z]];

    for (let segment = 0; segment < 32; segment++) {
      const [dx, dz] = DIRECTIONS[direction]!;
      // Диагонали короткие (фаски), прямые участки — длиннее
      const length = direction % 2 === 1 ? step * 0.5 : step * (1 + Math.floor(rnd() * 3));
      let nx = x + dx * length;
      let nz = z + dz * length;
      if (outside(nx, nz)) {
        // Обрезаем последний участок по границе
        const scale = bounds ? Math.min(1, clipScale(x, z, dx, dz, length, bounds)) : 1;
        nx = x + dx * length * scale;
        nz = z + dz * length * scale;
        path.push([nx, nz]);
        break;
      }
      x = nx;
      z = nz;
      path.push([x, z]);
      const roll = rnd();
      direction = roll < 0.33 ? (outward + 1) % 8 : roll < 0.66 ? (outward + 7) % 8 : outward;
    }
    if (path.length > 1) paths.push(path);
  }
  return paths;
}

function clipScale(x: number, z: number, dx: number, dz: number, length: number, b: { w: number; d: number }) {
  const tx = dx === 0 ? Infinity : ((Math.sign(dx) * b.w - x) / (dx * length));
  const tz = dz === 0 ? Infinity : ((Math.sign(dz) * b.d - z) / (dz * length));
  return Math.max(0, Math.min(tx, tz));
}

/** Прямоугольный замкнутый контур (например, трасса вдоль края корпуса). */
export function rectPath(w: number, d: number): TracePath {
  return [
    [-w, -d],
    [w, -d],
    [w, d],
    [-w, d],
    [-w, -d],
  ];
}

/**
 * Ленты трасс в плоскости XZ (y = 0). Атрибуты: aProgress — пройденная вдоль трассы длина
 * (по ней бежит градиент), aSeed — сдвиг фазы для каждой трассы, uv.y — поперёк ленты.
 * На конце каждой трассы — квадратная контактная площадка.
 */
export function buildTraceGeometry(paths: TracePath[], width: number, seed = 1): BufferGeometry {
  const rnd = random(seed);
  const positions: number[] = [];
  const uvs: number[] = [];
  const progress: number[] = [];
  const seeds: number[] = [];
  const indices: number[] = [];
  const half = width / 2;

  const quad = (corners: Array<[number, number]>, p: [number, number, number, number], s: number) => {
    const base = positions.length / 3;
    corners.forEach(([cx, cz], k) => {
      positions.push(cx, 0, cz);
      uvs.push(k < 2 ? 0 : 1, k % 2);
      progress.push(p[k]!);
      seeds.push(s);
    });
    indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
  };

  for (const path of paths) {
    const s = rnd();
    let travelled = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const [x0, z0] = path[i]!;
      const [x1, z1] = path[i + 1]!;
      const length = Math.hypot(x1 - x0, z1 - z0);
      if (length < 1e-6) continue;
      const nx = (-(z1 - z0) / length) * half;
      const nz = ((x1 - x0) / length) * half;
      // Продлеваем концы на полширины — стыки без щелей
      const ex = ((x1 - x0) / length) * half;
      const ez = ((z1 - z0) / length) * half;
      quad(
        [
          [x0 - ex - nx, z0 - ez - nz],
          [x0 - ex + nx, z0 - ez + nz],
          [x1 + ex - nx, z1 + ez - nz],
          [x1 + ex + nx, z1 + ez + nz],
        ],
        [travelled, travelled, travelled + length, travelled + length],
        s,
      );
      travelled += length;
    }
    const [lx, lz] = path[path.length - 1]!;
    const pad = width * 2.2;
    quad(
      [
        [lx - pad, lz - pad],
        [lx - pad, lz + pad],
        [lx + pad, lz - pad],
        [lx + pad, lz + pad],
      ],
      [travelled, travelled, travelled, travelled],
      s,
    );
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aProgress', new Float32BufferAttribute(progress, 1));
  geometry.setAttribute('aSeed', new Float32BufferAttribute(seeds, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

type TraceMaterialOptions = {
  color: ColorRepresentation;
  /** Уровень свечения; rig управляет им как каналом glow (uniform uIntensity) */
  intensity?: number;
  /** Расстояние между импульсами вдоль трассы */
  spacing?: number;
  speed?: number;
  /** Радиальное затухание [начало, конец] — для «пола» из трасс */
  fade?: [number, number];
  /** Сколько трассы уже «прорисовано» от начала (в единицах длины); uniform uReveal */
  reveal?: number;
};

/**
 * Шейдер «печатных дорожек»: тусклая база и бегущие вдоль трассы импульсы.
 * Импульсы ярче 1 (toneMapped: false), поэтому их подхватывает bloom, а остальную сцену — нет.
 */
export function createTraceMaterial({
  color,
  intensity = 1,
  spacing = 1.6,
  speed = 0.35,
  fade = [1e3, 1e3 + 1],
  reveal = 1e6,
}: TraceMaterialOptions): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uTime: sharedUniforms.uTime,
      uColor: { value: new Color(color) },
      uIntensity: { value: intensity },
      uSpacing: { value: spacing },
      uSpeed: { value: speed },
      uFade: { value: new Vector2(fade[0], fade[1]) },
      uReveal: { value: reveal },
    },
    vertexShader: /* glsl */ `
      attribute float aProgress;
      attribute float aSeed;
      varying float vProgress;
      varying float vSeed;
      varying float vAcross;
      varying float vRadius;
      void main() {
        vProgress = aProgress;
        vSeed = aSeed;
        vAcross = uv.y;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vRadius = length(world.xz);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform float uSpacing;
      uniform float uSpeed;
      uniform vec2 uFade;
      uniform float uReveal;
      varying float vProgress;
      varying float vSeed;
      varying float vAcross;
      varying float vRadius;
      void main() {
        // Прорисовка трассы от начала: дальше uReveal её ещё нет, на фронте — яркая «головка»
        if (vProgress > uReveal) discard;
        float front = 1.0 - smoothstep(0.0, 0.18, uReveal - vProgress);
        // Мягкий край поперёк ленты
        float line = smoothstep(0.0, 0.45, 1.0 - abs(vAcross - 0.5) * 2.0);
        // Бегущий градиент: фаза растёт вдоль трассы и сдвигается во времени
        float phase = fract(vProgress / uSpacing - uTime * uSpeed + vSeed);
        float head = smoothstep(0.82, 0.985, phase) * (1.0 - smoothstep(0.985, 1.0, phase));
        float tail = smoothstep(0.35, 0.985, phase) * 0.35;
        float glow = 0.16 + tail + head * 3.2 + front * 3.0;
        float fade = 1.0 - smoothstep(uFade.x, uFade.y, vRadius);
        float alpha = line * fade * clamp(uIntensity, 0.0, 1.0);
        gl_FragColor = vec4(uColor * glow * uIntensity, alpha);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
  });
}
