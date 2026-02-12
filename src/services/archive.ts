import fs from 'node:fs/promises';
import type { Stats } from 'node:fs';
import path from 'node:path';
import type { ListEntry, OperationSource, Vault } from '../global.js';
import type { ArchiverContext } from '../core/context.js';
import type { AuditLogger } from './audit-logger.js';

import { ArchiveStatus, Paths } from '../consts/index.js';
import { t } from '../i18n/index.js';
import { formatDateTime } from '../utils/date.js';
import { isParentOrSamePath, isSubPath, pathAccessible, safeLstat, safeRealPath } from '../utils/fs.js';

interface PutPreparedItem {
  input: string;
  resolvedPath: string;
  canonicalPath: string;
  stats: Stats;
}

export interface PutOptions {
  vault?: string;
  message?: string;
  remark?: string;
  source?: OperationSource;
}

export interface BatchResultItem {
  id?: number;
  input: string;
  success: boolean;
  message: string;
}

export interface BatchResult {
  ok: BatchResultItem[];
  failed: BatchResultItem[];
}

export interface ListOptions {
  restored?: boolean;
  all?: boolean;
  vault?: string;
}

export interface ArchiveCdTarget {
  vault: Vault;
  archiveId: number;
  slotPath: string;
}

type ArchiveStorageLocation = NonNullable<Awaited<ReturnType<ArchiverContext['resolveArchiveStorageLocation']>>>;

export class ArchiveService {
  constructor(
    private readonly context: ArchiverContext,
    private readonly logger: AuditLogger,
  ) {}

  async put(items: string[], options: PutOptions): Promise<BatchResult> {
    if (items.length === 0) {
      throw new Error(t('service.archive.error.at_least_one_item'));
    }

    const vault = await this.resolveTargetVault(options.vault);
    await this.context.ensureVaultDir(vault.id);

    const prepared = await this.preValidatePutItems(items);
    await this.preValidatePutSlots(vault.id, prepared.length);

    const result: BatchResult = { ok: [], failed: [] };

    for (const item of prepared) {
      const archiveId = await this.context.nextAutoIncrement('archiveId');
      const archiveSlotPath = this.context.archivePath(vault.id, archiveId);
      const entry: ListEntry = {
        archivedAt: formatDateTime(),
        status: ArchiveStatus.Archived,
        isDirectory: item.stats.isDirectory() ? 1 : 0,
        vaultId: vault.id,
        id: archiveId,
        item: path.basename(item.resolvedPath),
        directory: path.dirname(item.resolvedPath),
        message: options.message ?? '',
        remark: options.remark ?? '',
      };

      try {
        if (await pathAccessible(archiveSlotPath)) {
          throw new Error(
            t('service.archive.error.slot_exists', {
              path: archiveSlotPath,
            }),
          );
        }

        await fs.mkdir(archiveSlotPath, { recursive: false });
        const archiveObjectPath = this.context.archiveObjectPath(vault.id, archiveId, entry.item);

        try {
          await fs.rename(item.resolvedPath, archiveObjectPath);
        } catch (error) {
          await fs.rmdir(archiveSlotPath).catch(() => undefined);
          throw error;
        }

        await this.context.appendListEntry(entry);

        await this.logger.log(
          'INFO',
          {
            main: 'put',
            args: [item.input],
            opts: {
              vault: options.vault ?? vault.id,
            },
            source: options.source ?? 'u',
          },
          t('service.archive.log.archived', {
            input: item.input,
          }),
          { aid: archiveId, vid: vault.id },
        );

        result.ok.push({
          id: archiveId,
          input: item.input,
          success: true,
          message: t('service.archive.result.archived_to_vault', {
            name: vault.name,
            id: vault.id,
          }),
        });
      } catch (error) {
        const message = (error as Error).message;
        await this.logger.log(
          'ERROR',
          {
            main: 'put',
            args: [item.input],
            opts: {
              vault: options.vault ?? vault.id,
            },
            source: options.source ?? 'u',
          },
          t('service.archive.log.archive_failed', {
            input: item.input,
            message,
          }),
        );

        result.failed.push({
          id: archiveId,
          input: item.input,
          success: false,
          message,
        });
      }
    }

    return result;
  }

