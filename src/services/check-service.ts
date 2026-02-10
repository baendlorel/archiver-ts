import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_VAULT_ID } from '../constants.js';
import { ArchiverContext } from '../core/context.js';
import type { CheckIssue, CheckReport, ListEntry, LogEntry, Vault } from '../global.js';
import { listDirectories, pathAccessible, safeLstat } from '../utils/fs.js';
import { readJsonLinesFile } from '../utils/json.js';

function findDuplicates(values: number[]): number[] {
  const seen = new Set<number>();
  const duplicate = new Set<number>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicate.add(value);
    } else {
      seen.add(value);
    }
  }

  return [...duplicate].sort((a, b) => a - b);
}

function pushIssue(issues: CheckIssue[], level: CheckIssue['level'], code: string, message: string): void {
  issues.push({ level, code, message });
}

export class CheckService {
  constructor(private readonly context: ArchiverContext) {}

  async run(): Promise<CheckReport> {
    const report: CheckReport = {
      issues: [],
      info: [],
    };

    await this.checkRequiredPaths(report);

    const config = await this.context.loadConfig();
    const auto = await this.context.loadAutoIncr();
    const listEntries = await this.context.loadListEntries();
    const vaults = await this.context.getVaults({ includeRemoved: true, withDefault: true });

    this.checkConfigVaultReference(report, config.current_vault_id, vaults);
    this.checkListIds(report, listEntries, auto.archive_id);
    this.checkVaultIds(report, vaults, auto.vault_id);

    await this.checkListConsistency(report, listEntries, vaults);
    await this.checkVaultDirectoryConsistency(report, listEntries, vaults);
    await this.checkLogConsistency(report, auto.log_id);

    report.info.push(`Checked ${listEntries.length} archive entries.`);
    report.info.push(`Checked ${vaults.length} vault definitions (including default).`);

    return report;
  }

  private async checkRequiredPaths(report: CheckReport): Promise<void> {
    const requiredPaths = [
      this.context.rootDir,
      this.context.coreDir,
      this.context.logsDir,
      this.context.vaultsDir,
      this.context.configFile,
      this.context.autoIncrFile,
      this.context.listFile,
      this.context.vaultsFile,
      this.context.vaultDir(DEFAULT_VAULT_ID),
    ];

    for (const target of requiredPaths) {
      if (!(await pathAccessible(target))) {
        pushIssue(report.issues, 'ERROR', 'MISSING_PATH', `Missing required path: ${target}`);
      }
    }
  }

  private checkConfigVaultReference(report: CheckReport, currentVaultId: number, vaults: Vault[]): void {
    const currentVault = vaults.find((vault) => vault.id === currentVaultId && vault.st !== 'Removed');
    if (!currentVault) {
      pushIssue(
        report.issues,
        'ERROR',
        'INVALID_CURRENT_VAULT',
        `config.current_vault_id=${currentVaultId} is not a valid active vault.`,
      );
    }
  }

  private checkListIds(report: CheckReport, entries: ListEntry[], archiveAutoIncr: number): void {
    const ids = entries.map((entry) => entry.id);
    const duplicates = findDuplicates(ids);
    if (duplicates.length > 0) {
      pushIssue(
        report.issues,
        'ERROR',
        'DUPLICATE_ARCHIVE_ID',
        `Duplicated archive ids found: ${duplicates.join(', ')}`,
      );
    }

    const maxId = ids.length > 0 ? Math.max(...ids) : 0;
    if (archiveAutoIncr < maxId) {
      pushIssue(
        report.issues,
        'ERROR',
        'ARCHIVE_AUTO_INCR_TOO_SMALL',
        `auto-incr.archive_id=${archiveAutoIncr} but max archive id is ${maxId}.`,
      );
    }
  }

