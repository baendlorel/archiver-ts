import fs from 'node:fs/promises';
import type { Stats } from 'node:fs';
import path from 'node:path';
import { ArchiverContext } from '../core/context.js';
import type { ListEntry, OperationSource, Vault } from '../global.js';
import { formatDateTime } from '../utils/date.js';
import { isParentOrSamePath, isSubPath, pathAccessible, safeLstat, safeRealPath } from '../utils/fs.js';
import { ConfigService } from './config-service.js';
import { AuditLogger } from './audit-logger.js';
import { ArchiveStatus } from '../consts/enums.js';
import { ArchiverTree } from '../consts/path-tree.js';

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
    private readonly configService: ConfigService,
    private readonly logger: AuditLogger,
  ) {}

  async put(items: string[], options: PutOptions): Promise<BatchResult> {
    if (items.length === 0) {
      throw new Error('At least one item is required.');
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
          throw new Error(`Archive slot already exists: ${archiveSlotPath}`);
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
          `Archived ${item.input}`,
          { aid: archiveId, vid: vault.id },
        );

        result.ok.push({
          id: archiveId,
          input: item.input,
          success: true,
          message: `Archived to vault ${vault.name}(${vault.id})`,
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
          `Failed to archive ${item.input}: ${message}`,
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
      throw new Error('At least one id is required.');
    }

    const entries = await this.context.loadListEntries();
    const entryMap = new Map<number, ListEntry>(entries.map((entry) => [entry.id, entry]));

    for (const id of ids) {
      const entry = entryMap.get(id);
      if (!entry) {
        throw new Error(`Archive id ${id} does not exist.`);
      }
      if (entry.status !== ArchiveStatus.Archived) {
        throw new Error(`Archive id ${id} is already restored.`);
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
          message: 'Archive id not found.',
        });
        continue;
      }

      const location = await this.context.resolveArchiveStorageLocation(entry);
      const targetPath = path.join(entry.directory, entry.item);

      try {
        if (!location) {
          throw new Error(`Archive object is missing: ${this.context.archivePath(entry.vaultId, entry.id)}`);
        }

        if (await pathAccessible(targetPath)) {
          throw new Error(`Restore target already exists: ${targetPath}`);
        }

        await fs.mkdir(entry.directory, { recursive: true });
        await fs.rename(location.objectPath, targetPath);

        if (location.layout === 'slot') {
          await fs.rmdir(location.slotPath).catch((error) => {
            const code = (error as NodeJS.ErrnoException).code;
            if (code === 'ENOENT' || code === 'ENOTEMPTY') {
              return;
            }
            throw error;
          });
        }

        entry.status = ArchiveStatus.Restored;
        changed = true;

        await this.logger.log(
          'INFO',
          {
            main: 'restore',
            args: [String(id)],
            source: 'u',
          },
          `Restored archive id ${id}`,
          { aid: id, vid: entry.vaultId },
        );

        result.ok.push({
          id,
          input: String(id),
          success: true,
          message: `Restored to ${targetPath}`,
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
          `Failed to restore archive id ${id}: ${message}`,
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
      throw new Error('At least one id is required.');
    }

    const targetVault = await this.context.resolveVault(toVaultRef, {
      includeRemoved: false,
      fallbackCurrent: false,
    });

    if (!targetVault) {
      throw new Error(`Target vault not found: ${toVaultRef}`);
    }

    await this.context.ensureVaultDir(targetVault.id);

    const entries = await this.context.loadListEntries();
    const entryMap = new Map<number, ListEntry>(entries.map((entry) => [entry.id, entry]));
    const locationMap = new Map<number, ArchiveStorageLocation>();

    for (const id of ids) {
      const entry = entryMap.get(id);
      if (!entry) {
        throw new Error(`Archive id ${id} does not exist.`);
      }
      if (entry.status !== ArchiveStatus.Archived) {
        throw new Error(`Archive id ${id} has been restored and cannot be moved.`);
      }
      if (entry.vaultId === targetVault.id) {
        throw new Error(`Archive id ${id} is already in vault ${targetVault.name}.`);
      }

      const location = await this.context.resolveArchiveStorageLocation(entry);
      const source = location?.slotPath ?? this.context.archivePath(entry.vaultId, entry.id);
      const target = this.context.archivePath(targetVault.id, entry.id);
      if (!location) {
        throw new Error(`Archive object is missing: ${source}`);
      }
      if (await pathAccessible(target)) {
        throw new Error(`Target archive slot exists: ${target}`);
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
          message: 'Archive object is missing.',
        });
        continue;
      }

      const source = location.slotPath;
      const target = this.context.archivePath(targetVault.id, entry.id);
      const fromVaultId = entry.vaultId;

      try {
        if (location.layout === 'slot') {
          await fs.rename(source, target);
        } else {
          await fs.mkdir(target, { recursive: false });
          const targetObjectPath = this.context.archiveObjectPath(targetVault.id, entry.id, entry.item);
          try {
            await fs.rename(location.objectPath, targetObjectPath);
          } catch (error) {
            await fs.rmdir(target).catch(() => undefined);
            throw error;
          }
        }

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
          `Moved archive id ${id} from vault ${fromVaultId} to ${targetVault.id}`,
          { aid: id, vid: targetVault.id },
        );

        result.ok.push({
          id,
          input: String(id),
          success: true,
          message: `Moved to vault ${targetVault.name}(${targetVault.id})`,
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
          `Failed to move archive id ${id}: ${message}`,
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
      throw new Error('Target cannot be empty.');
    }

    const { vaultRef, archiveId } = this.parseCdTarget(trimmed);
    const entries = await this.context.loadListEntries();
    const entry = entries.find((item) => item.id === archiveId);

    if (!entry) {
      throw new Error(`Archive id ${archiveId} does not exist.`);
    }

    if (entry.status !== ArchiveStatus.Archived) {
      throw new Error(`Archive id ${archiveId} is restored and has no active slot.`);
    }

    if (vaultRef !== undefined) {
      const requestedVault = await this.context.resolveVault(vaultRef, {
        includeRemoved: true,
        fallbackCurrent: false,
      });

      if (!requestedVault) {
        throw new Error(`Vault not found: ${vaultRef}`);
      }

      if (requestedVault.id !== entry.vaultId) {
        throw new Error(`Archive id ${archiveId} is in vault ${entry.vaultId}, not ${requestedVault.id}.`);
      }
    }

    const vault = await this.context.resolveVault(entry.vaultId, {
      includeRemoved: true,
      fallbackCurrent: false,
    });

    if (!vault) {
      throw new Error(`Vault ${entry.vaultId} for archive id ${archiveId} does not exist.`);
    }

    const slotPath = this.context.archivePath(entry.vaultId, entry.id);
    const stats = await safeLstat(slotPath);
    if (!stats) {
      throw new Error(`Archive slot is missing: ${slotPath}`);
    }
    if (!stats.isDirectory()) {
      throw new Error(`Archive slot is a file in legacy layout and cannot be entered: ${slotPath}`);
    }

    return {
      vault,
      archiveId,
      slotPath,
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
        throw new Error(`Vault not found: ${options.vault}`);
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
    const config = await this.context.loadConfig();

    return entries.map((entry) => {
      const vault = vaultMap.get(entry.vaultId);
      const fullPath = path.join(entry.directory, entry.item);
      const displayPath = this.configService.renderPathWithAlias(fullPath, config.aliasMap);

      return {
        ...entry,
        vaultName: vault ? `${vault.name}(${vault.id})` : `unknown(${entry.vaultId})`,
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
      const fallbackMessage = reference ? `Vault not found: ${reference}` : 'Current vault is invalid.';
      throw new Error(fallbackMessage);
    }

    if (vault.status === 'Removed') {
      throw new Error(`Vault ${vault.name} is removed.`);
    }

    return vault;
  }

  private parseCdTarget(target: string): { vaultRef?: string; archiveId: number } {
    const slashIndex = target.lastIndexOf('/');
    if (slashIndex === -1) {
      if (!/^\d+$/.test(target)) {
        throw new Error(`Invalid target '${target}'. Use '<archive-id>' or '<vault>/<archive-id>'.`);
      }
      return {
        archiveId: Number(target),
      };
    }

    const vaultRef = target.slice(0, slashIndex).trim();
    const archiveIdText = target.slice(slashIndex + 1).trim();

    if (!vaultRef) {
      throw new Error(`Invalid target '${target}'. Vault name or id cannot be empty.`);
    }

    if (!/^\d+$/.test(archiveIdText)) {
      throw new Error(`Invalid archive id in target '${target}'.`);
    }

    return {
      vaultRef,
      archiveId: Number(archiveIdText),
    };
  }

  private async preValidatePutItems(items: string[]): Promise<PutPreparedItem[]> {
    const prepared: PutPreparedItem[] = [];
    const seen = new Set<string>();

    const archiverRootCanonical = await safeRealPath(ArchiverTree.directories.root);

    for (const item of items) {
      const resolvedPath = path.resolve(item);
      const stats = await safeLstat(resolvedPath);
      if (!stats) {
        throw new Error(`Path does not exist: ${item}`);
      }

      const canonicalPath = await safeRealPath(resolvedPath);

      if (isParentOrSamePath(canonicalPath, archiverRootCanonical) || isSubPath(archiverRootCanonical, canonicalPath)) {
        throw new Error(
          `Path ${item} is the archiver directory itself, inside it, or a parent of it. This is not allowed.`,
        );
      }

      if (seen.has(canonicalPath)) {
        throw new Error(`Duplicated input path: ${item}`);
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
        throw new Error(`Archive slot is already occupied: ${predictedPath}`);
      }
    }
  }
}
