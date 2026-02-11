import type { ArchiverConfig, AutoIncrVars, Vault } from '../global.js';
import { parseJsoncText } from '../utils/json.js';
import { VaultStatus } from './enums.js';

import DEFAULT_CONFIG from '../default-files/config.jsonc?raw';
import DEFAULT_AUTO_INCR from '../default-files/auto-incr.jsonc?raw';

export namespace Defaults {
  export const VaultId = 0;

  export const VaultName = '@';

  const toNonNegativeInt = (value: unknown, fallback: number): number => {
    if (Number.isInteger(value) && Number(value) >= 0) {
      return Number(value);
    }
    return fallback;
  };

  const parsedConfig = parseJsoncText<Partial<ArchiverConfig>>(DEFAULT_CONFIG, 'default-files/config.jsonc');
  const parsedAutoIncr = parseJsoncText<Partial<AutoIncrVars>>(DEFAULT_AUTO_INCR, 'default-files/auto-incr.jsonc');

  export const Config: ArchiverConfig = {
    currentVaultId: toNonNegativeInt(parsedConfig.currentVaultId, VaultId),
    updateCheck: parsedConfig.updateCheck === 'off' ? 'off' : 'on',
    lastUpdateCheck: typeof parsedConfig.lastUpdateCheck === 'string' ? parsedConfig.lastUpdateCheck : '',
    aliasMap:
      typeof parsedConfig.aliasMap === 'object' && parsedConfig.aliasMap !== null
        ? (parsedConfig.aliasMap as Record<string, string>)
        : {},
    vaultItemSeparator:
      typeof parsedConfig.vaultItemSeparator === 'string' && parsedConfig.vaultItemSeparator.length > 0
        ? parsedConfig.vaultItemSeparator
        : '::',
    style: parsedConfig.style === 'off' ? 'off' : 'on',
    noCommandAction:
      parsedConfig.noCommandAction === 'help' ||
      parsedConfig.noCommandAction === 'list' ||
      parsedConfig.noCommandAction === 'unknown'
        ? parsedConfig.noCommandAction
        : 'unknown',
  };

  export const AutoIncr: AutoIncrVars = {
    logId: toNonNegativeInt(parsedAutoIncr.logId, 0),
    vaultId: toNonNegativeInt(parsedAutoIncr.vaultId, 0),
    archiveId: toNonNegativeInt(parsedAutoIncr.archiveId, 0),
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
