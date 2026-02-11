import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ensureJsoncFileWithTemplate,
  parseJsoncText,
  readJsoncFile,
  writeJsoncFileKeepingComments,
} from '../../src/utils/json.js';

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arv-json-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
});

describe('jsonc utilities', () => {
  it('parses JSONC with comments and trailing comma', () => {
    const parsed = parseJsoncText<{ value: number }>(
      `{
  // a comment
  "value": 1,
}
`,
      'inline',
    );
    expect(parsed.value).toBe(1);
  });

  it('creates missing jsonc file from template with comments', async () => {
    const dir = await makeTempDir();
    const filePath = path.join(dir, 'config.jsonc');
    const template = `{
  // style comment
  "style": "on",
}
`;

    await ensureJsoncFileWithTemplate(filePath, template);
    const content = await fs.readFile(filePath, 'utf8');
    expect(content).toContain('// style comment');
    const parsed = await readJsoncFile<{ style: string }>(filePath, { style: 'off' });
    expect(parsed.style).toBe('on');
  });

  it('keeps comments when updating jsonc values', async () => {
    const dir = await makeTempDir();
    const filePath = path.join(dir, 'config.jsonc');
    const template = `{
  // style comment
  "style": "on",
  // count comment
  "count": 0,
}
`;

    await fs.writeFile(filePath, template, 'utf8');
    await writeJsoncFileKeepingComments(filePath, { style: 'off', count: 3 }, template);

    const content = await fs.readFile(filePath, 'utf8');
    expect(content).toContain('// style comment');
    expect(content).toContain('// count comment');
    expect(content).toContain('"style": "off"');
    expect(content).toContain('"count": 3');
  });
});
