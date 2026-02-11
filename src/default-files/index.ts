import fs from 'node:fs';

declare const __ARCHIVER_BUNDLED_CONFIG_JSONC_RAW__: string | undefined;
declare const __ARCHIVER_BUNDLED_AUTO_INCR_JSONC_RAW__: string | undefined;

function resolveRaw(relativePath: string, bundledRaw: string | undefined): string {
  if (typeof bundledRaw === 'string') {
    return bundledRaw;
  }
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

export const DEFAULT_CONFIG_JSONC_RAW = resolveRaw(
  './config.jsonc',
  typeof __ARCHIVER_BUNDLED_CONFIG_JSONC_RAW__ === 'string'
    ? __ARCHIVER_BUNDLED_CONFIG_JSONC_RAW__
    : undefined,
);

export const DEFAULT_AUTO_INCR_JSONC_RAW = resolveRaw(
  './auto-incr.jsonc',
  typeof __ARCHIVER_BUNDLED_AUTO_INCR_JSONC_RAW__ === 'string'
    ? __ARCHIVER_BUNDLED_AUTO_INCR_JSONC_RAW__
    : undefined,
);
