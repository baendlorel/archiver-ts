import fs from 'node:fs/promises';
import path from 'node:path';
import {
  ARCHIVER_ROOT,
  AUTO_INCR_FILE,
  CONFIG_FILE,
  CORE_DIR,
  DEFAULT_AUTO_INCR,
  DEFAULT_CONFIG,
  DEFAULT_VAULT,
  LIST_FILE,
  LOG_DIR,
  VAULT_DIR,
  VAULTS_FILE,
} from '../consts/index.js';
import type { ArchiverConfig, AutoIncrVars, ListEntry, Vault } from '../global.js';
import { ensureDir, ensureFile, pathAccessible, safeLstat } from '../utils/fs.js';
import { appendJsonLine, readJsonLinesFile, readJsoncFile, writeJsonFile, writeJsonLinesFile } from '../utils/json.js';

function sanitizeConfig(config: ArchiverConfig): ArchiverConfig {
  return {
    currentVaultId:
      Number.isInteger(config.currentVaultId) && config.currentVaultId >= 0
        ? config.currentVaultId
        : DEFAULT_CONFIG.currentVaultId,
    updateCheck: config.updateCheck === 'off' ? 'off' : 'on',
    lastUpdateCheck: typeof config.lastUpdateCheck === 'string' ? config.lastUpdateCheck : '',
    aliasMap: typeof config.aliasMap === 'object' && config.aliasMap !== null ? config.aliasMap : {},
    vaultItemSeparator:
      typeof config.vaultItemSeparator === 'string' && config.vaultItemSeparator.length > 0
        ? config.vaultItemSeparator
        : DEFAULT_CONFIG.vaultItemSeparator,
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
  const status = raw.status === 'R' ? 'R' : 'A';
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
  const validStatus = raw.status === 'Removed' || raw.status === 'Protected' ? raw.status : 'Valid';
  return {
    id: Number(raw.id),
    name: String(raw.name ?? ''),
    remark: String(raw.remark ?? ''),
    createdAt: String(raw.createdAt ?? ''),
    status: validStatus,
  };
}

export class ArchiverContext {
  private configCache?: ArchiverConfig;
  private autoIncrCache?: AutoIncrVars;
  private listCache?: ListEntry[];
  private vaultCache?: Vault[];

  readonly rootDir = ARCHIVER_ROOT;
  readonly coreDir = CORE_DIR;
  readonly logsDir = LOG_DIR;
  readonly vaultsDir = VAULT_DIR;
  readonly configFile = CONFIG_FILE;
  readonly autoIncrFile = AUTO_INCR_FILE;
  readonly listFile = LIST_FILE;
  readonly vaultsFile = VAULTS_FILE;

  async init(): Promise<void> {
    await ensureDir(this.rootDir);
    await ensureDir(this.coreDir);
    await ensureDir(this.logsDir);
    await ensureDir(this.vaultsDir);
    await ensureDir(this.vaultDir(DEFAULT_VAULT.id));

    if (!(await pathAccessible(this.configFile))) {
      await writeJsonFile(this.configFile, DEFAULT_CONFIG);
    }

    if (!(await pathAccessible(this.autoIncrFile))) {
      await writeJsonFile(this.autoIncrFile, DEFAULT_AUTO_INCR);
    }

    await ensureFile(this.listFile);
    await ensureFile(this.vaultsFile);

    const config = await this.loadConfig();
    if (config.currentVaultId === 0 || (await pathAccessible(this.vaultDir(config.currentVaultId)))) {
      return;
    }

    config.currentVaultId = DEFAULT_VAULT.id;
    await this.saveConfig(config);
  }

  async loadConfig(forceRefresh: boolean = false): Promise<ArchiverConfig> {
    if (this.configCache && !forceRefresh) {
      return this.configCache;
    }

    const loaded = await readJsoncFile(this.configFile, DEFAULT_CONFIG);
    const merged = sanitizeConfig({ ...DEFAULT_CONFIG, ...loaded });
    this.configCache = merged;
    return merged;
  }

  async saveConfig(config: ArchiverConfig): Promise<void> {
    this.configCache = sanitizeConfig(config);
    await writeJsonFile(this.configFile, this.configCache);
  }

  async loadAutoIncr(forceRefresh: boolean = false): Promise<AutoIncrVars> {
    if (this.autoIncrCache && !forceRefresh) {
      return this.autoIncrCache;
    }

    const loaded = await readJsoncFile(this.autoIncrFile, DEFAULT_AUTO_INCR);
    const merged = sanitizeAutoIncr({ ...DEFAULT_AUTO_INCR, ...loaded });
    this.autoIncrCache = merged;
    return merged;
  }

  async saveAutoIncr(vars: AutoIncrVars): Promise<void> {
    this.autoIncrCache = sanitizeAutoIncr(vars);
    await writeJsonFile(this.autoIncrFile, this.autoIncrCache);
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

    const entries = await readJsonLinesFile<ListEntry>(this.listFile);
    this.listCache = entries
      .map((entry) => sanitizeListEntry(entry))
      .filter((entry) => Number.isInteger(entry.id) && entry.id > 0);

    this.listCache.sort((a, b) => a.id - b.id);
    return this.listCache;
  }

  async saveListEntries(entries: ListEntry[]): Promise<void> {
    this.listCache = [...entries].sort((a, b) => a.id - b.id);
    await writeJsonLinesFile(this.listFile, this.listCache);
  }

  async appendListEntry(entry: ListEntry): Promise<void> {
    const sanitized = sanitizeListEntry(entry);
    if (!this.listCache) {
      this.listCache = await this.loadListEntries();
    }
    this.listCache.push(sanitized);
    this.listCache.sort((a, b) => a.id - b.id);
    await appendJsonLine(this.listFile, sanitized);
  }

  async loadVaults(forceRefresh: boolean = false): Promise<Vault[]> {
    if (this.vaultCache && !forceRefresh) {
      return this.vaultCache;
    }

    const rows = await readJsonLinesFile<Vault>(this.vaultsFile);
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
    await writeJsonLinesFile(this.vaultsFile, normalized);
  }

  async getVaults(options?: { includeRemoved?: boolean; withDefault?: boolean }): Promise<Vault[]> {
    const includeRemoved = options?.includeRemoved ?? false;
    const withDefault = options?.withDefault ?? true;

    const loaded = await this.loadVaults();
    const filtered = includeRemoved ? loaded : loaded.filter((vault) => vault.status === 'Valid');

    if (!withDefault) {
      return filtered;
    }

    return [DEFAULT_VAULT, ...filtered];
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
    return path.join(this.vaultsDir, String(vaultId));
  }

  archivePath(vaultId: number, archiveId: number): string {
    return path.join(this.vaultDir(vaultId), String(archiveId));
  }

  archiveObjectPath(vaultId: number, archiveId: number, itemName: string): string {
    return path.join(this.archivePath(vaultId, archiveId), itemName);
  }

  async resolveArchiveStorageLocation(entry: Pick<ListEntry, 'vaultId' | 'id' | 'item'>): Promise<
    | {
        slotPath: string;
        objectPath: string;
        layout: 'slot' | 'legacy';
      }
    | undefined
  > {
    const slotPath = this.archivePath(entry.vaultId, entry.id);
    const slotStats = await safeLstat(slotPath);
    if (!slotStats) {
      return undefined;
    }

    if (!slotStats.isDirectory()) {
      return {
        slotPath,
        objectPath: slotPath,
        layout: 'legacy',
      };
    }

    const expectedObjectPath = this.archiveObjectPath(entry.vaultId, entry.id, entry.item);
    if (await pathAccessible(expectedObjectPath)) {
      return {
        slotPath,
        objectPath: expectedObjectPath,
        layout: 'slot',
      };
    }

    return {
      slotPath,
      objectPath: slotPath,
      layout: 'legacy',
    };
  }

  async ensureVaultDir(vaultId: number): Promise<void> {
    await ensureDir(this.vaultDir(vaultId));
  }

  async removeVaultDir(vaultId: number): Promise<void> {
    if (vaultId === DEFAULT_VAULT.id) {
      return;
    }
    await fs.rm(this.vaultDir(vaultId), { recursive: true, force: true });
  }
}
