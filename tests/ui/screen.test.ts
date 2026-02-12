import { describe, expect, it } from 'vitest';
import {
  isTerminalSizeEnough,
  layoutFullscreenHintStatusLines,
  layoutFullscreenLines,
  resolveTerminalSize,
} from '../../src/ui/screen.js';

describe('ui screen layout', () => {
  it('pads empty lines so footer stays at bottom', () => {
    const lines = layoutFullscreenLines({
      contentLines: ['title', 'body'],
      footerLines: ['hint'],
      rows: 6,
    });

    expect(lines).toEqual(['title', 'body', '', '', '', 'hint']);
  });

  it('does not pad when content already fills available rows', () => {
    const lines = layoutFullscreenLines({
      contentLines: ['a', 'b', 'c'],
      footerLines: ['d', 'e'],
      rows: 4,
    });

    expect(lines).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('keeps hint/status on the last two lines', () => {
    const lines = layoutFullscreenHintStatusLines({
      contentLines: ['title'],
      hintLine: 'hint',
      statusLine: 'status',
      rows: 5,
    });

    expect(lines).toEqual(['title', '', '', 'hint', 'status']);
  });

  it('normalizes invalid terminal size values', () => {
    expect(resolveTerminalSize({ rows: 0, columns: NaN })).toEqual({ rows: 24, columns: 80 });
    expect(resolveTerminalSize({ rows: 18.8, columns: 120.2 })).toEqual({ rows: 18, columns: 120 });
  });

  it('checks terminal minimum size', () => {
    expect(isTerminalSizeEnough({ rows: 24, columns: 80 }, { rows: 10, columns: 40 })).toBe(true);
    expect(isTerminalSizeEnough({ rows: 9, columns: 80 }, { rows: 10, columns: 40 })).toBe(false);
    expect(isTerminalSizeEnough({ rows: 24, columns: 39 }, { rows: 10, columns: 40 })).toBe(false);
  });
});
