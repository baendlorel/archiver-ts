import { t } from '../i18n/index.js';

export const ARCHIVER_CD_MARKER_PREFIX = '__ARCHIVER_CD__:';

function ensureSingleLine(value: string, label: string): void {
  if (value.includes('\n') || value.includes('\r')) {
    throw new Error(
      t('util.cd.error.newline_not_supported', {
        label,
      }),
    );
  }
}

export function formatCdMarker(slotPath: string): string {
  ensureSingleLine(slotPath, t('util.cd.label.archive_slot_path'));
  return `${ARCHIVER_CD_MARKER_PREFIX}${slotPath}`;
}

export async function emitCdTarget(slotPath: string): Promise<void> {
  console.log(formatCdMarker(slotPath));
}
