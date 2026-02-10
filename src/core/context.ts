import fs from "node:fs/promises";
import path from "node:path";
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
} from "../constants.js";
import type { ArchiverConfig, AutoIncrVars, ListEntry, Vault } from "../types.js";
import { ensureDir, ensureFile, pathExists } from "../utils/fs.js";
import { appendJsonLine, readJsonLinesFile, readJsoncFile, writeJsonFile, writeJsonLinesFile } from "../utils/json.js";

function sanitizeConfig(config: ArchiverConfig): ArchiverConfig {
  return {
    current_vault_id:
      Number.isInteger(config.current_vault_id) && config.current_vault_id >= 0
        ? config.current_vault_id
        : DEFAULT_CONFIG.current_vault_id,
    update_check: config.update_check === "off" ? "off" : "on",
    last_update_check: typeof config.last_update_check === "string" ? config.last_update_check : "",
    alias_map: typeof config.alias_map === "object" && config.alias_map !== null ? config.alias_map : {},
    vault_item_sep:
      typeof config.vault_item_sep === "string" && config.vault_item_sep.length > 0
        ? config.vault_item_sep
        : DEFAULT_CONFIG.vault_item_sep,
  };
}

function sanitizeAutoIncr(values: AutoIncrVars): AutoIncrVars {
  return {
    log_id: Number.isInteger(values.log_id) && values.log_id >= 0 ? values.log_id : 0,
    vault_id: Number.isInteger(values.vault_id) && values.vault_id >= 0 ? values.vault_id : 0,
    archive_id: Number.isInteger(values.archive_id) && values.archive_id >= 0 ? values.archive_id : 0,
  };
}

function sanitizeListEntry(raw: ListEntry): ListEntry {
  const isDirectory = raw.is_d === 1 ? 1 : 0;
  const status = raw.st === "R" ? "R" : "A";
  return {
    aat: String(raw.aat ?? ""),
    st: status,
    is_d: isDirectory,
    vid: Number(raw.vid ?? 0),
    id: Number(raw.id),
    i: String(raw.i ?? ""),
    d: String(raw.d ?? ""),
    m: String(raw.m ?? ""),
    r: String(raw.r ?? ""),
  };
}

function sanitizeVault(raw: Vault): Vault {
  const validStatus = raw.st === "Removed" || raw.st === "Protected" ? raw.st : "Valid";
  return {
    id: Number(raw.id),
    n: String(raw.n ?? ""),
    r: String(raw.r ?? ""),
    cat: String(raw.cat ?? ""),
    st: validStatus,
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

    if (!(await pathExists(this.configFile))) {
      await writeJsonFile(this.configFile, DEFAULT_CONFIG);
    }

    if (!(await pathExists(this.autoIncrFile))) {
      await writeJsonFile(this.autoIncrFile, DEFAULT_AUTO_INCR);
    }

    await ensureFile(this.listFile);
    await ensureFile(this.vaultsFile);

    const config = await this.loadConfig();
    if (config.current_vault_id === 0 || (await pathExists(this.vaultDir(config.current_vault_id)))) {
      return;
    }

    config.current_vault_id = DEFAULT_VAULT.id;
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
    const filtered = includeRemoved ? loaded : loaded.filter((vault) => vault.st === "Valid");

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
    if ((targetRef === undefined || targetRef === null || targetRef === "") && fallbackCurrent) {
      const config = await this.loadConfig();
      targetRef = config.current_vault_id;
    }

    if (targetRef === undefined || targetRef === null || targetRef === "") {
      return undefined;
    }

    let found: Vault | undefined;
    if (typeof targetRef === "number") {
      found = vaults.find((vault) => vault.id === targetRef);
    } else if (/^\d+$/.test(targetRef)) {
      const asNumber = Number(targetRef);
      found = vaults.find((vault) => vault.id === asNumber);
    } else {
      found = vaults.find((vault) => vault.n === targetRef);
    }

    if (!found) {
      return undefined;
    }

    if (!includeRemoved && found.st === "Removed") {
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
