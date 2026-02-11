import fs from 'node:fs';
import path from 'node:path';

function resolveDefaultFilePath(fileName: string): string {
  const distPath = path.join(import.meta.dirname, fileName);
  if (process.env.NODE_ENV === 'production' && fs.existsSync(distPath)) {
    return distPath;
  }
  return path.resolve(import.meta.dirname, '..', '..', 'public', fileName);
}

function readDefaultFile(fileName: string): string {
  return fs.readFileSync(resolveDefaultFilePath(fileName), 'utf8');
}

export const DEFAULT_CONFIG_JSONC_RAW = readDefaultFile('config.default.jsonc');
export const DEFAULT_AUTO_INCR_JSONC_RAW = readDefaultFile('auto-incr.default.jsonc');
