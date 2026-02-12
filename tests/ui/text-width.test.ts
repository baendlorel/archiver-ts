import { describe, expect, it } from 'vitest';
import { getDisplayWidth, padDisplayWidth } from '../../src/ui/text-width.js';

describe('ui text width', () => {
  it('counts ASCII as single-width', () => {
    expect(getDisplayWidth('abc')).toBe(3);
  });

  it('counts Chinese characters as double-width', () => {
    expect(getDisplayWidth('中文')).toBe(4);
  });

  it('pads string by display width instead of character length', () => {
    expect(padDisplayWidth('中a', 4)).toBe('中a ');
  });
});
