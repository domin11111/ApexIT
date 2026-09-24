import { describe, expect, it } from 'vitest';
import { DIMM_PITCH, GPU_PITCH, SOCKET_SIZE, serverLayout } from './layout';

describe('serverLayout', () => {
  it('1P, 12 слотов: по 6 с каждой стороны сокета, первые модули — ближние к процессору', () => {
    const layout = serverLayout({ sockets: 1, dimmsPerSocket: 12, gpuSlots: 6 });
    expect(layout.sockets).toEqual([{ x: 0, z: 0.7 }]);
    expect(layout.dimms).toHaveLength(12);
    expect(layout.dimms.filter((d) => d.x < 0)).toHaveLength(6);
    const [first, second] = layout.dimms;
    expect(first!.x).toBeCloseTo(-second!.x);
    expect(Math.abs(first!.x)).toBeLessThan(Math.abs(layout.dimms[11]!.x));
    // Слоты не заходят на сокет
    expect(Math.min(...layout.dimms.map((d) => Math.abs(d.x)))).toBeGreaterThan(SOCKET_SIZE / 2 + DIMM_PITCH / 2);
  });

  it('2P: модули ставятся поочерёдно в оба процессора, плата шире', () => {
    const one = serverLayout({ sockets: 1, dimmsPerSocket: 16, gpuSlots: 8 });
    const two = serverLayout({ sockets: 2, dimmsPerSocket: 16, gpuSlots: 8 });
    expect(two.sockets).toHaveLength(2);
    expect(two.sockets[0]!.x).toBeCloseTo(-two.sockets[1]!.x);
    expect(two.dimms).toHaveLength(32);
    expect(Math.sign(two.dimms[0]!.x - two.sockets[0]!.x)).not.toBe(0);
    const nearest = (x: number) => (Math.abs(x - two.sockets[0]!.x) < Math.abs(x - two.sockets[1]!.x) ? 0 : 1);
    expect(two.dimms.slice(0, 4).map((d) => nearest(d.x))).toEqual([0, 1, 0, 1]);
    expect(two.width).toBeGreaterThan(one.width);
  });

  it('видеокарты — ряд с шагом по центру платы', () => {
    const layout = serverLayout({ sockets: 1, dimmsPerSocket: 12, gpuSlots: 4 });
    expect(layout.gpus.map((g) => g.x)).toEqual([-1.5, -0.5, 0.5, 1.5].map((n) => n * GPU_PITCH));
  });
});
