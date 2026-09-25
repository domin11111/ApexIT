import { describe, expect, it } from 'vitest';
import layout from '@/three/models/assembly-layout.json';
import { ASSEMBLY, BOARD_DISPLAY, BOARD_YAW, FILLER_ORDER, HERO_DIMM, UNITS_PER_METER, type Mount } from './assembly';

/** Наибольший габарит детали в метрах: в модели он равен 2, в сцене — 2 × scale. */
const meters = (mount: Mount) => (2 * mount.scale) / UNITS_PER_METER;

/** Опорная точка детали (контакты) в сцене — куда она попала после поворота и масштаба. */
function anchorAt(mount: Mount, anchor: number[]): [number, number, number] {
  const [x, y, z] = anchor.map((v) => v * mount.scale) as [number, number, number];
  const c = Math.cos(mount.yaw);
  const s = Math.sin(mount.yaw);
  return [mount.position[0] + x * c + z * s, mount.position[1] + y, mount.position[2] - x * s + z * c];
}

/** Центр посадочного места на плате в сцене (плата повёрнута на BOARD_YAW). */
function slotAt([x, z]: number[]): [number, number] {
  const c = Math.cos(BOARD_YAW);
  const s = Math.sin(BOARD_YAW);
  return [(x! * c + z! * s) * BOARD_DISPLAY, (-x! * s + z! * c) * BOARD_DISPLAY];
}

describe('раскладка сцены сборки', () => {
  it('детали на плате в реальных размерах', () => {
    // Плата 330 мм; наибольший габарит модели чуть больше — разъёмы задней панели выступают за кромку
    expect(2 / layout.board.scale).toBeGreaterThanOrEqual(0.33);
    expect(2 / layout.board.scale).toBeLessThan(0.34);
    expect(meters(ASSEMBLY.socket)).toBeCloseTo(0.094, 3); // корпус SP7 88 × 94 мм
    expect(meters(ASSEMBLY.dimms[0]!)).toBeCloseTo(0.13335, 3); // DDR5 RDIMM 133,35 мм
    // FHFL — 266,7 мм без брекета; с загнутой полкой брекета модель длиннее
    expect(meters(ASSEMBLY.pcie[0]!)).toBeGreaterThan(0.2667);
    expect(meters(ASSEMBLY.pcie[0]!)).toBeLessThan(0.285);
  });

  it('контакты процессора — на контактном поле сокета, над верхом платы на высоте посадки', () => {
    const [x, y, z] = anchorAt(ASSEMBLY.socket, layout.cpu.contacts);
    const [sx, sz] = slotAt(layout.board.socket);
    expect(x).toBeCloseTo(sx, 6);
    expect(z).toBeCloseTo(sz, 6);
    expect(y / UNITS_PER_METER).toBeCloseTo(layout.seat.cpu, 6);
  });

  it('контакты модулей и видеокарты — по центру своих слотов', () => {
    layout.board.dimms.forEach((slot, i) => {
      const [x, y, z] = anchorAt(ASSEMBLY.dimms[i]!, layout.memory.contacts);
      const [sx, sz] = slotAt(slot);
      expect([x, z, y / UNITS_PER_METER]).toEqual([expect.closeTo(sx, 6), expect.closeTo(sz, 6), expect.closeTo(layout.seat.memory, 6)]);
    });
    const [x, , z] = anchorAt(ASSEMBLY.pcie[0]!, layout.gpu.fingers);
    const [sx, sz] = slotAt(layout.board.pcie[0]!);
    expect(x).toBeCloseTo(sx, 6);
    expect(z).toBeCloseTo(sz, 6);
  });

  it('модули стоят вдоль слотов: длинная сторона — по оси Z сцены', () => {
    for (const mount of ASSEMBLY.dimms) expect(Math.abs(Math.sin(mount.yaw))).toBeCloseTo(1, 6);
  });

  it('видеокарта за сокетом: от камеры (+Z) дальше процессора', () => {
    expect(ASSEMBLY.pcie[0]!.position[2]).toBeLessThan(ASSEMBLY.socket.position[2]);
  });

  it('статисты занимают все слоты, кроме слота модуля из сцены памяти', () => {
    expect(FILLER_ORDER).toHaveLength(15);
    expect(new Set(FILLER_ORDER).size).toBe(15);
    expect(FILLER_ORDER).not.toContain(HERO_DIMM);
  });
});
