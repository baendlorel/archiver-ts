import fs from 'node:fs/promises';
import path from 'node:path';
import type { ListEntry, Vault } from '../global.js';

import { Defaults, Paths, ArchiveStatus, VaultStatus } from '../consts/index.js';
import { ArchiverContext } from '../core/context.js';
import { formatDateTime } from '../utils/date.js';
import { pathAccessible } from '../utils/fs.js';
import { ConfigService } from './config.js';

export interface RemoveVaultResult {
  vault: Vault;
  movedArchiveIds: number[];
}

export class VaultService {
  constructor(
    private readonly context: ArchiverContext,
    private readonly configService: ConfigService,
  ) {}

  async listVaults(includeAll: boolean): Promise<Vault[]> {
    return this.context.getVaults({ includeRemoved: includeAll, withDefault: true });
  }

  async createVault(options: {
    name: string;
    remark?: string;
    activate?: boolean;
    recoverRemoved?: boolean;
  }): Promise<{ vault: Vault; recovered: boolean }> {
    const name = options.name.trim();
    if (!name) {
      throw new Error('Vault name cannot be empty.');
    }
    if (name === Defaults.Vault.name) {
      throw new Error(`Vault name ${Defaults.Vault.name} is reserved.`);
    }

    const vaults = await this.context.loadVaults();
    const duplicated = vaults.find((vault) => vault.name === name);

    if (duplicated?.status === VaultStatus.Valid || duplicated?.status === VaultStatus.Protected) {
      throw new Error(`Vault ${name} already exists.`);
    }

    if (duplicated?.status === 'Removed') {
      if (!options.recoverRemoved) {
        throw new Error(
          `A removed vault named ${name} exists. Use vault recover ${name} or create with recovery option.`,
        );
      }
      duplicated.status = VaultStatus.Valid;
      await this.context.ensureVaultDir(duplicated.id);
      await this.context.saveVaults(vaults);
      if (options.activate) {
        await this.configService.setCurrentVault(duplicated.id);
      }
      return { vault: duplicated, recovered: true };
    }

    const vaultId = await this.context.nextAutoIncrement('vaultId');
    const vault: Vault = {
      id: vaultId,
      name: name,
      remark: options.remark ?? '',
      createdAt: formatDateTime(),
      status: VaultStatus.Valid,
    };

    vaults.push(vault);
    await this.context.saveVaults(vaults);
    await this.context.ensureVaultDir(vault.id);

    if (options.activate) {
      await this.configService.setCurrentVault(vault.id);
    }

    return { vault, recovered: false };
  }

  async useVault(reference: string): Promise<Vault> {
    const vault = await this.context.resolveVault(reference, { includeRemoved: false, fallbackCurrent: false });
    if (!vault) {
      throw new Error(`Vault not found: ${reference}`);
    }

    if (vault.status === 'Removed') {
      throw new Error(`Vault ${vault.name} is removed.`);
    }

    await this.configService.setCurrentVault(vault.id);
    return vault;
  }

  async recoverVault(reference: string): Promise<Vault> {
    const vaults = await this.context.loadVaults();
    const vault = vaults.find((item) => item.name === reference || String(item.id) === reference);

    if (!vault) {
      throw new Error(`Vault not found: ${reference}`);
    }

    if (vault.status !== 'Removed') {
      throw new Error(`Vault ${vault.name} is not removed.`);
    }

    vault.status = VaultStatus.Valid;
    await this.context.ensureVaultDir(vault.id);
    await this.context.saveVaults(vaults);
    return vault;
  }

