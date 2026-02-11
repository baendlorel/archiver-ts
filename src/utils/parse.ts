import { parseYearMonth } from './date.js';
import { t } from '../i18n/index.js';

export function parseIdList(values: string[]): number[] {
  if (values.length === 0) {
    throw new Error(t('util.parse.error.at_least_one_id'));
  }

  const ids = values.map((value) => {
    if (!/^\d+$/.test(value)) {
      throw new Error(t('util.parse.error.invalid_id', { id: value }));
    }
    return Number(value);
  });

  const unique = new Set(ids);
  if (unique.size !== ids.length) {
    throw new Error(t('util.parse.error.duplicate_ids'));
  }

  return ids;
}

export type LogRange = { mode: 'all' } | { mode: 'month'; from: string; to: string };

export function parseLogRange(range?: string): LogRange {
  if (!range) {
    return { mode: 'all' };
  }

  if (['all', '*', 'a'].includes(range.toLowerCase())) {
    return { mode: 'all' };
  }

  if (/^\d{6}$/.test(range)) {
    const parsed = parseYearMonth(range);
    if (!parsed) {
      throw new Error(t('util.parse.error.invalid_month_range', { range }));
    }
    return { mode: 'month', from: range, to: range };
  }

  const parts = range.split('-');
  if (parts.length === 2 && /^\d{6}$/.test(parts[0]) && /^\d{6}$/.test(parts[1])) {
    const start = parseYearMonth(parts[0]);
    const end = parseYearMonth(parts[1]);
    if (!start || !end) {
      throw new Error(t('util.parse.error.invalid_range', { range }));
    }
    if (parts[0] > parts[1]) {
      throw new Error(t('util.parse.error.invalid_range_order', { range }));
    }
    return { mode: 'month', from: parts[0], to: parts[1] };
  }

  throw new Error(t('util.parse.error.invalid_range_format', { range }));
}

export function parseVaultReference(value: string): { id?: number; name?: string } {
  if (/^\d+$/.test(value)) {
    return { id: Number(value) };
  }
  return { name: value };
}
