import chalk from 'chalk';
import { t } from '../i18n/index.js';

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
  console.log(`${styleBadge(t('terminal.badge.ok'), 'green')} ${chalk.green(message)}`);
}

export function info(message: string): void {
  console.log(`${styleBadge(t('terminal.badge.info'), 'cyan')} ${chalk.cyan(message)}`);
}

export function warn(message: string): void {
  console.log(`${styleBadge(t('terminal.badge.warn'), 'yellow')} ${chalk.yellow(message)}`);
}

export function error(message: string): void {
  console.error(`${styleBadge(t('terminal.badge.error'), 'red')} ${chalk.red(message)}`);
}

export function fatal(message: string): never {
  console.error(`${styleBadge(t('terminal.badge.fatal'), 'red')} ${chalk.red(message)}`);
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
    return status === 'A' ? chalk.green(status) : chalk.green(t('terminal.status.archive.archived'));
  }
  if (status === 'R' || normalized === 'restored') {
    return status === 'R' ? chalk.gray(status) : chalk.gray(t('terminal.status.archive.restored'));
  }
  return status;
}

export function styleVaultStatus(status: string): string {
  if (status === 'Valid') {
    return chalk.green(t('terminal.status.vault.valid'));
  }
  if (status === 'Removed') {
    return chalk.yellow(t('terminal.status.vault.removed'));
  }
  if (status === 'Protected') {
    return chalk.cyan(t('terminal.status.vault.protected'));
  }
  return status;
}

export function styleLogLevel(level: string): string {
  if (level === 'ERROR' || level === 'FATAL') {
    return chalk.red(level === 'ERROR' ? t('terminal.status.log.error') : t('terminal.status.log.fatal'));
  }
  if (level === 'WARN') {
    return chalk.yellow(t('terminal.status.log.warn'));
  }
  if (level === 'INFO') {
    return chalk.cyan(t('terminal.status.log.info'));
  }
  return level;
}
