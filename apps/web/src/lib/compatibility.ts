import type { MotherboardDto, ProductCategory } from '@apex/contracts';

/*
 * Подходит ли плата продукту — чистые функции без обращения к сети.
 * Это первые правила будущего движка конфигуратора (этап 6): TDP процессора против лимита платы,
 * объём модуля против максимума на слот.
 */

export type Fit =
  | { kind: 'ok' }
  | { kind: 'tdp'; max: number }
  | { kind: 'capacity'; max: number }
  | { kind: 'pending' }
  | { kind: 'unknown' };

export type FitSubject = {
  category: ProductCategory;
  /** TDP процессора, Вт */
  tdpW?: number | null;
  /** Ёмкость модуля памяти, ГБ */
  capacityGb?: number | null;
};

export function boardFit(board: MotherboardDto, subject: FitSubject): Fit {
  if (board.isPlaceholder) return { kind: 'pending' };

  switch (subject.category) {
    case 'CPU': {
      if (subject.tdpW == null) return { kind: 'unknown' };
      if (board.maxCpuTdpW == null) return { kind: 'unknown' };
      return board.maxCpuTdpW < subject.tdpW ? { kind: 'tdp', max: board.maxCpuTdpW } : { kind: 'ok' };
    }
    case 'MEMORY': {
      if (subject.capacityGb == null || board.maxMemoryGb == null) return { kind: 'unknown' };
      const perSlot = Math.floor(board.maxMemoryGb / board.dimmSlots);
      return perSlot < subject.capacityGb ? { kind: 'capacity', max: perSlot } : { kind: 'ok' };
    }
    case 'GPU': {
      const slots = (board.pcieX16Slots ?? 0) + Math.floor((board.mcioX8Ports ?? 0) / 2);
      return slots > 0 ? { kind: 'ok' } : { kind: 'unknown' };
    }
    case 'MOTHERBOARD':
      return { kind: 'ok' };
  }
}
