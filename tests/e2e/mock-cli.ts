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

interface E2EConfig {
  currentVaultId: number;
  updateCheck: 'on' | 'off';
  lastUpdateCheck: string;
  style: 'on' | 'off';
  language: 'zh' | 'en';
  vaultItemSeparator: string;
  noCommandAction: 'help' | 'list' | 'unknown';
}

const DEFAULT_TEST_CONFIG: E2EConfig = {
  currentVaultId: 0,
  updateCheck: 'off',
  lastUpdateCheck: '',
  style: 'on',
  language: 'zh',
  vaultItemSeparator: '::',
  noCommandAction: 'unknown',
};

function resolveRoot(cwd: string, env?: NodeJS.ProcessEnv): string {
  const mergedEnv = {
    ...process.env,
    ...env,
  };
  if (mergedEnv.IS_PROD) {
    return mergedEnv.ARCHIVER_PATH ?? path.join(mergedEnv.HOME ?? mergedEnv.USERPROFILE ?? os.homedir(), '.archiver');
  }
  return path.join(cwd, '.archiver');
}

export function writeConfig(cwd: string, env?: NodeJS.ProcessEnv, overrides: Partial<E2EConfig> = {}): string {
  const root = resolveRoot(cwd, env);
  fs.mkdirSync(root, { recursive: true });

  const configPath = path.join(root, 'config.jsonc');
  const config: E2EConfig = {
    ...DEFAULT_TEST_CONFIG,
    ...overrides,
  };
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

  return configPath;
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
