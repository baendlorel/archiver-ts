import { ArchiverConfig, AutoIncrVars, Vault } from '../global.js';
import { VaultStatus } from './enums.js';

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
