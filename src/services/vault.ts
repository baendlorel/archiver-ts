import fs from 'node:fs/promises';
import path from 'node:path';
import type { ListEntry, Vault } from '../global.js';
import type { ArchiverContext } from '../core/context.js';
import type { ConfigService } from './config.js';

import { Defaults, Paths, ArchiveStatus, VaultStatus } from '../consts/index.js';
import { t } from '../i18n/index.js';
import { formatDateTime } from '../utils/date.js';
import { pathAccessible } from '../utils/fs.js';

export interface RemoveVaultResult {
  vault: Vault;
  movedArchiveIds: number[];
}

export class VaultRemovedExistsError extends Error {
  constructor(vaultName: string) {
    super(
      t('service.vault.error.removed_exists', {
        name: vaultName,
      }),
    );
    this.name = 'VaultRemovedExistsError';
  }
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
      throw new Error(t('service.vault.error.name_empty'));
    }
    if (name === Defaults.Vault.name) {
      throw new Error(
        t('service.vault.error.name_reserved', {
          name: Defaults.Vault.name,
        }),
      );
    }

    const vaults = await this.context.loadVaults();
    const duplicated = vaults.find((vault) => vault.name === name);

    if (duplicated?.status === VaultStatus.Valid || duplicated?.status === VaultStatus.Protected) {
      throw new Error(
        t('service.vault.error.exists', {
          name,
        }),
      );
    }

    if (duplicated?.status === 'Removed') {
      if (!options.recoverRemoved) {
        throw new VaultRemovedExistsError(name);
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
      throw new Error(
        t('service.vault.error.not_found', {
          reference,
        }),
      );
    }

    if (vault.status === 'Removed') {
      throw new Error(
        t('service.vault.error.removed', {
          name: vault.name,
        }),
      );
    }

    await this.configService.setCurrentVault(vault.id);
    return vault;
  }

  async recoverVault(reference: string): Promise<Vault> {
    const vaults = await this.context.loadVaults();
    const vault = vaults.find((item) => item.name === reference || String(item.id) === reference);

    if (!vault) {
      throw new Error(
        t('service.vault.error.not_found', {
          reference,
        }),
      );
    }

    if (vault.status !== 'Removed') {
      throw new Error(
        t('service.vault.error.not_removed', {
          name: vault.name,
        }),
      );
    }

    vault.status = VaultStatus.Valid;
    await this.context.ensureVaultDir(vault.id);
    await this.context.saveVaults(vaults);
    return vault;
  }

  async renameVault(oldNameOrId: string, newName: string): Promise<Vault> {
    const trimmed = newName.trim();
    if (!trimmed) {
      throw new Error(t('service.vault.error.new_name_empty'));
    }
    if (trimmed === Defaults.Vault.name) {
      throw new Error(
        t('service.vault.error.name_reserved', {
          name: Defaults.Vault.name,
        }),
      );
    }

    const vaults = await this.context.loadVaults();
    const target = vaults.find((item) => item.name === oldNameOrId || String(item.id) === oldNameOrId);
    if (!target) {
      throw new Error(
        t('service.vault.error.not_found', {
          reference: oldNameOrId,
        }),
      );
    }
    if (target.status !== 'Valid') {
      throw new Error(
        t('service.vault.error.not_valid_state', {
          name: target.name,
        }),
      );
    }

    const conflict = vaults.find((item) => item.name === trimmed && item.id !== target.id);
    if (conflict) {
      throw new Error(
        t('service.vault.error.name_conflict', {
          name: trimmed,
        }),
      );
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
      throw new Error(
        t('service.vault.error.not_found', {
          reference: nameOrId,
        }),
      );
    }

    if (vault.id === Defaults.Vault.id || vault.status === VaultStatus.Protected) {
      throw new Error(t('service.vault.error.default_cannot_remove'));
    }

    if (vault.status === VaultStatus.Removed) {
      throw new Error(
        t('service.vault.error.already_removed', {
          name: vault.name,
        }),
      );
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
      throw new Error(
        t('service.vault.error.not_found_while_saving', {
          id: vault.id,
        }),
      );
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
        throw new Error(
          t('service.vault.error.archived_object_missing', {
            path: from,
          }),
        );
      }

      if (await pathAccessible(to)) {
        throw new Error(
          t('service.vault.error.default_contains_archive_id', {
            id: entry.id,
          }),
        );
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
