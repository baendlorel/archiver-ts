import fs from 'node:fs/promises';
import path from 'node:path';
import { Defaults } from '../consts/index.js';
import type { ArchiverConfig, AutoIncrVars, ListEntry, Vault } from '../global.js';
import { ensureDir, ensureFile, pathAccessible, safeLstat } from '../utils/fs.js';
import { appendJsonLine, readJsonLinesFile, readJsoncFile, writeJsonFile, writeJsonLinesFile } from '../utils/json.js';
import { ArchiveStatus, VaultStatus } from '../consts/enums.js';
import { ArchiverTree } from '../consts/path-tree.js';

function sanitizeConfig(config: ArchiverConfig): ArchiverConfig {
  return {
    currentVaultId:
      Number.isInteger(config.currentVaultId) && config.currentVaultId >= 0
        ? config.currentVaultId
        : Defaults.config.currentVaultId,
    updateCheck: config.updateCheck === 'off' ? 'off' : 'on',
    lastUpdateCheck: typeof config.lastUpdateCheck === 'string' ? config.lastUpdateCheck : '',
    aliasMap: typeof config.aliasMap === 'object' && config.aliasMap !== null ? config.aliasMap : {},
    vaultItemSeparator:
      typeof config.vaultItemSeparator === 'string' && config.vaultItemSeparator.length > 0
        ? config.vaultItemSeparator
        : Defaults.config.vaultItemSeparator,
  };
}

function sanitizeAutoIncr(values: AutoIncrVars): AutoIncrVars {
  return {
    logId: Number.isInteger(values.logId) && values.logId >= 0 ? values.logId : 0,
    vaultId: Number.isInteger(values.vaultId) && values.vaultId >= 0 ? values.vaultId : 0,
    archiveId: Number.isInteger(values.archiveId) && values.archiveId >= 0 ? values.archiveId : 0,
  };
}

function sanitizeListEntry(raw: ListEntry): ListEntry {
  const isDirectory = raw.isDirectory === 1 ? 1 : 0;
  const status = raw.status === ArchiveStatus.Restored ? ArchiveStatus.Restored : ArchiveStatus.Archived;
  return {
    archivedAt: String(raw.archivedAt ?? ''),
    status: status,
    isDirectory: isDirectory,
    vaultId: Number(raw.vaultId ?? 0),
    id: Number(raw.id),
    item: String(raw.item ?? ''),
    directory: String(raw.directory ?? ''),
    message: String(raw.message ?? ''),
    remark: String(raw.remark ?? ''),
  };
}

function sanitizeVault(raw: Vault): Vault {
  VaultStatus[raw.status as VaultStatus];
  const validStatus = VaultStatus[raw.status as VaultStatus] ?? VaultStatus.Valid;
  return {
    id: raw.id,
    name: raw.name ?? '',
    remark: raw.remark ?? '',
    createdAt: raw.createdAt ?? '',
    status: validStatus,
  };
}

export class ArchiverContext {
  private configCache?: ArchiverConfig;
  private autoIncrCache?: AutoIncrVars;
  private listCache?: ListEntry[];
  private vaultCache?: Vault[];

  async init(): Promise<void> {
    for (const dir of Object.values(ArchiverTree.directories)) {
      await ensureDir(dir);
    }
    await ensureDir(this.vaultDir(Defaults.vault.id));

    await writeJsonFile(ArchiverTree.files.config, Defaults.config);

    await writeJsonFile(ArchiverTree.files.autoIncr, Defaults.autoIncr);

    await ensureFile(ArchiverTree.files.list);
    await ensureFile(ArchiverTree.files.vaults);

    const config = await this.loadConfig();
    if (config.currentVaultId === 0 || (await pathAccessible(this.vaultDir(config.currentVaultId)))) {
      return;
    }

    config.currentVaultId = Defaults.vault.id;
    await this.saveConfig(config);
  }

  async loadConfig(forceRefresh: boolean = false): Promise<ArchiverConfig> {
    if (this.configCache && !forceRefresh) {
      return this.configCache;
    }

    const loaded = await readJsoncFile(ArchiverTree.files.config, Defaults.config);
    const merged = sanitizeConfig({ ...Defaults.config, ...loaded });
    this.configCache = merged;
    return merged;
  }

  async saveConfig(config: ArchiverConfig): Promise<void> {
    this.configCache = sanitizeConfig(config);
    await writeJsonFile(ArchiverTree.files.config, this.configCache);
  }

  async loadAutoIncr(forceRefresh: boolean = false): Promise<AutoIncrVars> {
    if (this.autoIncrCache && !forceRefresh) {
      return this.autoIncrCache;
    }

    const loaded = await readJsoncFile(ArchiverTree.files.autoIncr, Defaults.autoIncr);
    const merged = sanitizeAutoIncr({ ...Defaults.autoIncr, ...loaded });
    this.autoIncrCache = merged;
    return merged;
  }

  async saveAutoIncr(vars: AutoIncrVars): Promise<void> {
    this.autoIncrCache = sanitizeAutoIncr(vars);
    await writeJsonFile(ArchiverTree.files.autoIncr, this.autoIncrCache);
  }