  async restore(ids: number[]): Promise<BatchResult> {
    if (ids.length === 0) {
      throw new Error(t('service.archive.error.at_least_one_id'));
    }

    const entries = await this.context.loadListEntries();
    const entryMap = new Map<number, ListEntry>(entries.map((entry) => [entry.id, entry]));

    for (const id of ids) {
      const entry = entryMap.get(id);
      if (!entry) {
        throw new Error(
          t('service.archive.error.id_not_exists', {
            id,
          }),
        );
      }
      if (entry.status !== ArchiveStatus.Archived) {
        throw new Error(
          t('service.archive.error.id_already_restored', {
            id,
          }),
        );
      }
    }

    const result: BatchResult = { ok: [], failed: [] };
    let changed = false;

    for (const id of ids) {
      const entry = entryMap.get(id);
      if (!entry) {
        result.failed.push({
          input: String(id),
          success: false,
          message: t('service.archive.error.id_not_found_short'),
        });
        continue;
      }

      const location = await this.context.resolveArchiveStorageLocation(entry);
      const targetPath = path.join(entry.directory, entry.item);

      try {
        if (!location) {
          throw new Error(
            t('service.archive.error.object_missing', {
              path: this.context.archivePath(entry.vaultId, entry.id),
            }),
          );
        }

        if (await pathAccessible(targetPath)) {
          throw new Error(
            t('service.archive.error.restore_target_exists', {
              path: targetPath,
            }),
          );
        }

        await fs.mkdir(entry.directory, { recursive: true });
        await fs.rename(location.objectPath, targetPath);

        await fs.rmdir(location.slotPath).catch((error) => {
          const code = (error as NodeJS.ErrnoException).code;
          if (code === 'ENOENT') {
            return;
          }
          throw error;
        });

        entry.status = ArchiveStatus.Restored;
        changed = true;

        await this.logger.log(
          'INFO',
          {
            main: 'restore',
            args: [String(id)],
            source: 'u',
          },
          t('service.archive.log.restored', { id }),
          { aid: id, vid: entry.vaultId },
        );

        result.ok.push({
          id,
          input: String(id),
          success: true,
          message: t('service.archive.result.restored_to', { path: targetPath }),
        });
      } catch (error) {
        const message = (error as Error).message;
        await this.logger.log(
          'ERROR',
          {
            main: 'restore',
            args: [String(id)],
            source: 'u',
          },
          t('service.archive.log.restore_failed', { id, message }),
          { aid: id, vid: entry.vaultId },
        );

        result.failed.push({
          id,
          input: String(id),
          success: false,
          message,
        });
      }
    }

    if (changed) {
      await this.context.saveListEntries(entries);
    }

    return result;
  }

