import type { SeedPlatform } from './schema';

export const platforms: SeedPlatform[] = [
  {
    socket: 'SP5',
    name: 'SP5 · LGA 6096',
    cpuFamily: 'AMD EPYC 9004 / 9005',
    memoryChannels: 12,
    dimmsPerChannel: 2,
    // 6400 МТ/с — максимум для EPYC 9005 на валидированных платах; конкретный CPU может быть ниже (9965 — 6000)
    maxMemorySpeedMts: 6400,
    maxMrdimmSpeedMts: null,
    pcieGen: 5,
    pcieLanes1P: 128,
    pcieLanes2P: 160,
    cxlVersion: '2.0',
    maxSockets: 2,
    maxCpuTdpW: 500,
    status: 'AVAILABLE',
    sortOrder: 10,
  },
  {
    socket: 'SP7',
    name: 'SP7',
    cpuFamily: 'AMD EPYC 9006',
    memoryChannels: 16,
    // AMD ещё не объявила поддержку 2DPC
    dimmsPerChannel: null,
    maxMemorySpeedMts: 8000,
    maxMrdimmSpeedMts: 12800,
    pcieGen: 6,
    pcieLanes1P: 128,
    pcieLanes2P: 160,
    cxlVersion: '3.1',
    maxSockets: 2,
    maxCpuTdpW: 600,
    status: 'COMING_SOON',
    availabilityWindow: 'Q4 2026',
    availabilityNote: ['Первые платформы ожидаются в IV квартале 2026 г.', 'First platforms expected in Q4 2026.'],
    sortOrder: 20,
  },
];
