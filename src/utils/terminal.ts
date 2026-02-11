import chalk from 'chalk';

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

function normalizeRow(row: string[], colCount: number): string[] {
  return Array.from({ length: colCount }, (_, index) => row[index] ?? '');
}

export function renderTable(headers: string[], rows: string[][]): string {
  if (headers.length === 0) {
    return '';
  }

  const colCount = headers.length;
  const output: string[] = [];
  output.push(chalk.bold(headers.join('  ')));
  output.push(chalk.dim(headers.map((header) => '-'.repeat(Math.max(header.length, 3))).join('  ')));

  for (const row of rows) {
    output.push(normalizeRow(row, colCount).join('  '));
  }

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