  private checkVaultIds(report: CheckReport, vaults: Vault[], vaultAutoIncr: number): void {
    const nonDefaultVaults = vaults.filter((vault) => vault.id !== DEFAULT_VAULT_ID);
    const ids = nonDefaultVaults.map((vault) => vault.id);
    const duplicates = findDuplicates(ids);
    if (duplicates.length > 0) {
      pushIssue(report.issues, 'ERROR', 'DUPLICATE_VAULT_ID', `Duplicated vault ids found: ${duplicates.join(', ')}`);
    }

    const names = nonDefaultVaults.map((vault) => vault.n);
    const duplicatedNames = names.filter((name, idx) => names.indexOf(name) !== idx);
    if (duplicatedNames.length > 0) {
      pushIssue(
        report.issues,
        'ERROR',
        'DUPLICATE_VAULT_NAME',
        `Duplicated vault names found: ${[...new Set(duplicatedNames)].join(', ')}`,
      );
    }

    const maxVaultId = ids.length > 0 ? Math.max(...ids) : 0;
    if (vaultAutoIncr < maxVaultId) {
      pushIssue(
        report.issues,
        'ERROR',
        'VAULT_AUTO_INCR_TOO_SMALL',
        `auto-incr.vault_id=${vaultAutoIncr} but max vault id is ${maxVaultId}.`,
      );
    }
  }

  private async checkListConsistency(report: CheckReport, entries: ListEntry[], vaults: Vault[]): Promise<void> {
    const vaultMap = new Map<number, Vault>(vaults.map((vault) => [vault.id, vault]));

    for (const entry of entries) {
      const vault = vaultMap.get(entry.vaultId);
      if (!vault) {
        pushIssue(
          report.issues,
          'ERROR',
          'UNKNOWN_VAULT_REFERENCE',
          `Archive id ${entry.id} references unknown vault id ${entry.vaultId}.`,
        );
        continue;
      }

      const archivePath = this.context.archivePath(entry.vaultId, entry.id);
      const restorePath = path.join(entry.directory, entry.item);

      if (entry.status === 'A') {
        const location = await this.context.resolveArchiveStorageLocation(entry);
        if (!location) {
          pushIssue(
            report.issues,
            'ERROR',
            'MISSING_ARCHIVE_OBJECT',
            `Archive id ${entry.id} is marked archived but object is missing: ${archivePath}`,
          );
        } else {
          const archiveStats = await safeLstat(location.objectPath);
          if (archiveStats) {
            const actualIsDir = archiveStats.isDirectory();
            const expectedIsDir = entry.isDirectory === 1;
            if (actualIsDir !== expectedIsDir) {
              pushIssue(
                report.issues,
                'ERROR',
                'TYPE_MISMATCH_ARCHIVED',
                `Archive id ${entry.id} type mismatch (expected dir=${expectedIsDir}, actual dir=${actualIsDir}).`,
              );
            }
          }
        }

        if (await pathAccessible(restorePath)) {
          pushIssue(
            report.issues,
            'WARN',
            'RESTORE_TARGET_ALREADY_EXISTS',
            `Archive id ${entry.id} has an existing restore path: ${restorePath}`,
          );
        }
      } else if (entry.status === 'R') {
        if (await pathAccessible(archivePath)) {
          pushIssue(
            report.issues,
            'WARN',
            'RESTORED_BUT_ARCHIVE_EXISTS',
            `Archive id ${entry.id} is restored but archive object still exists: ${archivePath}`,
          );
        }

        if (await pathAccessible(restorePath)) {
          const restoreStats = await safeLstat(restorePath);
          if (restoreStats) {
            const actualIsDir = restoreStats.isDirectory();
            const expectedIsDir = entry.isDirectory === 1;
            if (actualIsDir !== expectedIsDir) {
              pushIssue(
                report.issues,
                'WARN',
                'TYPE_MISMATCH_RESTORED',
                `Restored path type mismatch for archive id ${entry.id} (expected dir=${expectedIsDir}, actual dir=${actualIsDir}).`,
              );
            }
          }
        } else {
          pushIssue(
            report.issues,
            'WARN',
            'RESTORED_TARGET_MISSING',
            `Archive id ${entry.id} is restored but restore path does not exist: ${restorePath}`,
          );
        }
      } else {
        pushIssue(
          report.issues,
          'ERROR',
          'INVALID_ARCHIVE_STATUS',
          `Archive id ${entry.id} has invalid status ${entry.status}.`,
        );
      }
    }
  }

