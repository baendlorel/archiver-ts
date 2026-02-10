import fs from 'node:fs/promises';

export const CWD_HANDOFF_FILE_ENV = 'ARV_CWD_HANDOFF_FILE';

export async function writeCwdHandoff(slotPath: string): Promise<boolean> {
  const outputFile = process.env[CWD_HANDOFF_FILE_ENV]?.trim();
  if (!outputFile) {
    return false;
  }

  await fs.writeFile(outputFile, `${slotPath}\n`, 'utf8');
  return true;
}
