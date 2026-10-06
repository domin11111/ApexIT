import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let dataDir: string;

async function load() {
  vi.resetModules();
  vi.stubEnv('APEX_DATA_DIR', dataDir);
  return import('./services');
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'apex-data-'));
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dataDir, { recursive: true, force: true });
});

const PAYLOAD = {
  schemaVersion: 1,
  socket: 'SP5',
  motherboardId: null,
  cpu: { slug: 'epyc-9965', count: 1 },
  memory: null,
  gpu: { slug: 'rtx-pro-6000-blackwell', count: 2 },
} as const;

describe('сборки конфигуратора без базы (файловое хранилище)', () => {
  it('код стабилен, сборка переживает перезапуск процесса', async () => {
    const { shareCode } = await (await load()).localConfigurator().save(PAYLOAD);
    expect(shareCode).toMatch(/^[a-hjkmnp-z2-9]{10}$/);
    expect((await (await load()).localConfigurator().save(PAYLOAD)).shareCode).toBe(shareCode);

    // «Новый процесс»: модуль загружен заново и читает файл
    const saved = await (await load()).localConfigurator().load(shareCode);
    expect(saved.payload).toEqual(PAYLOAD);
    expect(saved.totals.vramGb).toBeGreaterThan(0);
  });

  it('несовместимую сборку не сохраняет, неизвестный код — 404', async () => {
    const configurator = (await load()).localConfigurator();
    await expect(configurator.save({ ...PAYLOAD, socket: 'SP7' })).rejects.toMatchObject({ code: 'CONFIGURATION_INVALID' });
    await expect(configurator.load('aaaaaaaaaa')).rejects.toMatchObject({ code: 'CONFIGURATION_NOT_FOUND', status: 404 });
  });
});
