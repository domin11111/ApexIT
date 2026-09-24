import type { MotherboardDto } from '@apex/contracts';
import { describe, expect, it } from 'vitest';
import { boardFit } from './compatibility';

const board = (patch: Partial<MotherboardDto>): MotherboardDto => ({
  id: '00000000-0000-8000-8000-000000000000',
  vendor: 'Vendor',
  model: 'Board',
  socket: 'SP5',
  formFactor: 'ATX',
  sockets: 1,
  dimmSlots: 12,
  maxMemoryGb: 3072,
  maxCpuTdpW: 400,
  pcieX16Slots: 3,
  mcioX8Ports: 0,
  features: [],
  status: 'AVAILABLE',
  availabilityWindow: null,
  isPlaceholder: false,
  sourceUrl: null,
  note: null,
  ...patch,
});

describe('совместимость плат', () => {
  it('EPYC 9965 (500 Вт) не встаёт в плату с лимитом 400 Вт, встаёт в 500-ваттную', () => {
    expect(boardFit(board({ maxCpuTdpW: 400 }), { category: 'CPU', tdpW: 500 })).toEqual({ kind: 'tdp', max: 400 });
    expect(boardFit(board({ maxCpuTdpW: 500 }), { category: 'CPU', tdpW: 500 })).toEqual({ kind: 'ok' });
  });

  it('модуль 512 ГБ не помещается в плату с 256 ГБ на слот', () => {
    expect(boardFit(board({ maxMemoryGb: 3072, dimmSlots: 12 }), { category: 'MEMORY', capacityGb: 512 })).toEqual({
      kind: 'capacity',
      max: 256,
    });
  });

  it('неизвестные лимиты и будущие платы не выдаются за «подходит»', () => {
    expect(boardFit(board({ maxMemoryGb: null }), { category: 'MEMORY', capacityGb: 512 })).toEqual({ kind: 'unknown' });
    expect(boardFit(board({ isPlaceholder: true }), { category: 'CPU', tdpW: 600 })).toEqual({ kind: 'pending' });
  });

  it('GPU через кабельные райзеры MCIO: два x8 дают один x16', () => {
    expect(boardFit(board({ pcieX16Slots: 0, mcioX8Ports: 18 }), { category: 'GPU' })).toEqual({ kind: 'ok' });
    expect(boardFit(board({ pcieX16Slots: 0, mcioX8Ports: 1 }), { category: 'GPU' })).toEqual({ kind: 'unknown' });
  });
});
