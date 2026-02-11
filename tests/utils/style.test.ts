import { describe, expect, it } from 'vitest';
import chalk from 'chalk';
import { applyStyleSetting, resolveStyleSetting } from '../../src/utils/style.js';

describe('style config/env resolution', () => {
  it('uses config value when env override is missing', () => {
    expect(resolveStyleSetting('on', {})).toBe('on');
    expect(resolveStyleSetting('off', {})).toBe('off');
  });

  it('allows ARCHIVER_STYLE to override config', () => {
    expect(resolveStyleSetting('off', { ARCHIVER_STYLE: 'on' })).toBe('on');
    expect(resolveStyleSetting('on', { ARCHIVER_STYLE: 'off' })).toBe('off');
  });

  it('ignores invalid ARCHIVER_STYLE values', () => {
    expect(resolveStyleSetting('on', { ARCHIVER_STYLE: 'maybe' })).toBe('on');
  });

  it('forces color when style is on and disables when style is off', () => {
    const original = chalk.level;
    try {
      applyStyleSetting('on');
      expect(chalk.level).toBeGreaterThan(0);

      applyStyleSetting('off');
      expect(chalk.level).toBe(0);
    } finally {
      chalk.level = original;
    }
  });
});