  async move(ids: number[], toVaultRef: string): Promise<BatchResult> {
    if (ids.length === 0) {
      throw new Error(t('service.archive.error.at_least_one_id'));
    }

    const targetVault = await this.context.resolveVault(toVaultRef, {
      includeRemoved: false,
      fallbackCurrent: false,
    });

    if (!targetVault) {
      throw new Error(
        t('service.archive.error.target_vault_not_found', {
          vault: toVaultRef,
        }),
      );
    }

    await this.context.ensureVaultDir(targetVault.id);

    const entries = await this.context.loadListEntries();
    const entryMap = new Map<number, ListEntry>(entries.map((entry) => [entry.id, entry]));
    const locationMap = new Map<number, ArchiveStorageLocation>();

    for (const id of ids) {
      const entry = entryMap.get(id);
      if (!entry) {
        throw new Error(
          t('service.archive.error.id_not_exists', {
            id,
          }),
        );
      }
      if (entry.status !== ArchiveStatus.Archived) {
        throw new Error(
          t('service.archive.error.id_restored_cannot_move', {
            id,
          }),
        );
      }
      if (entry.vaultId === targetVault.id) {
        throw new Error(
          t('service.archive.error.id_already_in_vault', {
            id,
            vault: targetVault.name,
          }),
        );
      }

      const location = await this.context.resolveArchiveStorageLocation(entry);
      const source = this.context.archivePath(entry.vaultId, entry.id);
      const target = this.context.archivePath(targetVault.id, entry.id);
      if (!location) {
        throw new Error(
          t('service.archive.error.object_missing', {
            path: source,
          }),
        );
      }
      if (await pathAccessible(target)) {
        throw new Error(
          t('service.archive.error.target_slot_exists', {
            path: target,
          }),
        );
      }

      locationMap.set(id, location);
    }

    const result: BatchResult = { ok: [], failed: [] };
    let changed = false;

    for (const id of ids) {
      const entry = entryMap.get(id);
      if (!entry) {
        continue;
      }

      const location = locationMap.get(id);
      if (!location) {
        result.failed.push({
          id,
          input: String(id),
          success: false,
          message: t('service.archive.error.object_missing_short'),
        });
        continue;
      }

      const target = this.context.archivePath(targetVault.id, entry.id);
      const fromVaultId = entry.vaultId;

      try {
        await fs.rename(location.slotPath, target);

        entry.vaultId = targetVault.id;
        changed = true;

        await this.logger.log(
          'INFO',
          {
            main: 'move',
            args: [String(id)],
            opts: { to: targetVault.id },
            source: 'u',
          },
          t('service.archive.log.moved', {
            id,
            fromVaultId,
            toVaultId: targetVault.id,
          }),
          { aid: id, vid: targetVault.id },
        );

        result.ok.push({
          id,
          input: String(id),
          success: true,
          message: t('service.archive.result.moved_to_vault', {
            name: targetVault.name,
            id: targetVault.id,
          }),
        });
      } catch (error) {
        const message = (error as Error).message;
        await this.logger.log(
          'ERROR',
          {
            main: 'move',
            args: [String(id)],
            opts: { to: targetVault.id },
            source: 'u',
          },
          t('service.archive.log.move_failed', {
            id,
            message,
          }),
          { aid: id, vid: fromVaultId },
        );

        result.failed.push({
          id,
          input: String(id),
          success: false,
          message,
        });
      }
    }

    if (changed) {
      await this.context.saveListEntries(entries);
    }

    return result;
  }

  async resolveCdTarget(target: string): Promise<ArchiveCdTarget> {
    const trimmed = target.trim();
    if (!trimmed) {
      throw new Error(t('service.archive.error.target_empty'));
    }

    const { vaultRef, archiveId } = this.parseCdTarget(trimmed);
    const entries = await this.context.loadListEntries();
    const entry = entries.find((item) => item.id === archiveId);

    if (!entry) {
      throw new Error(
        t('service.archive.error.id_not_exists', {
          id: archiveId,
        }),
      );
    }

    if (entry.status !== ArchiveStatus.Archived) {
      throw new Error(
        t('service.archive.error.id_restored_no_slot', {
          id: archiveId,
        }),
      );
    }

    if (vaultRef !== undefined) {
      const requestedVault = await this.context.resolveVault(vaultRef, {
        includeRemoved: true,
        fallbackCurrent: false,
      });

      if (!requestedVault) {
        throw new Error(
          t('service.archive.error.vault_not_found', {
            vault: vaultRef,
          }),
        );
      }

      if (requestedVault.id !== entry.vaultId) {
        throw new Error(
          t('service.archive.error.id_vault_mismatch', {
            id: archiveId,
            actualVaultId: entry.vaultId,
            requestedVaultId: requestedVault.id,
          }),
        );
      }
    }

    const vault = await this.context.resolveVault(entry.vaultId, {
      includeRemoved: true,
      fallbackCurrent: false,
    });

    if (!vault) {
      throw new Error(
        t('service.archive.error.vault_for_archive_not_found', {
          id: archiveId,
          vaultId: entry.vaultId,
        }),
      );
    }

    const location = await this.context.resolveArchiveStorageLocation(entry);
    if (!location) {
      throw new Error(
        t('service.archive.error.slot_missing_invalid', {
          path: this.context.archivePath(entry.vaultId, entry.id),
        }),
      );
    }

    return {
      vault,
      archiveId,
      slotPath: location.slotPath,
    };
  }

  async listEntries(options: ListOptions): Promise<ListEntry[]> {
    const entries = await this.context.loadListEntries();

    let filtered = entries;
    if (!options.all) {
      if (options.restored) {
        filtered = filtered.filter((entry) => entry.status === ArchiveStatus.Restored);
      } else {
        filtered = filtered.filter((entry) => entry.status === ArchiveStatus.Archived);
      }
    }

    if (options.vault !== undefined) {
      const vault = await this.context.resolveVault(options.vault, {
        includeRemoved: true,
        fallbackCurrent: false,
      });

      if (!vault) {
        throw new Error(
          t('service.archive.error.vault_not_found', {
            vault: options.vault,
          }),
        );
      }

      filtered = filtered.filter((entry) => entry.vaultId === vault.id);
    }

    return filtered.sort((a, b) => a.id - b.id);
  }

