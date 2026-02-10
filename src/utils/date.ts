const p = (value: number): string => value.toString().padStart(2, '0');

export const nowIso = (): string => new Date().toISOString();

export function formatDateTime(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = p(date.getMonth() + 1);
  const day = p(date.getDate());
  const hour = p(date.getHours());
  const minute = p(date.getMinutes());
  const second = p(date.getSeconds());

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

export function formatYearMonth(date: Date = new Date()): string {
  return `${date.getFullYear()}${p(date.getMonth() + 1)}`;
}

export function parseDateTime(input: string): Date | undefined {
  const normalized = input.replace(' ', 'T');
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed;
}

export function parseYearMonth(input: string): { year: number; month: number } | undefined {
  if (!/^\d{6}$/.test(input)) {
    return undefined;
  }
  const year = Number(input.slice(0, 4));
  const month = Number(input.slice(4, 6));
  if (month < 1 || month > 12) {
    return undefined;
  }
  return { year, month };
}
