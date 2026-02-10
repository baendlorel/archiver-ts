import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';

const createdDirs: string[] = [];

export function cleanDirs() {
  for (const dir of createdDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function mkTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  createdDirs.push(dir);
  return dir;
}
function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

const entry = path.join(import.meta.dirname, '..', '..', 'src', 'index.ts');
export function run(
  args: string[],
  options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
  },
): string {
  const command = ['tsx', entry, ...args].join(' ');
  return execSync(command, {
    cwd: options.cwd,
    env: {
      ...process.env,
      ...options.env,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 1024 * 1024,
  });
}
