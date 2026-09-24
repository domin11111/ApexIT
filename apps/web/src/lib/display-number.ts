/** Разбор готовой строки характеристики: «до 1,6 ТБ/с» → префикс «до », число 1,6, суффикс « ТБ/с». */
export function parseDisplayNumber(value: string) {
  const match = /(\d[\d\s  ]*(?:[.,]\d+)?)/.exec(value);
  if (!match || match.index === undefined) return null;
  // Пробел между числом и единицей принадлежит суффиксу
  const raw = match[1]!.replace(/[\s  ]+$/, '');
  const grouped = /[\s  ,]\d{3}(?!\d)/.test(raw) && !/[.,]\d{1,2}$/.test(raw);
  const decimalPart = /[.,](\d{1,2})$/.exec(raw);
  const decimals = grouped ? 0 : (decimalPart?.[1]?.length ?? 0);
  const number = Number(raw.replace(/[\s  ]/g, '').replace(grouped ? /,/g : ',', grouped ? '' : '.'));
  if (!Number.isFinite(number)) return null;
  return {
    prefix: value.slice(0, match.index),
    number,
    decimals,
    grouped,
    suffix: value.slice(match.index + raw.length),
  };
}
