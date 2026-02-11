import { beforeEach, describe, expect, it } from 'vitest';
import {
  ARCHIVER_CD_MARKER_PREFIX,
  formatCdMarker,
} from '../../src/commands/cd-shell.js';
import { setLanguage } from '../../src/i18n/index.js';

beforeEach(() => {
  setLanguage('en');
});

describe('cd marker output', () => {
  it('formats slot path as marker line', () => {
    const slotPath = '/tmp/.archiver/vaults/0/1';
    expect(formatCdMarker(slotPath)).toBe(`${ARCHIVER_CD_MARKER_PREFIX}${slotPath}`);
  });

  it('rejects slot paths containing line breaks', () => {
    expect(() => formatCdMarker('/tmp/bad\npath')).toThrow('unsupported newline');
  });
});