  async decorateEntries(entries: ListEntry[]): Promise<
    Array<
      ListEntry & {
        vaultName: string;
        displayPath: string;
      }
    >
  > {
    const vaults = await this.context.getVaults({ includeRemoved: true, withDefault: true });
    const vaultMap = new Map<number, Vault>(vaults.map((vault) => [vault.id, vault]));

    return entries.map((entry) => {
      const vault = vaultMap.get(entry.vaultId);
      const displayPath = path.join(entry.directory, entry.item);

      return {
        ...entry,
        vaultName: vault
          ? `${vault.name}(${vault.id})`
          : t('service.archive.decorated.unknown_vault', {
              vaultId: entry.vaultId,
            }),
        displayPath,
      };
    });
  }

  private async resolveTargetVault(reference?: string): Promise<Vault> {
    const vault = await this.context.resolveVault(reference, {
      includeRemoved: false,
      fallbackCurrent: true,
    });

    if (!vault) {
      const fallbackMessage = reference
        ? t('service.archive.error.vault_not_found', { vault: reference })
        : t('service.archive.error.current_vault_invalid');
      throw new Error(fallbackMessage);
    }

    if (vault.status === 'Removed') {
      throw new Error(
        t('service.archive.error.vault_removed', {
          vault: vault.name,
        }),
      );
    }

    return vault;
  }

  private parseCdTarget(target: string): { vaultRef?: string; archiveId: number } {
    const slashIndex = target.lastIndexOf('/');
    if (slashIndex === -1) {
      if (!/^\d+$/.test(target)) {
        throw new Error(
          t('service.archive.error.invalid_target_format', {
            target,
          }),
        );
      }
      return {
        archiveId: Number(target),
      };
    }

    const vaultRef = target.slice(0, slashIndex).trim();
    const archiveIdText = target.slice(slashIndex + 1).trim();

    if (!vaultRef) {
      throw new Error(
        t('service.archive.error.invalid_target_no_vault', {
          target,
        }),
      );
    }

    if (!/^\d+$/.test(archiveIdText)) {
      throw new Error(
        t('service.archive.error.invalid_target_archive_id', {
          target,
        }),
      );
    }

    return {
      vaultRef,
      archiveId: Number(archiveIdText),
    };
  }

  private async preValidatePutItems(items: string[]): Promise<PutPreparedItem[]> {
    const prepared: PutPreparedItem[] = [];
    const seen = new Set<string>();

    const archiverRootCanonical = await safeRealPath(Paths.Dir.root);

    for (const item of items) {
      const resolvedPath = path.resolve(item);
      const stats = await safeLstat(resolvedPath);
      if (!stats) {
        throw new Error(
          t('service.archive.error.path_not_exists', {
            path: item,
          }),
        );
      }

      const canonicalPath = await safeRealPath(resolvedPath);

      if (isParentOrSamePath(canonicalPath, archiverRootCanonical) || isSubPath(archiverRootCanonical, canonicalPath)) {
        throw new Error(
          t('service.archive.error.path_forbidden_archiver_scope', {
            path: item,
          }),
        );
      }

      if (seen.has(canonicalPath)) {
        throw new Error(
          t('service.archive.error.duplicate_input_path', {
            path: item,
          }),
        );
      }
      seen.add(canonicalPath);

      prepared.push({
        input: item,
        resolvedPath,
        canonicalPath,
        stats,
      });
    }

    return prepared;
  }

  private async preValidatePutSlots(vaultId: number, count: number): Promise<void> {
    const auto = await this.context.loadAutoIncr();

    for (let index = 1; index <= count; index += 1) {
      const predictedArchiveId = auto.archiveId + index;
      const predictedPath = this.context.archivePath(vaultId, predictedArchiveId);
      if (await pathAccessible(predictedPath)) {
        throw new Error(
          t('service.archive.error.slot_already_occupied', {
            path: predictedPath,
          }),
        );
      }
    }
  }
}
