import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { pathAccessible } from '@/utils/fs.js';

const execFileAsync = promisify(execFile);
const thisDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(thisDir, '..', '..');
const cliEntry = path.join(repoRoot, 'src/index.ts');
const tsxBin = path.join(repoRoot, 'node_modules', '.bin', 'tsx');

const createdDirs: string[] = [];

async function mkTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  createdDirs.push(dir);
  return dir;
}

async function runCli(
  args: string[],
  options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
  },
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(tsxBin, [cliEntry, ...args], {
    cwd: options.cwd,
    env: {
      ...process.env,
      ...options.env,
    },
    maxBuffer: 1024 * 1024,
  });
}

afterEach(async () => {
  await Promise.all(createdDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('cli e2e', () => {
  it('uses project-local root when NODE_ENV is not production', async () => {
    const projectDir = await mkTempDir('archiver-e2e-dev-');
    const prodRoot = await mkTempDir('archiver-e2e-dev-prod-root-');
    const filePath = path.join(projectDir, 'dev-file.txt');
    await fs.writeFile(filePath, 'dev data\n', 'utf8');

    const env = {
      NODE_ENV: 'development',
      ARCHIVER_PATH: prodRoot,
    };
    await runCli(['config', 'update-check', 'off'], { cwd: projectDir, env });
    await runCli(['put', filePath], { cwd: projectDir, env });

    const rootDir = path.join(projectDir, '.archiver');
    const archivedObjectPath = path.join(rootDir, 'vaults', '0', '1', 'dev-file.txt');
    expect(await pathAccessible(archivedObjectPath)).toBe(true);
    expect(await pathAccessible(path.join(prodRoot, 'vaults', '0', '1', 'dev-file.txt'))).toBe(false);

    const cdOutput = await runCli(['cd', '1', '--print'], { cwd: projectDir, env });
    expect(cdOutput.stdout.trim()).toBe(path.join(rootDir, 'vaults', '0', '1'));

    await runCli(['restore', '1'], { cwd: projectDir, env });
    expect(await pathAccessible(filePath)).toBe(true);
    expect(await pathAccessible(path.join(rootDir, 'vaults', '0', '1'))).toBe(false);
  });

  it('uses ARCHIVER_PATH as root in production runtime', async () => {
    const projectDir = await mkTempDir('archiver-e2e-prod-');
    const fakeHome = await mkTempDir('archiver-e2e-home-');
    const customRoot = await mkTempDir('archiver-e2e-custom-root-');
    const filePath = path.join(projectDir, 'prod-file.txt');
    await fs.writeFile(filePath, 'prod data\n', 'utf8');

    const env = {
      NODE_ENV: 'production',
      ARCHIVER_PATH: customRoot,
      HOME: fakeHome,
    };

    await runCli(['config', 'update-check', 'off'], { cwd: projectDir, env });
    await runCli(['put', filePath], { cwd: projectDir, env });

    const archivedObjectPath = path.join(customRoot, 'vaults', '0', '1', 'prod-file.txt');
    const devRoot = path.join(projectDir, '.archiver');
    const homeRoot = path.join(fakeHome, '.archiver');

    expect(await pathAccessible(archivedObjectPath)).toBe(true);
    expect(await pathAccessible(devRoot)).toBe(false);
    expect(await pathAccessible(homeRoot)).toBe(false);

    const cdOutput = await runCli(['cd', '1', '--print'], { cwd: projectDir, env });
    expect(cdOutput.stdout.trim()).toBe(path.join(customRoot, 'vaults', '0', '1'));
  });
});
