import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import wrapAnsi from 'wrap-ansi';

const MIN_COLUMN_WIDTH = 6;

function styleBadge(label: string, color: 'green' | 'cyan' | 'yellow' | 'red'): string {
  if (color === 'green') {
    return chalk.black.bgGreen(` ${label} `);
  }
  if (color === 'cyan') {
    return chalk.black.bgCyan(` ${label} `);
  }
  if (color === 'yellow') {
    return chalk.black.bgYellow(` ${label} `);
  }
  return chalk.white.bgRed(` ${label} `);
}

export function success(message: string): void {
  console.log(`${styleBadge('OK', 'green')} ${chalk.green(message)}`);
}

export function info(message: string): void {
  console.log(`${styleBadge('INFO', 'cyan')} ${chalk.cyan(message)}`);
}

export function warn(message: string): void {
  console.log(`${styleBadge('WARN', 'yellow')} ${chalk.yellow(message)}`);
}

export function error(message: string): void {
  console.error(`${styleBadge('ERROR', 'red')} ${chalk.red(message)}`);
}

export function fatal(message: string): never {
  console.error(`${styleBadge('FATAL', 'red')} ${chalk.red(message)}`);
  process.exit(1);
}

function visibleLength(value: string): number {
  return stripAnsi(value).length;
}

function padAnsi(value: string, width: number): string {
  const missing = width - visibleLength(value);
  if (missing <= 0) {
    return value;
  }
  return `${value}${' '.repeat(missing)}`;
}

function wrapCell(value: string, width: number): string[] {
  const wrapped = wrapAnsi(value, width, {
    hard: true,
    trim: false,
    wordWrap: true,
  });
  return wrapped.split('\n');
}

function computeColumnWidths(headers: string[], rows: string[][], maxWidth: number): number[] {
  const colCount = headers.length;
  const widths = new Array<number>(colCount).fill(MIN_COLUMN_WIDTH);

  for (let column = 0; column < colCount; column += 1) {
    widths[column] = Math.max(widths[column], visibleLength(headers[column]));
    for (const row of rows) {
      widths[column] = Math.max(widths[column], visibleLength(row[column] ?? ''));
    }
  }

  const frameWidth = 3 * colCount + 1;
  let total = widths.reduce((sum, value) => sum + value, 0) + frameWidth;

  while (total > maxWidth) {
    let changed = false;
    let largestColumn = -1;
    let largestWidth = 0;

    for (let i = 0; i < colCount; i += 1) {
      if (widths[i] > largestWidth && widths[i] > MIN_COLUMN_WIDTH) {
        largestColumn = i;
        largestWidth = widths[i];
      }
    }

    if (largestColumn === -1) {
      break;
    }

    widths[largestColumn] -= 1;
    total -= 1;
    changed = true;

    if (!changed) {
      break;
    }
  }

  return widths;
}

function renderSeparator(widths: number[]): string {
  const chunks = widths.map((width) => '-'.repeat(width + 2));
  return `+${chunks.join('+')}+`;
}

function renderRow(cells: string[], widths: number[]): string[] {
  const wrappedCells = cells.map((cell, index) => wrapCell(cell ?? '', widths[index]));
  const rowHeight = wrappedCells.reduce((max, lines) => Math.max(max, lines.length), 1);

  const lines: string[] = [];
  for (let lineIndex = 0; lineIndex < rowHeight; lineIndex += 1) {
    const chunks = wrappedCells.map((cellLines, colIndex) => {
      const line = cellLines[lineIndex] ?? '';
      return ` ${padAnsi(line, widths[colIndex])} `;
    });
    lines.push(`|${chunks.join('|')}|`);
  }

  return lines;
}

export function renderTable(headers: string[], rows: string[][]): string {
  if (headers.length === 0) {
    return '';
  }

  const terminalWidth = Math.max(process.stdout.columns ?? 120, 80);
  const widths = computeColumnWidths(headers, rows, terminalWidth);

  const output: string[] = [];
  output.push(renderSeparator(widths));
  output.push(...renderRow(headers, widths));
  output.push(renderSeparator(widths));

  for (const row of rows) {
    output.push(...renderRow(row, widths));
  }

  output.push(renderSeparator(widths));
  return output.join('\n');
}

export function styleArchiveStatus(status: string): string {
  const normalized = status.toLowerCase();
  if (status === 'A' || normalized === 'archived') {
    return chalk.green(status);
  }
  if (status === 'R' || normalized === 'restored') {
    return chalk.gray(status);
  }
  return status;
}

export function styleVaultStatus(status: string): string {
  if (status === 'Valid') {
    return chalk.green(status);
  }
  if (status === 'Removed') {
    return chalk.yellow(status);
  }
  if (status === 'Protected') {
    return chalk.cyan(status);
  }
  return status;
}

export function styleLogLevel(level: string): string {
  if (level === 'ERROR' || level === 'FATAL') {
    return chalk.red(level);
  }
  if (level === 'WARN') {
    return chalk.yellow(level);
  }
  if (level === 'INFO') {
    return chalk.cyan(level);
  }
  return level;
}
