import { describe, expect, it } from 'vitest';
import { ArchiveStatus } from '../../src/consts/index.js';
import { isActionAvailable, type InteractiveListEntry } from '../../src/commands/list-interactive.js';

function makeEntry(status: ArchiveStatus): InteractiveListEntry {
  return {
    id: 1,
    status,
    title: '@(0)/demo.txt',
    path: '/tmp/demo.txt',
  };
}

describe('list interactive', () => {
  it('allows enter/restore actions for archived entries', () => {
    const entry = makeEntry(ArchiveStatus.Archived);
    expect(isActionAvailable(entry, 'enter')).toBe(true);
    expect(isActionAvailable(entry, 'restore')).toBe(true);
  });

  it('disables enter/restore actions for restored entries', () => {
    const entry = makeEntry(ArchiveStatus.Restored);
    expect(isActionAvailable(entry, 'enter')).toBe(false);
    expect(isActionAvailable(entry, 'restore')).toBe(false);
  });
});
