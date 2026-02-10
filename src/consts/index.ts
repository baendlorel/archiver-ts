import type { ArchiverConfig, AutoIncrVars, Vault } from '../global.js';
import { VaultStatus } from './enums.js';

export const APP_NAME = 'archiver';
export const APP_DESCRIPTION = 'Archive files and folders into ~/.archiver with audit logs';

export const DEFAULT_VAULT_ID = 0;
export const DEFAULT_VAULT_NAME = '@';

export const DEFAULT_CONFIG: ArchiverConfig = {
  currentVaultId: DEFAULT_VAULT_ID,
  updateCheck: 'on',
  lastUpdateCheck: '',
  aliasMap: {},
  vaultItemSeparator: '::',
};

export const DEFAULT_AUTO_INCR: AutoIncrVars = {
  logId: 0,
  vaultId: 0,
  archiveId: 0,
};

export const DEFAULT_VAULT: Vault = {
  id: DEFAULT_VAULT_ID,
  name: DEFAULT_VAULT_NAME,
  remark: 'Default vault',
  createdAt: 'system',
  status: VaultStatus.Protected,
};

export const DEFAULT_LOG_TAIL = 15;
export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const UPDATE_REPO = process.env.ARCHIVER_GITHUB_REPO ?? 'aldia/archiver';
export const UPDATE_TIMEOUT_MS = 10_000;
