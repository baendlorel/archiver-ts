import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanDirs, mkTempDir, run } from './mock-cli.js';

afterEach(() => {
  cleanDirs();
});

describe('cli e2e', () => {
  it('uses project-local root when NODE_ENV is not production', () => {
    const projectDir = mkTempDir('archiver-e2e-dev-');
    const prodRoot = mkTempDir('archiver-e2e-dev-prod-root-');
    const filePath = path.join(projectDir, 'dev-file.txt');
    fs.writeFileSync(filePath, 'dev data\n', 'utf8');

    const env = {
      NODE_ENV: 'development',
      ARCHIVER_PATH: prodRoot,
    };

    run(['config', 'update-check', 'off'], { cwd: projectDir, env });
    run(['put', filePath], { cwd: projectDir, env });

    const rootDir = path.join(projectDir, '.archiver');
    const archivedObjectPath = path.join(rootDir, 'vaults', '0', '1', 'dev-file.txt');
    expect(fs.existsSync(archivedObjectPath)).toBe(true);
    expect(fs.existsSync(path.join(prodRoot, 'vaults', '0', '1', 'dev-file.txt'))).toBe(false);

    const cdOutput = run(['cd', '1', '--print'], { cwd: projectDir, env });
    expect(cdOutput.trim()).toBe(path.join(rootDir, 'vaults', '0', '1'));

    run(['restore', '1'], { cwd: projectDir, env });
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.existsSync(path.join(rootDir, 'vaults', '0', '1'))).toBe(false);
  });

  it('uses ARCHIVER_PATH as root in production runtime', () => {
    const projectDir = mkTempDir('archiver-e2e-prod-');
    const fakeHome = mkTempDir('archiver-e2e-home-');
    const customRoot = mkTempDir('archiver-e2e-custom-root-');
    const filePath = path.join(projectDir, 'prod-file.txt');
    fs.writeFileSync(filePath, 'prod data\n', 'utf8');

    const env = {
      NODE_ENV: 'production',
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

    const cdOutput = run(['cd', '1', '--print'], { cwd: projectDir, env });
    expect(cdOutput.trim()).toBe(path.join(customRoot, 'vaults', '0', '1'));
  });
});
