import type { ArchiverConfig, AutoIncrVars, Vault } from '../global.js';
import { VaultStatus } from './enums.js';

export const APP_NAME = 'archiver';
export const APP_DESCRIPTION = 'Archive files and folders into ~/.archiver with audit logs';

export namespace Defaults {
  export const vaultId = 0;

  export const vaultName = '@';

  export const config: ArchiverConfig = {
    currentVaultId: vaultId,
    updateCheck: 'on',
    lastUpdateCheck: '',
    aliasMap: {},
    vaultItemSeparator: '::',
  };

  export const autoIncr: AutoIncrVars = {
    logId: 0,
    vaultId: 0,
    archiveId: 0,
  };

  export const vault: Vault = {
    id: vaultId,
    name: vaultName,
    remark: 'Default vault',
    createdAt: 'system',
    status: VaultStatus.Protected,
  };

  export const logTail = 15;
}

export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const UPDATE_REPO = process.env.ARCHIVER_GITHUB_REPO ?? 'aldia/archiver';
export const UPDATE_TIMEOUT_MS = 10_000;
