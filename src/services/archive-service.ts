import fs from 'node:fs/promises';
import type { Stats } from 'node:fs';
import path from 'node:path';
import { ARCHIVER_ROOT } from '../constants.js';
import { ArchiverContext } from '../core/context.js';
import type { ListEntry, OperationSource, Vault } from '../global.js';
import { formatDateTime } from '../utils/date.js';
import { isParentOrSamePath, isSubPath, pathAccessible, safeLstat, safeRealPath } from '../utils/fs.js';
import { ConfigService } from './config-service.js';
import { AuditLogger } from './audit-logger.js';

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
      const archiveId = await this.context.nextAutoIncrement('archive_id');
      const archivePath = this.context.archivePath(vault.id, archiveId);
      const entry: ListEntry = {
        aat: formatDateTime(),
        st: 'A',
        is_d: item.stats.isDirectory() ? 1 : 0,
        vid: vault.id,
        id: archiveId,
        i: path.basename(item.resolvedPath),
        d: path.dirname(item.resolvedPath),
        m: options.message ?? '',
        r: options.remark ?? '',
      };

      try {
        if (await pathAccessible(archivePath)) {
          throw new Error(`Archive slot already exists: ${archivePath}`);
        }

        await fs.rename(item.resolvedPath, archivePath);
        await this.context.appendListEntry(entry);

        await this.logger.log(
          'INFO',
          {
            m: 'put',
            a: [item.input],
            opt: {
              vault: options.vault ?? vault.id,
            },
            sc: options.source ?? 'u',
          },
          `Archived ${item.input}`,
          { aid: archiveId, vid: vault.id },
        );

        result.ok.push({
          id: archiveId,
          input: item.input,
          success: true,
          message: `Archived to vault ${vault.n}(${vault.id})`,
        });
      } catch (error) {
        const message = (error as Error).message;
        await this.logger.log(
          'ERROR',
          {
            m: 'put',
            a: [item.input],
            opt: {
              vault: options.vault ?? vault.id,
            },
            sc: options.source ?? 'u',
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
      if (entry.st !== 'A') {
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

      const sourcePath = this.context.archivePath(entry.vid, entry.id);
      const targetPath = path.join(entry.d, entry.i);

      try {
        if (!(await pathAccessible(sourcePath))) {
          throw new Error(`Archive object is missing: ${sourcePath}`);
        }

        if (await pathAccessible(targetPath)) {
          throw new Error(`Restore target already exists: ${targetPath}`);
        }

        await fs.mkdir(entry.d, { recursive: true });
        await fs.rename(sourcePath, targetPath);

        entry.st = 'R';
        changed = true;

        await this.logger.log(
          'INFO',
          {
            m: 'restore',
            a: [String(id)],
            sc: 'u',
          },
          `Restored archive id ${id}`,
          { aid: id, vid: entry.vid },
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
            m: 'restore',
            a: [String(id)],
            sc: 'u',
          },
          `Failed to restore archive id ${id}: ${message}`,
          { aid: id, vid: entry.vid },
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

    for (const id of ids) {
      const entry = entryMap.get(id);
      if (!entry) {
        throw new Error(`Archive id ${id} does not exist.`);
      }
      if (entry.st !== 'A') {
        throw new Error(`Archive id ${id} has been restored and cannot be moved.`);
      }
      if (entry.vid === targetVault.id) {
        throw new Error(`Archive id ${id} is already in vault ${targetVault.n}.`);
      }

      const source = this.context.archivePath(entry.vid, entry.id);
      const target = this.context.archivePath(targetVault.id, entry.id);
      if (!(await pathAccessible(source))) {
        throw new Error(`Archive object is missing: ${source}`);
      }
      if (await pathAccessible(target)) {
        throw new Error(`Target archive slot exists: ${target}`);
      }
    }

    const result: BatchResult = { ok: [], failed: [] };
    let changed = false;

    for (const id of ids) {
      const entry = entryMap.get(id);
      if (!entry) {
        continue;
      }

      const source = this.context.archivePath(entry.vid, entry.id);
      const target = this.context.archivePath(targetVault.id, entry.id);
      const fromVaultId = entry.vid;

      try {
        await fs.rename(source, target);
        entry.vid = targetVault.id;
        changed = true;

        await this.logger.log(
          'INFO',
          {
            m: 'move',
            a: [String(id)],
            opt: { to: targetVault.id },
            sc: 'u',
          },
          `Moved archive id ${id} from vault ${fromVaultId} to ${targetVault.id}`,
          { aid: id, vid: targetVault.id },
        );

        result.ok.push({
          id,
          input: String(id),
          success: true,
          message: `Moved to vault ${targetVault.n}(${targetVault.id})`,
        });
      } catch (error) {
        const message = (error as Error).message;
        await this.logger.log(
          'ERROR',
          {
            m: 'move',
            a: [String(id)],
            opt: { to: targetVault.id },
            sc: 'u',
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

  async listEntries(options: ListOptions): Promise<ListEntry[]> {
    const entries = await this.context.loadListEntries();

    let filtered = entries;
    if (!options.all) {
      if (options.restored) {
        filtered = filtered.filter((entry) => entry.st === 'R');
      } else {
        filtered = filtered.filter((entry) => entry.st === 'A');
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

      filtered = filtered.filter((entry) => entry.vid === vault.id);
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
      const vault = vaultMap.get(entry.vid);
      const fullPath = path.join(entry.d, entry.i);
      const displayPath = this.configService.renderPathWithAlias(fullPath, config.alias_map);

      return {
        ...entry,
        vaultName: vault ? `${vault.n}(${vault.id})` : `unknown(${entry.vid})`,
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

    if (vault.st === 'Removed') {
      throw new Error(`Vault ${vault.n} is removed.`);
    }

    return vault;
  }

  private async preValidatePutItems(items: string[]): Promise<PutPreparedItem[]> {
    const prepared: PutPreparedItem[] = [];
    const seen = new Set<string>();

    const archiverRootCanonical = await safeRealPath(ARCHIVER_ROOT);

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
      const predictedArchiveId = auto.archive_id + index;
      const predictedPath = this.context.archivePath(vaultId, predictedArchiveId);
      if (await pathAccessible(predictedPath)) {
        throw new Error(`Archive slot is already occupied: ${predictedPath}`);
      }
    }
  }
}