  async nextAutoIncrement(key: keyof AutoIncrVars): Promise<number> {
    const vars = await this.loadAutoIncr();
    vars[key] += 1;
    await this.saveAutoIncr(vars);
    return vars[key];
  }

  async loadListEntries(forceRefresh: boolean = false): Promise<ListEntry[]> {
    if (this.listCache && !forceRefresh) {
      return this.listCache;
    }

    const entries = await readJsonLinesFile<ListEntry>(ArchiverTree.files.list);
    this.listCache = entries
      .map((entry) => sanitizeListEntry(entry))
      .filter((entry) => Number.isInteger(entry.id) && entry.id > 0);

    this.listCache.sort((a, b) => a.id - b.id);
    return this.listCache;
  }

  async saveListEntries(entries: ListEntry[]): Promise<void> {
    this.listCache = [...entries].sort((a, b) => a.id - b.id);
    await writeJsonLinesFile(ArchiverTree.files.list, this.listCache);
  }

  async appendListEntry(entry: ListEntry): Promise<void> {
    const sanitized = sanitizeListEntry(entry);
    if (!this.listCache) {
      this.listCache = await this.loadListEntries();
    }
    this.listCache.push(sanitized);
    this.listCache.sort((a, b) => a.id - b.id);
    await appendJsonLine(ArchiverTree.files.list, sanitized);
  }

  async loadVaults(forceRefresh: boolean = false): Promise<Vault[]> {
    if (this.vaultCache && !forceRefresh) {
      return this.vaultCache;
    }

    const rows = await readJsonLinesFile<Vault>(ArchiverTree.files.vaults);
    this.vaultCache = rows
      .map((row) => sanitizeVault(row))
      .filter((vault) => Number.isInteger(vault.id) && vault.id > 0)
      .sort((a, b) => a.id - b.id);

    return this.vaultCache;
  }

  async saveVaults(vaults: Vault[]): Promise<void> {
    const normalized = vaults
      .map((vault) => sanitizeVault(vault))
      .filter((vault) => vault.id > 0)
      .sort((a, b) => a.id - b.id);

    this.vaultCache = normalized;
    await writeJsonLinesFile(ArchiverTree.files.vaults, normalized);
  }

  async getVaults(options?: { includeRemoved?: boolean; withDefault?: boolean }): Promise<Vault[]> {
    const includeRemoved = options?.includeRemoved ?? false;
    const withDefault = options?.withDefault ?? true;

    const loaded = await this.loadVaults();
    const filtered = includeRemoved ? loaded : loaded.filter((vault) => vault.status === 'Valid');

    if (!withDefault) {
      return filtered;
    }

    return [Defaults.vault, ...filtered];
  }

  async resolveVault(
    ref?: string | number,
    options?: { includeRemoved?: boolean; fallbackCurrent?: boolean },
  ): Promise<Vault | undefined> {
    const includeRemoved = options?.includeRemoved ?? false;
    const fallbackCurrent = options?.fallbackCurrent ?? true;

    const vaults = await this.getVaults({ includeRemoved: true, withDefault: true });

    let targetRef = ref;
    if ((targetRef === undefined || targetRef === null || targetRef === '') && fallbackCurrent) {
      const config = await this.loadConfig();
      targetRef = config.currentVaultId;
    }

    if (targetRef === undefined || targetRef === null || targetRef === '') {
      return undefined;
    }

    let found: Vault | undefined;
    if (typeof targetRef === 'number') {
      found = vaults.find((vault) => vault.id === targetRef);
    } else if (/^\d+$/.test(targetRef)) {
      const asNumber = Number(targetRef);
      found = vaults.find((vault) => vault.id === asNumber);
    } else {
      found = vaults.find((vault) => vault.name === targetRef);
    }

    if (!found) {
      return undefined;
    }

    if (!includeRemoved && found.status === 'Removed') {
      return undefined;
    }

    return found;
  }

  vaultDir(vaultId: number): string {
    return path.join(ArchiverTree.directories.vaults, String(vaultId));
  }

  archivePath(vaultId: number, archiveId: number): string {
    return path.join(this.vaultDir(vaultId), String(archiveId));
  }

  archiveObjectPath(vaultId: number, archiveId: number, itemName: string): string {
    return path.join(this.archivePath(vaultId, archiveId), itemName);
  }

  async resolveArchiveStorageLocation(entry: ListEntry): Promise<
    | {
        slotPath: string;
        objectPath: string;
      }
    | undefined
  > {
    const slotPath = this.archivePath(entry.vaultId, entry.id);
    const slotStats = await safeLstat(slotPath);
    if (!slotStats || !slotStats.isDirectory()) {
      return undefined;
    }

    const expectedObjectPath = this.archiveObjectPath(entry.vaultId, entry.id, entry.item);
    if (!(await pathAccessible(expectedObjectPath))) {
      return undefined;
    }

    return {
      slotPath,
      objectPath: expectedObjectPath,
    };
  }

  async ensureVaultDir(vaultId: number): Promise<void> {
    await ensureDir(this.vaultDir(vaultId));
  }

  async removeVaultDir(vaultId: number): Promise<void> {
    if (vaultId === Defaults.vault.id) {
      return;
    }
    await fs.rm(this.vaultDir(vaultId), { recursive: true, force: true });
  }
}
