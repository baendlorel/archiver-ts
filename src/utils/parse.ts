import { parseYearMonth } from './date.js';

export function parseIdList(values: string[]): number[] {
  if (values.length === 0) {
    throw new Error('At least one id is required.');
  }

  const ids = values.map((value) => {
    if (!/^\d+$/.test(value)) {
      throw new Error(`Invalid id: ${value}`);
    }
    return Number(value);
  });

  const unique = new Set(ids);
  if (unique.size !== ids.length) {
    throw new Error('Duplicated ids are not allowed.');
  }

  return ids;
}

export type LogRange = { mode: 'tail' } | { mode: 'all' } | { mode: 'month'; from: string; to: string };

export function parseLogRange(range?: string): LogRange {
  if (!range) {
    return { mode: 'tail' };
  }

  if (['all', '*', 'a'].includes(range.toLowerCase())) {
    return { mode: 'all' };
  }

  if (/^\d{6}$/.test(range)) {
    const parsed = parseYearMonth(range);
    if (!parsed) {
      throw new Error(`Invalid month range: ${range}`);
    }
    return { mode: 'month', from: range, to: range };
  }

  const parts = range.split('-');
  if (parts.length === 2 && /^\d{6}$/.test(parts[0]) && /^\d{6}$/.test(parts[1])) {
    const start = parseYearMonth(parts[0]);
    const end = parseYearMonth(parts[1]);
    if (!start || !end) {
      throw new Error(`Invalid range: ${range}`);
    }
    if (parts[0] > parts[1]) {
      throw new Error(`Invalid range order: ${range}`);
    }
    return { mode: 'month', from: parts[0], to: parts[1] };
  }

  throw new Error(`Invalid range format: ${range}. Use YYYYMM, YYYYMM-YYYYMM, all, *, or a.`);
}

export function parseVaultReference(value: string): { id?: number; name?: string } {
  if (/^\d+$/.test(value)) {
    return { id: Number(value) };
  }
  return { name: value };
}
