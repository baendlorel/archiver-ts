import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

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

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
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
  it('uses project-local root in development runtime', async () => {
    const projectDir = await mkTempDir('archiver-e2e-dev-');
    const filePath = path.join(projectDir, 'dev-file.txt');
    await fs.writeFile(filePath, 'dev data\n', 'utf8');

    const env = { ARCHIVER_RUNTIME: 'development' };
    await runCli(['config', 'update-check', 'off'], { cwd: projectDir, env });
    await runCli(['put', filePath], { cwd: projectDir, env });

    const rootDir = path.join(projectDir, '.archiver-dev');
    const archivedObjectPath = path.join(rootDir, 'vaults', '0', '1', 'dev-file.txt');
    expect(await pathExists(archivedObjectPath)).toBe(true);

    const cdOutput = await runCli(['cd', '1', '--print'], { cwd: projectDir, env });
    expect(cdOutput.stdout.trim()).toBe(path.join(rootDir, 'vaults', '0', '1'));

    await runCli(['restore', '1'], { cwd: projectDir, env });
    expect(await pathExists(filePath)).toBe(true);
    expect(await pathExists(path.join(rootDir, 'vaults', '0', '1'))).toBe(false);
  });

  it('uses homedir root in production runtime', async () => {
    const projectDir = await mkTempDir('archiver-e2e-prod-');
    const fakeHome = await mkTempDir('archiver-e2e-home-');
    const filePath = path.join(projectDir, 'prod-file.txt');
    await fs.writeFile(filePath, 'prod data\n', 'utf8');

    const env = {
      ARCHIVER_RUNTIME: 'production',
      HOME: fakeHome,
    };

    await runCli(['config', 'update-check', 'off'], { cwd: projectDir, env });
    await runCli(['put', filePath], { cwd: projectDir, env });

    const prodRoot = path.join(fakeHome, '.archiver');
    const archivedObjectPath = path.join(prodRoot, 'vaults', '0', '1', 'prod-file.txt');
    const devRoot = path.join(projectDir, '.archiver-dev');

    expect(await pathExists(archivedObjectPath)).toBe(true);
    expect(await pathExists(devRoot)).toBe(false);

    const cdOutput = await runCli(['cd', '1', '--print'], { cwd: projectDir, env });
    expect(cdOutput.stdout.trim()).toBe(path.join(prodRoot, 'vaults', '0', '1'));
  });
});
