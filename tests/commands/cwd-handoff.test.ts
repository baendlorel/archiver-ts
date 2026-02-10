import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CWD_HANDOFF_FILE_ENV, writeCwdHandoff } from '../../src/commands/cwd-handoff.js';

const originalEnvValue = process.env[CWD_HANDOFF_FILE_ENV];

afterEach(async () => {
  if (originalEnvValue === undefined) {
    delete process.env[CWD_HANDOFF_FILE_ENV];
  } else {
    process.env[CWD_HANDOFF_FILE_ENV] = originalEnvValue;
  }
});

describe('cwd handoff', () => {
  it('returns false when no handoff file is configured', async () => {
    delete process.env[CWD_HANDOFF_FILE_ENV];
    await expect(writeCwdHandoff('/tmp/noop')).resolves.toBe(false);
  });

  it('writes selected slot path to handoff file', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arv-cwd-handoff-'));
    const outputFile = path.join(tmpDir, 'cwd.txt');
    process.env[CWD_HANDOFF_FILE_ENV] = outputFile;

    await expect(writeCwdHandoff('/tmp/archive-slot')).resolves.toBe(true);
    await expect(fs.readFile(outputFile, 'utf8')).resolves.toBe('/tmp/archive-slot\n');

    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});
