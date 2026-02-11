import type { ArchiverConfig, AutoIncrVars, Vault } from '../global.js';
import { DEFAULT_AUTO_INCR_JSONC_RAW, DEFAULT_CONFIG_JSONC_RAW } from '../default-files/index.js';
import { parseJsoncText } from '../utils/jsonc.js';
import { VaultStatus } from './enums.js';

export namespace Defaults {
  export const VaultId = 0;

  export const VaultName = '@';

  export const Config = parseJsoncText<ArchiverConfig>(DEFAULT_CONFIG_JSONC_RAW, 'default-files/config.default.jsonc');

  export const AutoIncr = parseJsoncText<AutoIncrVars>(
    DEFAULT_AUTO_INCR_JSONC_RAW,
    'default-files/auto-incr.default.jsonc',
  );

  export const Vault: Vault = {
    id: VaultId,
    name: VaultName,
    remark: 'Default vault',
    createdAt: 'system',
    status: VaultStatus.Protected,
  };

  export const LogTail = 15;
}
