import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { listCurrentDirectoryEntries, sortDotEntries, type DotEntry } from '../../src/commands/dot-interactive.js';

const createdDirs: string[] = [];

async function mkTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  createdDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(createdDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('dot interactive', () => {
  it('sorts directories before files and compares names case-insensitively', () => {
    const entries: DotEntry[] = [
      { name: 'z-file.txt', fullPath: '/tmp/z-file.txt', isDirectory: false },
      { name: 'b-dir', fullPath: '/tmp/b-dir', isDirectory: true },
      { name: 'A-dir', fullPath: '/tmp/A-dir', isDirectory: true },
      { name: 'A-file.txt', fullPath: '/tmp/A-file.txt', isDirectory: false },
    ];

    expect(sortDotEntries(entries).map((item) => item.name)).toEqual(['A-dir', 'b-dir', 'A-file.txt', 'z-file.txt']);
  });

  it('lists current directory entries with directory flags and sorted order', async () => {
    const cwd = await mkTempDir('archiver-dot-interactive-');
    await fs.mkdir(path.join(cwd, 'beta'));
    await fs.mkdir(path.join(cwd, 'Alpha'));
    await fs.writeFile(path.join(cwd, 'zeta.txt'), 'z\n', 'utf8');
    await fs.writeFile(path.join(cwd, 'Alpha.txt'), 'a\n', 'utf8');

    const listed = await listCurrentDirectoryEntries(cwd);
    expect(listed.map((item) => item.name)).toEqual(['Alpha', 'beta', 'Alpha.txt', 'zeta.txt']);
    expect(listed.slice(0, 2).every((item) => item.isDirectory)).toBe(true);
    expect(listed.slice(2).every((item) => !item.isDirectory)).toBe(true);
  });
});
