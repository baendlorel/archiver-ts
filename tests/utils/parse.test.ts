import { beforeEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../../src/i18n/index.js';
import { parseIdList, parseLogRange, parseVaultReference } from '../../src/utils/parse.js';

beforeEach(() => {
  setLanguage('en');
});

describe('parseIdList', () => {
  it('parses numeric ids and preserves order', () => {
    expect(parseIdList(['12', '2', '99'])).toEqual([12, 2, 99]);
  });

  it('rejects duplicate ids', () => {
    expect(() => parseIdList(['1', '1'])).toThrow('Duplicated ids are not allowed.');
  });

  it('rejects non-numeric ids', () => {
    expect(() => parseIdList(['1', 'abc'])).toThrow('Invalid id: abc');
  });
});

describe('parseLogRange', () => {
  it('parses default and all ranges', () => {
    expect(parseLogRange()).toEqual({ mode: 'all' });
    expect(parseLogRange('all')).toEqual({ mode: 'all' });
    expect(parseLogRange('*')).toEqual({ mode: 'all' });
  });

  it('parses month ranges', () => {
    expect(parseLogRange('202601')).toEqual({ mode: 'month', from: '202601', to: '202601' });
    expect(parseLogRange('202501-202512')).toEqual({ mode: 'month', from: '202501', to: '202512' });
  });

  it('rejects invalid month format or order', () => {
    expect(() => parseLogRange('202613')).toThrow('Invalid month range: 202613');
    expect(() => parseLogRange('202512-202501')).toThrow('Invalid range order: 202512-202501');
  });
});

describe('parseVaultReference', () => {
  it('returns id for numeric reference', () => {
    expect(parseVaultReference('10')).toEqual({ id: 10 });
  });

  it('returns name for non-numeric reference', () => {
    expect(parseVaultReference('work')).toEqual({ name: 'work' });
  });
});
