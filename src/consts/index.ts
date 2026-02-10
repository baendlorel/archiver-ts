import type { ArchiverConfig, AutoIncrVars, Vault } from '../global.js';
import { VaultStatus } from './enums.js';

export const APP_NAME = 'archiver';
export const APP_DESCRIPTION = 'Archive files and folders into ~/.archiver with audit logs';

export const Defaults = {
  vaultId: 0,
  vaultName: '@',
  config: {
    currentVaultId: 0,
    updateCheck: 'on',
    lastUpdateCheck: '',
    aliasMap: {},
    vaultItemSeparator: '::',
  } satisfies ArchiverConfig,
  autoIncr: {
    logId: 0,
    vaultId: 0,
    archiveId: 0,
  } satisfies AutoIncrVars,
  vault: {
    id: 0,
    name: '@',
    remark: 'Default vault',
    createdAt: 'system',
    status: VaultStatus.Protected,
  } satisfies Vault,
  logTail: 15,
};

export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const UPDATE_REPO = process.env.ARCHIVER_GITHUB_REPO ?? 'aldia/archiver';
export const UPDATE_TIMEOUT_MS = 10_000;
