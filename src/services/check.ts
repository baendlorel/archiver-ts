import fs from 'node:fs/promises';
import path from 'node:path';
import type { CheckIssue, CheckReport, ListEntry, LogEntry, Vault } from '../global.js';
import { Defaults, ArchiveStatus, CheckIssueLevel, VaultStatus, Paths } from '../consts/index.js';
import type { ArchiverContext } from '../core/context.js';
import { t } from '../i18n/index.js';
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

function pushIssue(issues: CheckIssue[], level: CheckIssueLevel, code: string, message: string): void {
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

    this.checkConfigVaultReference(report, config.currentVaultId, vaults);
    this.checkListIds(report, listEntries, auto.archiveId);
    this.checkVaultIds(report, vaults, auto.vaultId);

    await this.checkListConsistency(report, listEntries, vaults);
    await this.checkVaultDirectoryConsistency(report, listEntries, vaults);
    await this.checkLogConsistency(report, auto.logId);

    report.info.push(
      t('service.check.info.checked_entries', {
        count: listEntries.length,
      }),
    );
    report.info.push(
      t('service.check.info.checked_vaults', {
        count: vaults.length,
      }),
    );

    return report;
  }

  private async checkRequiredPaths(report: CheckReport): Promise<void> {
    const requiredPaths = [
      ...Object.values(Paths.Dir),
      ...Object.values(Paths.File),
      this.context.vaultDir(Defaults.Vault.id),
    ];

    for (const target of requiredPaths) {
      if (!(await pathAccessible(target))) {
        pushIssue(
          report.issues,
          CheckIssueLevel.Error,
          'MISSING_PATH',
          t('service.check.issue.missing_path', {
            path: target,
          }),
        );
      }
    }
  }

  private checkConfigVaultReference(report: CheckReport, currentVaultId: number, vaults: Vault[]): void {
    const currentVault = vaults.find((vault) => vault.id === currentVaultId && vault.status !== VaultStatus.Removed);
    if (!currentVault) {
      pushIssue(
        report.issues,
        CheckIssueLevel.Error,
        'INVALID_CURRENT_VAULT',
        t('service.check.issue.invalid_current_vault', {
          currentVaultId,
        }),
      );
    }
  }

  private checkListIds(report: CheckReport, entries: ListEntry[], archiveAutoIncr: number): void {
    const ids = entries.map((entry) => entry.id);
    const duplicates = findDuplicates(ids);
    if (duplicates.length > 0) {
      pushIssue(
        report.issues,
        CheckIssueLevel.Error,
        'DUPLICATE_ARCHIVE_ID',
        t('service.check.issue.duplicate_archive_id', {
          ids: duplicates.join(', '),
        }),
      );
    }

    const maxId = ids.length > 0 ? Math.max(...ids) : 0;
    if (archiveAutoIncr < maxId) {
      pushIssue(
        report.issues,
        CheckIssueLevel.Error,
        'ARCHIVE_AUTO_INCR_TOO_SMALL',
        t('service.check.issue.archive_auto_incr_too_small', {
          autoIncr: archiveAutoIncr,
          maxId,
        }),
      );
    }
  }

  private checkVaultIds(report: CheckReport, vaults: Vault[], vaultAutoIncr: number): void {
    const nonDefaultVaults = vaults.filter((vault) => vault.id !== Defaults.Vault.id);
    const ids = nonDefaultVaults.map((vault) => vault.id);
    const duplicates = findDuplicates(ids);
    if (duplicates.length > 0) {
      pushIssue(
        report.issues,
        CheckIssueLevel.Error,
        'DUPLICATE_VAULT_ID',
        t('service.check.issue.duplicate_vault_id', {
          ids: duplicates.join(', '),
        }),
      );
    }

    const names = nonDefaultVaults.map((vault) => vault.name);
    const duplicatedNames = names.filter((name, idx) => names.indexOf(name) !== idx);
    if (duplicatedNames.length > 0) {
      pushIssue(
        report.issues,
        CheckIssueLevel.Error,
        'DUPLICATE_VAULT_NAME',
        t('service.check.issue.duplicate_vault_name', {
          names: [...new Set(duplicatedNames)].join(', '),
        }),
      );
    }

    const maxVaultId = ids.length > 0 ? Math.max(...ids) : 0;
    if (vaultAutoIncr < maxVaultId) {
      pushIssue(
        report.issues,
        CheckIssueLevel.Error,
        'VAULT_AUTO_INCR_TOO_SMALL',
        t('service.check.issue.vault_auto_incr_too_small', {
          autoIncr: vaultAutoIncr,
          maxId: maxVaultId,
        }),
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
          CheckIssueLevel.Error,
          'UNKNOWN_VAULT_REFERENCE',
          t('service.check.issue.unknown_vault_reference', {
            archiveId: entry.id,
            vaultId: entry.vaultId,
          }),
        );
        continue;
      }

      const archivePath = this.context.archivePath(entry.vaultId, entry.id);
      const restorePath = path.join(entry.directory, entry.item);

      if (entry.status === ArchiveStatus.Archived) {
        const location = await this.context.resolveArchiveStorageLocation(entry);
        if (!location) {
          pushIssue(
            report.issues,
            CheckIssueLevel.Error,
            'MISSING_ARCHIVE_OBJECT',
            t('service.check.issue.missing_archive_object', {
              archiveId: entry.id,
              archivePath,
            }),
          );
        } else {
          const archiveStats = await safeLstat(location.objectPath);
          if (archiveStats) {
            const actualIsDir = archiveStats.isDirectory();
            const expectedIsDir = entry.isDirectory === 1;
            if (actualIsDir !== expectedIsDir) {
              pushIssue(
                report.issues,
                CheckIssueLevel.Error,
                'TYPE_MISMATCH_ARCHIVED',
                t('service.check.issue.type_mismatch_archived', {
                  archiveId: entry.id,
                  expectedIsDir,
                  actualIsDir,
                }),
              );
            }
          }
        }

        if (await pathAccessible(restorePath)) {
          pushIssue(
            report.issues,
            CheckIssueLevel.Warn,
            'RESTORE_TARGET_ALREADY_EXISTS',
            t('service.check.issue.restore_target_exists', {
              archiveId: entry.id,
              restorePath,
            }),
          );
        }
      } else if (entry.status === ArchiveStatus.Restored) {
        if (await pathAccessible(archivePath)) {
          pushIssue(
            report.issues,
            CheckIssueLevel.Warn,
            'RESTORED_BUT_ARCHIVE_EXISTS',
            t('service.check.issue.restored_but_archive_exists', {
              archiveId: entry.id,
              archivePath,
            }),
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
                CheckIssueLevel.Warn,
                'TYPE_MISMATCH_RESTORED',
                t('service.check.issue.type_mismatch_restored', {
                  archiveId: entry.id,
                  expectedIsDir,
                  actualIsDir,
                }),
              );
            }
          }
        } else {
          pushIssue(
            report.issues,
            CheckIssueLevel.Warn,
            'RESTORED_TARGET_MISSING',
            t('service.check.issue.restored_target_missing', {
              archiveId: entry.id,
              restorePath,
            }),
          );
        }
      } else {
        pushIssue(
          report.issues,
          CheckIssueLevel.Error,
          'INVALID_ARCHIVE_STATUS',
          t('service.check.issue.invalid_archive_status', {
            archiveId: entry.id,
            status: entry.status,
          }),
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
      entries.filter((entry) => entry.status === ArchiveStatus.Archived).map((entry) => `${entry.vaultId}/${entry.id}`),
    );

    const vaultDirs = await listDirectories(Paths.Dir.vaults);

    for (const dirName of vaultDirs) {
      if (!/^\d+$/.test(dirName)) {
        pushIssue(
          report.issues,
          CheckIssueLevel.Warn,
          'NON_NUMERIC_VAULT_DIR',
          t('service.check.issue.non_numeric_vault_dir', {
            path: path.join(Paths.Dir.vaults, dirName),
          }),
        );
        continue;
      }

      const vaultId = Number(dirName);
      if (!knownVaultIds.has(vaultId)) {
        pushIssue(
          report.issues,
          CheckIssueLevel.Warn,
          'ORPHAN_VAULT_DIR',
          t('service.check.issue.orphan_vault_dir', {
            path: path.join(Paths.Dir.vaults, dirName),
          }),
        );
      }

      const dirPath = this.context.vaultDir(vaultId);
      const children = await fs.readdir(dirPath, { withFileTypes: true });
      for (const child of children) {
        if (!/^[0-9]+$/.test(child.name)) {
          pushIssue(
            report.issues,
            CheckIssueLevel.Warn,
            'NON_NUMERIC_ARCHIVE_OBJECT',
            t('service.check.issue.non_numeric_archive_object', {
              vaultId,
              name: child.name,
            }),
          );
          continue;
        }

        if (!child.isDirectory()) {
          pushIssue(
            report.issues,
            CheckIssueLevel.Error,
            'INVALID_ARCHIVE_SLOT',
            t('service.check.issue.invalid_archive_slot', {
              vaultId,
              slotName: child.name,
            }),
          );
          continue;
        }

        const key = `${vaultId}/${Number(child.name)}`;
        if (!expectedArchivedPairs.has(key)) {
          pushIssue(
            report.issues,
            CheckIssueLevel.Warn,
            'ORPHAN_ARCHIVE_OBJECT',
            t('service.check.issue.orphan_archive_object', {
              pairKey: key,
            }),
          );
        }
      }
    }

    for (const vault of vaults) {
      if (vault.status !== 'Valid' && vault.status !== 'Protected') {
        continue;
      }

      const dirPath = this.context.vaultDir(vault.id);
      if (!(await pathAccessible(dirPath))) {
        pushIssue(
          report.issues,
          CheckIssueLevel.Error,
          'MISSING_VAULT_DIR',
          t('service.check.issue.missing_vault_dir', {
            vaultName: vault.name,
            vaultId: vault.id,
            path: dirPath,
          }),
        );
      }
    }
  }

  private async checkLogConsistency(report: CheckReport, logAutoIncr: number): Promise<void> {
    const logs = await readJsonLinesFile<LogEntry>(Paths.File.log);

    const ids = logs.map((row) => Number(row.id)).filter((id) => Number.isInteger(id));
    const duplicates = findDuplicates(ids);
    if (duplicates.length > 0) {
      pushIssue(
        report.issues,
        CheckIssueLevel.Error,
        'DUPLICATE_LOG_ID',
        t('service.check.issue.duplicate_log_id', {
          ids: duplicates.join(', '),
        }),
      );
    }

    const maxLogId = ids.length > 0 ? Math.max(...ids) : 0;
    if (logAutoIncr < maxLogId) {
      pushIssue(
        report.issues,
        CheckIssueLevel.Error,
        'LOG_AUTO_INCR_TOO_SMALL',
        t('service.check.issue.log_auto_incr_too_small', {
          autoIncr: logAutoIncr,
          maxId: maxLogId,
        }),
      );
    }
  }
}
