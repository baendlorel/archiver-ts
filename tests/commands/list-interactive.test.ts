import { describe, expect, it } from 'vitest';
import { ArchiveStatus } from '../../src/consts/index.js';
import { filterInteractiveEntries, isActionAvailable, type InteractiveListEntry } from '../../src/commands/list-interactive.js';

function makeEntry(status: ArchiveStatus): InteractiveListEntry {
  return {
    id: 1,
    status,
    title: '@(0)/demo.txt',
    path: '/tmp/demo.txt',
    vaultId: 0,
    vaultName: '@(0)',
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

  it('filters by status, vault and fuzzy query', () => {
    const entries: InteractiveListEntry[] = [
      { ...makeEntry(ArchiveStatus.Archived), id: 1, title: 'report-final.txt', vaultId: 0, vaultName: '@(0)' },
      { ...makeEntry(ArchiveStatus.Restored), id: 2, title: 'random-notes.md', vaultId: 1, vaultName: 'work(1)' },
      { ...makeEntry(ArchiveStatus.Archived), id: 3, title: 'release-notes.md', vaultId: 1, vaultName: 'work(1)' },
    ];

    const filtered = filterInteractiveEntries(entries, 'archived', 1, 'rnts');
    expect(filtered.map((entry) => entry.id)).toEqual([3]);
  });
});
