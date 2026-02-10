import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ArchiveStatus, CheckIssueLevel, Paths } from '../../src/consts/index.js';
import { ArchiverContext } from '../../src/core/context.js';
import { ArchiveService } from '../../src/services/archive.js';
import { AuditLogger } from '../../src/services/audit-logger.js';
import { CheckService } from '../../src/services/check.js';
import { ConfigService } from '../../src/services/config.js';
import { VaultService } from '../../src/services/vault.js';

type PathsSnapshot = {
  dir: Record<keyof typeof Paths.Dir, string>;
  file: Record<keyof typeof Paths.File, string>;
};

let snapshot: PathsSnapshot;
let sandboxRoot: string;
let workspaceDir: string;

function applyPaths(rootDir: string): void {
  const coreDir = path.join(rootDir, 'core');

  Object.assign(Paths.Dir, {
    root: rootDir,
    core: coreDir,
    logs: path.join(rootDir, 'logs'),
    vaults: path.join(rootDir, 'vaults'),
  });

  Object.assign(Paths.File, {
    config: path.join(coreDir, 'config.jsonc'),
    autoIncr: path.join(coreDir, 'auto-incr.json'),
    list: path.join(coreDir, 'list.json'),
    vaults: path.join(coreDir, 'vaults.json'),
  });
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function createRuntime(): Promise<{
  context: ArchiverContext;
  archiveService: ArchiveService;
  vaultService: VaultService;
  checkService: CheckService;
}> {
  const context = new ArchiverContext();
  await context.init();

  const configService = new ConfigService(context);
  const logger = new AuditLogger(context);

  return {
    context,
    archiveService: new ArchiveService(context, configService, logger),
    vaultService: new VaultService(context, configService),
    checkService: new CheckService(context),
  };
}

beforeEach(async () => {
  snapshot = {
    dir: { ...Paths.Dir },
    file: { ...Paths.File },
  };

  sandboxRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'archiver-ts-test-'));
  workspaceDir = path.join(sandboxRoot, 'workspace');
  await fs.mkdir(workspaceDir, { recursive: true });

  applyPaths(path.join(sandboxRoot, '.archiver'));
});

afterEach(async () => {
  Object.assign(Paths.Dir, snapshot.dir);
  Object.assign(Paths.File, snapshot.file);

  if (sandboxRoot) {
    await fs.rm(sandboxRoot, { recursive: true, force: true });
  }
});

describe('archive workflow', () => {
  it('archives into <vault>/<id>/<originalName> and restores back', async () => {
    const runtime = await createRuntime();
    const sourceFile = path.join(workspaceDir, 'note.txt');
    await fs.writeFile(sourceFile, 'hello archiver\n', 'utf8');

    const putResult = await runtime.archiveService.put([sourceFile], {
      message: 'save for later',
    });

    expect(putResult.failed).toHaveLength(0);
    expect(putResult.ok).toHaveLength(1);
    expect(putResult.ok[0]?.id).toBe(1);

    const slotPath = runtime.context.archivePath(0, 1);
    const archivedObjectPath = runtime.context.archiveObjectPath(0, 1, 'note.txt');
    expect(await pathExists(sourceFile)).toBe(false);
    expect(await pathExists(slotPath)).toBe(true);
    expect(await pathExists(archivedObjectPath)).toBe(true);

    const entriesAfterPut = await runtime.context.loadListEntries(true);
    expect(entriesAfterPut).toHaveLength(1);
    expect(entriesAfterPut[0]?.status).toBe(ArchiveStatus.Archived);
    expect(entriesAfterPut[0]?.item).toBe('note.txt');

    const restoreResult = await runtime.archiveService.restore([1]);
    expect(restoreResult.failed).toHaveLength(0);
    expect(restoreResult.ok).toHaveLength(1);
    expect(await fs.readFile(sourceFile, 'utf8')).toBe('hello archiver\n');
    expect(await pathExists(slotPath)).toBe(false);

    const entriesAfterRestore = await runtime.context.loadListEntries(true);
    expect(entriesAfterRestore[0]?.status).toBe(ArchiveStatus.Restored);
  });

  it('moves archive slots between vaults and resolves cd targets', async () => {
    const runtime = await createRuntime();
    const sourceFile = path.join(workspaceDir, 'move-me.txt');
    await fs.writeFile(sourceFile, 'move me\n', 'utf8');

    await runtime.archiveService.put([sourceFile], {});
    const createdVault = await runtime.vaultService.createVault({ name: 'work' });
    const targetVault = createdVault.vault;

    const moveResult = await runtime.archiveService.move([1], 'work');
    expect(moveResult.failed).toHaveLength(0);
    expect(moveResult.ok).toHaveLength(1);

    const oldSlotPath = runtime.context.archivePath(0, 1);
    const newSlotPath = runtime.context.archivePath(targetVault.id, 1);
    const movedObjectPath = runtime.context.archiveObjectPath(targetVault.id, 1, 'move-me.txt');

    expect(await pathExists(oldSlotPath)).toBe(false);
    expect(await pathExists(newSlotPath)).toBe(true);
    expect(await pathExists(movedObjectPath)).toBe(true);

    const byId = await runtime.archiveService.resolveCdTarget('1');
    expect(byId.slotPath).toBe(newSlotPath);
    expect(byId.vault.id).toBe(targetVault.id);

    const byVaultAndId = await runtime.archiveService.resolveCdTarget(`work/1`);
    expect(byVaultAndId.slotPath).toBe(newSlotPath);

    await expect(runtime.archiveService.resolveCdTarget(`@/1`)).rejects.toThrow(
      `Archive id 1 is in vault ${targetVault.id}, not 0.`,
    );
  });

  it('check service reports non-directory numeric archive slots as errors', async () => {
    const runtime = await createRuntime();
    const sourceFile = path.join(workspaceDir, 'invalid-slot.txt');
    await fs.writeFile(sourceFile, 'slot validation\n', 'utf8');
    await runtime.archiveService.put([sourceFile], {});

    const slotPath = runtime.context.archivePath(0, 1);
    await fs.rm(slotPath, { recursive: true, force: true });
    await fs.writeFile(slotPath, 'I should be a directory', 'utf8');

    const report = await runtime.checkService.run();
    const issueCodes = report.issues.map((issue) => issue.code);
    expect(issueCodes).toContain('MISSING_ARCHIVE_OBJECT');
    expect(issueCodes).toContain('INVALID_ARCHIVE_SLOT');

    const invalidSlotIssue = report.issues.find((issue) => issue.code === 'INVALID_ARCHIVE_SLOT');
    expect(invalidSlotIssue?.level).toBe(CheckIssueLevel.Error);
  });
});
