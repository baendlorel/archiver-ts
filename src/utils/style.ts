import chalk from 'chalk';
import type { ArchiverConfig } from '../global.js';

const detectedChalkLevel = chalk.level;

export type StyleSetting = ArchiverConfig['style'];

function normalizeStyleSetting(value: unknown): StyleSetting | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'on' || normalized === 'off') {
    return normalized;
  }
  return undefined;
}

export function resolveStyleSetting(configStyle: StyleSetting, env: NodeJS.ProcessEnv = process.env): StyleSetting {
  const envStyle = normalizeStyleSetting(env.ARCHIVER_STYLE);
  return envStyle ?? configStyle;
}

export function applyStyleSetting(style: StyleSetting): void {
  if (style === 'off') {
    chalk.level = 0;
    return;
  }

  // Force basic ANSI colors by default, even when stdout is piped by shell wrapper.
  chalk.level = Math.max(detectedChalkLevel, 1) as 1 | 2 | 3;
}

export function applyStyleFromConfig(
  config: Pick<ArchiverConfig, 'style'>,
  env: NodeJS.ProcessEnv = process.env,
): StyleSetting {
  const style = resolveStyleSetting(config.style, env);
  applyStyleSetting(style);
  return style;
}
