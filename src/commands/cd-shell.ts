export const ARCHIVER_CD_MARKER_PREFIX = '__ARCHIVER_CD__:';

function ensureSingleLine(value: string, label: string): void {
  if (value.includes('\n') || value.includes('\r')) {
    throw new Error(`${label} contains unsupported newline characters.`);
  }
}

export function formatCdMarker(slotPath: string): string {
  ensureSingleLine(slotPath, 'Archive slot path');
  return `${ARCHIVER_CD_MARKER_PREFIX}${slotPath}`;
}

export async function emitCdTarget(slotPath: string): Promise<void> {
  console.log(formatCdMarker(slotPath));
}
