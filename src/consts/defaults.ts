import type { ArchiverConfig, AutoIncrVars, Vault } from '../global.js';
import { VaultStatus } from './enums.js';

export namespace Defaults {
  export const VaultId = 0;

  export const VaultName = '@';

  export const Config: ArchiverConfig = {
    currentVaultId: VaultId,
    updateCheck: 'on',
    lastUpdateCheck: '',
    aliasMap: {},
    vaultItemSeparator: '::',
    style: 'on',
    noCommandAction: 'unknown',
  };

  export const AutoIncr: AutoIncrVars = {
    logId: 0,
    vaultId: 0,
    archiveId: 0,
  };

  export const Vault: Vault = {
    id: VaultId,
    name: VaultName,
    remark: 'Default vault',
    createdAt: 'system',
    status: VaultStatus.Protected,
  };

  export const LogTail = 15;
}
