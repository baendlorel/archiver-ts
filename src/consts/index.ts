import os from 'node:os';
import path from 'node:path';
import type { ArchiverConfig, AutoIncrVars, Vault } from '../global.js';
import { VaultStatus } from './enums.js';

export const APP_NAME = 'archiver';
export const APP_DESCRIPTION = 'Archive files and folders into ~/.archiver with audit logs';

export const ARCHIVER_ROOT = path.join(os.homedir(), '.archiver');
export const CORE_DIR = path.join(ARCHIVER_ROOT, 'core');
export const LOG_DIR = path.join(ARCHIVER_ROOT, 'logs');
export const VAULT_DIR = path.join(ARCHIVER_ROOT, 'vaults');

export const CONFIG_FILE = path.join(CORE_DIR, 'config.jsonc');
export const AUTO_INCR_FILE = path.join(CORE_DIR, 'auto-incr.jsonc');
export const LIST_FILE = path.join(CORE_DIR, 'list.jsonl');
export const VAULTS_FILE = path.join(CORE_DIR, 'vaults.jsonl');

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
