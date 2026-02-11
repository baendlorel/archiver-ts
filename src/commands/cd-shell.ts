export const ARCHIVER_CD_MARKER_PREFIX = '__ARCHIVER_CD__:';
export const ARCHIVER_CD_BACK_MARKER = '__ARCHIVER_CD_BACK__';

interface EmitCdTargetOptions {
  print?: boolean;
}

function ensureSingleLine(value: string, label: string): void {
  if (value.includes('\n') || value.includes('\r')) {
    throw new Error(`${label} contains unsupported newline characters.`);
  }
}

function readPreviousCdPath(): string {
  const previous = process.env.ARCHIVER_PREV_CWD;
  if (!previous) {
    throw new Error('No previous directory recorded for arv cd -.');
  }
  ensureSingleLine(previous, 'Previous directory path');
  return previous;
}

export function formatCdMarker(slotPath: string): string {
  ensureSingleLine(slotPath, 'Archive slot path');
  return `${ARCHIVER_CD_MARKER_PREFIX}${slotPath}`;
}

export function formatCdBackMarker(): string {
  return ARCHIVER_CD_BACK_MARKER;
}

export async function emitCdTarget(
  slotPath: string,
  options: EmitCdTargetOptions = {},
): Promise<void> {
  if (options.print) {
    console.log(slotPath);
    return;
  }

  console.log(formatCdMarker(slotPath));
}

export async function emitCdBackTarget(options: EmitCdTargetOptions = {}): Promise<void> {
  if (options.print) {
    console.log(readPreviousCdPath());
    return;
  }

  console.log(formatCdBackMarker());
}