  async renameVault(oldNameOrId: string, newName: string): Promise<Vault> {
    const trimmed = newName.trim();
    if (!trimmed) {
      throw new Error('New vault name cannot be empty.');
    }
    if (trimmed === Defaults.Vault.name) {
      throw new Error(`Vault name ${Defaults.Vault.name} is reserved.`);
    }

    const vaults = await this.context.loadVaults();
    const target = vaults.find((item) => item.name === oldNameOrId || String(item.id) === oldNameOrId);
    if (!target) {
      throw new Error(`Vault not found: ${oldNameOrId}`);
    }
    if (target.status !== 'Valid') {
      throw new Error(`Vault ${target.name} is not in valid state.`);
    }

    const conflict = vaults.find((item) => item.name === trimmed && item.id !== target.id);
    if (conflict) {
      throw new Error(`Vault name ${trimmed} already exists.`);
    }

    target.name = trimmed;
    await this.context.saveVaults(vaults);
    return target;
  }

  async removeVault(nameOrId: string): Promise<RemoveVaultResult> {
    const vault = await this.context.resolveVault(nameOrId, {
      includeRemoved: true,
      fallbackCurrent: false,
    });

    if (!vault) {
      throw new Error(`Vault not found: ${nameOrId}`);
    }

    if (vault.id === Defaults.Vault.id || vault.status === VaultStatus.Protected) {
      throw new Error('Default vault cannot be removed.');
    }

    if (vault.status === VaultStatus.Removed) {
      throw new Error(`Vault ${vault.name} is already removed.`);
    }

    const entries = await this.context.loadListEntries();
    const archived = entries.filter((entry) => entry.vaultId === vault.id && entry.status === ArchiveStatus.Archived);

    await this.context.ensureVaultDir(Defaults.Vault.id);

    await this.validateMoveToDefault(archived);

    const movedArchiveIds: number[] = [];
    for (const entry of archived) {
      const from = this.context.archivePath(vault.id, entry.id);
      const to = this.context.archivePath(Defaults.Vault.id, entry.id);

      await fs.rename(from, to);
      entry.vaultId = Defaults.Vault.id;
      movedArchiveIds.push(entry.id);
    }

    const vaults = await this.context.loadVaults();
    const target = vaults.find((item) => item.id === vault.id);
    if (!target) {
      throw new Error(`Vault not found while saving: ${vault.id}`);
    }
    target.status = VaultStatus.Removed;

    await this.context.saveListEntries(entries);
    await this.context.saveVaults(vaults);

    const config = await this.context.loadConfig();
    if (config.currentVaultId === vault.id) {
      config.currentVaultId = Defaults.Vault.id;
      await this.context.saveConfig(config);
    }

    return { vault: target, movedArchiveIds };
  }

  private async validateMoveToDefault(entries: ListEntry[]): Promise<void> {
    for (const entry of entries) {
      const from = this.context.archivePath(entry.vaultId, entry.id);
      const to = this.context.archivePath(Defaults.Vault.id, entry.id);

      if (!(await pathAccessible(from))) {
        throw new Error(`Archived object is missing: ${from}`);
      }

      if (await pathAccessible(to)) {
        throw new Error(`Default vault already contains archive id ${entry.id}.`);
      }
    }
  }

  async resolveVaultForRead(reference?: string): Promise<Vault | undefined> {
    if (reference === undefined) {
      return undefined;
    }
    return this.context.resolveVault(reference, {
      includeRemoved: true,
      fallbackCurrent: false,
    });
  }

  async listArchivedIdsInVault(vaultId: number): Promise<number[]> {
    const dirPath = this.context.vaultDir(vaultId);
    const exists = await pathAccessible(dirPath);
    if (!exists) {
      return [];
    }

    const items = await fs.readdir(dirPath, { withFileTypes: true });
    return items
      .filter((item) => item.isFile() || item.isDirectory() || item.isSymbolicLink())
      .map((item) => item.name)
      .filter((name) => /^\d+$/.test(name))
      .map((name) => Number(name))
      .sort((a, b) => a - b);
  }

  getVaultDisplay(vault: Vault): string {
    if (vault.id === Defaults.Vault.id) {
      return `${vault.name}(${vault.id})`;
    }
    return `${vault.name}(${vault.id})`;
  }

  vaultRoot(vault: Vault): string {
    return path.join(Paths.Dir.vaults, String(vault.id));
  }
}
