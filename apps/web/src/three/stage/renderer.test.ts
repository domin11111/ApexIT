import { describe, expect, it } from 'vitest';
import { isSoftwareRenderer } from './renderer';

describe('isSoftwareRenderer', () => {
  it('программный WebGL — на статичные рендеры', () => {
    for (const name of [
      'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
      'Google SwiftShader',
      'llvmpipe (LLVM 15.0.7, 256 bits)',
      'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)',
    ])
      expect(isSoftwareRenderer(name), name).toBe(true);
  });

  it('видеокарта — 3D-сцена', () => {
    for (const name of [
      'ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Ti (0x00002C05) Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'Apple GPU',
      'Adreno (TM) 740',
      'Mali-G715',
      'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    ])
      expect(isSoftwareRenderer(name), name).toBe(false);
  });
});
