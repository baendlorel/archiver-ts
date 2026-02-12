import { describe, expect, it } from 'vitest';
import { layoutFullscreenHintStatusLines, layoutFullscreenLines } from '../../src/ui/screen.js';

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
});