  private async checkVaultDirectoryConsistency(
    report: CheckReport,
    entries: ListEntry[],
    vaults: Vault[],
  ): Promise<void> {
    const knownVaultIds = new Set(vaults.map((vault) => vault.id));
    const expectedArchivedPairs = new Set(
      entries.filter((entry) => entry.status === 'A').map((entry) => `${entry.vaultId}/${entry.id}`),
    );

    const vaultDirs = await listDirectories(this.context.vaultsDir);

    for (const dirName of vaultDirs) {
      if (!/^\d+$/.test(dirName)) {
        pushIssue(
          report.issues,
          'WARN',
          'NON_NUMERIC_VAULT_DIR',
          `Unexpected non-numeric vault directory: ${path.join(this.context.vaultsDir, dirName)}`,
        );
        continue;
      }

      const vaultId = Number(dirName);
      if (!knownVaultIds.has(vaultId)) {
        pushIssue(
          report.issues,
          'WARN',
          'ORPHAN_VAULT_DIR',
          `Vault directory exists but no metadata: ${path.join(this.context.vaultsDir, dirName)}`,
        );
      }

      const dirPath = this.context.vaultDir(vaultId);
      const children = await fs.readdir(dirPath, { withFileTypes: true });
      for (const child of children) {
        if (!/^[0-9]+$/.test(child.name)) {
          pushIssue(
            report.issues,
            'WARN',
            'NON_NUMERIC_ARCHIVE_OBJECT',
            `Vault ${vaultId} contains unexpected object name: ${child.name}`,
          );
          continue;
        }

        const key = `${vaultId}/${Number(child.name)}`;
        if (!expectedArchivedPairs.has(key)) {
          pushIssue(
            report.issues,
            'WARN',
            'ORPHAN_ARCHIVE_OBJECT',
            `Archive object ${key} exists on disk but not in list.jsonl as archived.`,
          );
        }
      }
    }

    for (const vault of vaults) {
      if (vault.st !== 'Valid' && vault.st !== 'Protected') {
        continue;
      }

      const dirPath = this.context.vaultDir(vault.id);
      if (!(await pathAccessible(dirPath))) {
        pushIssue(
          report.issues,
          'ERROR',
          'MISSING_VAULT_DIR',
          `Vault ${vault.n}(${vault.id}) is active but directory is missing: ${dirPath}`,
        );
      }
    }
  }

  private async checkLogConsistency(report: CheckReport, logAutoIncr: number): Promise<void> {
    const yearFiles = await fs.readdir(this.context.logsDir, { withFileTypes: true }).catch((error) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    });

    const logs: LogEntry[] = [];
    for (const file of yearFiles) {
      if (!file.isFile() || !/^\d{4}\.jsonl$/.test(file.name)) {
        continue;
      }
      const rows = await readJsonLinesFile<LogEntry>(path.join(this.context.logsDir, file.name));
      logs.push(...rows);
    }

    const ids = logs.map((row) => Number(row.id)).filter((id) => Number.isInteger(id));
    const duplicates = findDuplicates(ids);
    if (duplicates.length > 0) {
      pushIssue(report.issues, 'ERROR', 'DUPLICATE_LOG_ID', `Duplicated log ids found: ${duplicates.join(', ')}`);
    }

    const maxLogId = ids.length > 0 ? Math.max(...ids) : 0;
    if (logAutoIncr < maxLogId) {
      pushIssue(
        report.issues,
        'ERROR',
        'LOG_AUTO_INCR_TOO_SMALL',
        `auto-incr.log_id=${logAutoIncr} but max log id is ${maxLogId}.`,
      );
    }
  }
}
