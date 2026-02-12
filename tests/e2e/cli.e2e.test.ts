import fs from 'node:fs';
import path from 'node:path';
import stripAnsi from 'strip-ansi';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanDirs, mkTempDir, run } from './mock-cli.js';

afterEach(() => {
  cleanDirs();
});

describe('cli e2e', () => {
  it('uses project-local root when IS_PROD is falsy', () => {
    const projectDir = mkTempDir('archiver-e2e-dev-');
    const prodRoot = mkTempDir('archiver-e2e-dev-prod-root-');
    const filePath = path.join(projectDir, 'dev-file.txt');
    fs.writeFileSync(filePath, 'dev data\n', 'utf8');

    const env = {
      ARCHIVER_PATH: prodRoot,
    };

    run(['config', 'update-check', 'off'], { cwd: projectDir, env });
    run(['put', filePath], { cwd: projectDir, env });

    const rootDir = path.join(projectDir, '.archiver');
    const archivedObjectPath = path.join(rootDir, 'vaults', '0', '1', 'dev-file.txt');
    expect(fs.existsSync(archivedObjectPath)).toBe(true);
    expect(fs.existsSync(path.join(prodRoot, 'vaults', '0', '1', 'dev-file.txt'))).toBe(false);

    run(['restore', '1'], { cwd: projectDir, env });
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.existsSync(path.join(rootDir, 'vaults', '0', '1'))).toBe(false);
  });

  it('uses ARCHIVER_PATH as root when IS_PROD is truthy', () => {
    const projectDir = mkTempDir('archiver-e2e-prod-');
    const fakeHome = mkTempDir('archiver-e2e-home-');
    const customRoot = mkTempDir('archiver-e2e-custom-root-');
    const filePath = path.join(projectDir, 'prod-file.txt');
    fs.writeFileSync(filePath, 'prod data\n', 'utf8');

    const env = {
      IS_PROD: '1',
      ARCHIVER_PATH: customRoot,
      HOME: fakeHome,
    };

    run(['config', 'update-check', 'off'], { cwd: projectDir, env });
    run(['put', filePath], { cwd: projectDir, env });

    const archivedObjectPath = path.join(customRoot, 'vaults', '0', '1', 'prod-file.txt');
    const devRoot = path.join(projectDir, '.archiver');
    const homeRoot = path.join(fakeHome, '.archiver');

    expect(fs.existsSync(archivedObjectPath)).toBe(true);
    expect(fs.existsSync(devRoot)).toBe(false);
    expect(fs.existsSync(homeRoot)).toBe(false);
  });

  it('prints id for list and supports grep-friendly --plain output', () => {
    const projectDir = mkTempDir('archiver-e2e-list-');
    const defaultFilePath = path.join(projectDir, 'list-file.txt');
    const vaultFilePath = path.join(projectDir, 'list-file-in-work.txt');
    fs.writeFileSync(defaultFilePath, 'list data\n', 'utf8');
    fs.writeFileSync(vaultFilePath, 'list data in work\n', 'utf8');

    const env = {
      NODE_ENV: 'development',
    };

    run(['config', 'update-check', 'off'], { cwd: projectDir, env });
    run(['put', defaultFilePath], { cwd: projectDir, env });
    run(['vault', 'create', 'work'], { cwd: projectDir, env });
    run(['put', '--vault', 'work', vaultFilePath], { cwd: projectDir, env });

    const output = stripAnsi(run(['list'], { cwd: projectDir, env }));
    expect(output).toContain('[0001] A list-file.txt');
    expect(output).toContain('[0002] A work(1)::list-file-in-work.txt');
    expect(output).not.toContain('@(0)');

    const plainOutput = run(['list', '--plain'], { cwd: projectDir, env });
    expect(plainOutput).toContain('1\tA\tlist-file.txt');
    expect(plainOutput).toContain('2\tA\twork(1)::list-file-in-work.txt');
  });

  it('prints vault list as id and name only', () => {
    const projectDir = mkTempDir('archiver-e2e-vault-list-');
    const env = {
      NODE_ENV: 'development',
    };

    run(['config', 'update-check', 'off'], { cwd: projectDir, env });
    run(['vault', 'create', 'work'], { cwd: projectDir, env });

    const output = run(['vault', 'list'], { cwd: projectDir, env });
    expect(output).toContain('  0  @');
    expect(output).toContain('  1  work');
    expect(output).not.toContain('Valid');
    expect(output).not.toContain('Created At');
  });

  it('prints nothing in --plain mode when no entries match', () => {
    const projectDir = mkTempDir('archiver-e2e-list-empty-');
    const env = {
      NODE_ENV: 'development',
    };

    run(['config', 'update-check', 'off'], { cwd: projectDir, env });
    const output = run(['list', '--plain'], { cwd: projectDir, env });
    expect(output).toBe('');
  });

  it('shows help text when no-command-action is unknown and stdin is not TTY', () => {
    const projectDir = mkTempDir('archiver-e2e-no-command-help-');
    const env = {
      NODE_ENV: 'development',
    };

    run(['config', 'update-check', 'off'], { cwd: projectDir, env });
    const output = run([], { cwd: projectDir, env });
    expect(output).toContain('Usage: archiver');
  });

  it('accepts no-command-action unknown in config', () => {
    const projectDir = mkTempDir('archiver-e2e-no-command-unknown-');
    const env = {
      NODE_ENV: 'development',
    };

    run(['config', 'update-check', 'off'], { cwd: projectDir, env });
    run(['config', 'no-command-action', 'unknown'], { cwd: projectDir, env });

    const output = run(['config', 'list'], { cwd: projectDir, env });
    expect(output).toContain('"noCommandAction": "unknown"');
  });

  it('shows TTY error when running config edit in non-TTY mode', () => {
    const projectDir = mkTempDir('archiver-e2e-config-edit-no-tty-');
    const env = {
      NODE_ENV: 'development',
    };

    run(['config', 'update-check', 'off'], { cwd: projectDir, env });
    expect(() => run(['config', 'edit'], { cwd: projectDir, env })).toThrow(/TTY/);
  });

  it('uses zh as default language and supports switching to en', () => {
    const projectDir = mkTempDir('archiver-e2e-language-');
    const env = {
      NODE_ENV: 'development',
    };

    run(['config', 'update-check', 'off'], { cwd: projectDir, env });
    const before = run(['config', 'list'], { cwd: projectDir, env });
    expect(before).toContain('"language": "zh"');

    run(['config', 'language', 'en'], { cwd: projectDir, env });
    const after = run(['config', 'list'], { cwd: projectDir, env });
    expect(after).toContain('"language": "en"');
  });

  it('runs list when no-command-action is list', () => {
    const projectDir = mkTempDir('archiver-e2e-no-command-list-');
    const filePath = path.join(projectDir, 'no-command.txt');
    fs.writeFileSync(filePath, 'no command data\n', 'utf8');

    const env = {
      NODE_ENV: 'development',
    };

    run(['config', 'update-check', 'off'], { cwd: projectDir, env });
    run(['put', filePath], { cwd: projectDir, env });
    run(['config', 'no-command-action', 'list'], { cwd: projectDir, env });

    const output = stripAnsi(run([], { cwd: projectDir, env }));
    expect(output).toContain('[0001] A no-command.txt');
  });

});
