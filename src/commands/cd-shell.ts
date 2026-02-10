export const ARCHIVER_CD_MARKER_PREFIX = '__ARCHIVER_CD__:';

interface EmitCdTargetOptions {
  print?: boolean;
}

export function formatCdMarker(slotPath: string): string {
  if (slotPath.includes('\n') || slotPath.includes('\r')) {
    throw new Error('Archive slot path contains unsupported newline characters.');
  }
  return `${ARCHIVER_CD_MARKER_PREFIX}${slotPath}`;
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
