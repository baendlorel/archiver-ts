import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureArvShellWrapper } from '../../src/core/initialize.js';

const tempDirs: string[] = [];

async function makeHome(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arv-init-'));
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

describe('shell wrapper initialize', () => {
  it('creates bash wrapper when missing', async () => {
    const homeDir = await makeHome();
    const result = await ensureArvShellWrapper({
      homeDir,
      shellPath: '/bin/bash',
      stdinIsTTY: true,
      env: {},
    });

    expect(result.installed).toBe(true);
    expect(result.shell).toBe('bash');
    expect(result.reloadCommand).toContain('source');
    const content = await fs.readFile(path.join(homeDir, '.bashrc'), 'utf8');
    expect(content).toContain('# >>> archiver arv wrapper >>>');
    expect(content).toContain('arv() {');
    expect(content).toContain('command arv "$@"');
  });

  it('does not duplicate managed wrapper block and skips second install', async () => {
    const homeDir = await makeHome();
    const first = await ensureArvShellWrapper({
      homeDir,
      shellPath: '/bin/zsh',
      stdinIsTTY: true,
      env: {},
    });
    const second = await ensureArvShellWrapper({
      homeDir,
      shellPath: '/bin/zsh',
      stdinIsTTY: true,
      env: {},
    });

    expect(first.installed).toBe(true);
    expect(second.installed).toBe(false);
    const content = await fs.readFile(path.join(homeDir, '.zshrc'), 'utf8');
    const markerCount = (content.match(/# >>> archiver arv wrapper >>>/g) ?? []).length;
    expect(markerCount).toBe(1);
  });

  it('keeps user-defined arv function untouched', async () => {
    const homeDir = await makeHome();
    const rcPath = path.join(homeDir, '.bashrc');
    await fs.writeFile(
      rcPath,
      `
arv() {
  echo "custom wrapper"
}
`,
      'utf8',
    );

    const result = await ensureArvShellWrapper({
      homeDir,
      shellPath: '/bin/bash',
      stdinIsTTY: true,
      env: {},
    });

    expect(result.installed).toBe(false);
    const content = await fs.readFile(rcPath, 'utf8');
    expect(content).toContain('custom wrapper');
    expect(content).not.toContain('# >>> archiver arv wrapper >>>');
  });

  it('creates fish function file for fish shell', async () => {
    const homeDir = await makeHome();
    const result = await ensureArvShellWrapper({
      homeDir,
      shellPath: '/usr/bin/fish',
      stdinIsTTY: true,
      env: {},
    });

    expect(result.installed).toBe(true);
    expect(result.shell).toBe('fish');
    const fishFunction = await fs.readFile(path.join(homeDir, '.config', 'fish', 'functions', 'arv.fish'), 'utf8');
    expect(fishFunction).toContain('function arv');
    expect(fishFunction).toContain('__ARCHIVER_CD__:');
  });

  it('creates powershell profile wrapper when missing', async () => {
    const homeDir = await makeHome();
    const result = await ensureArvShellWrapper({
      homeDir,
      shellPath: '/usr/bin/pwsh',
      stdinIsTTY: true,
      env: {},
    });

    expect(result.installed).toBe(true);
    expect(result.shell).toBe('powershell');
    expect(result.profilePath).toContain('Microsoft.PowerShell_profile.ps1');
    expect(result.reloadCommand).toContain('. ');
    expect(result.profilePath).toBeDefined();

    const profilePath = result.profilePath ?? '';
    const absoluteProfilePath = profilePath.startsWith('~')
      ? path.join(homeDir, profilePath.slice(2))
      : profilePath;
    const profileContent = await fs.readFile(absoluteProfilePath, 'utf8');
    expect(profileContent).toContain('function arv');
    expect(profileContent).toContain('__ARCHIVER_CD__:');
  });
});
