import os from 'node:os';
import path from 'node:path';
import type { ArchiverConfig, AutoIncrVars, Vault } from './global.js';

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
  current_vault_id: DEFAULT_VAULT_ID,
  update_check: 'on',
  last_update_check: '',
  alias_map: {},
  vault_item_sep: '::',
};

export const DEFAULT_AUTO_INCR: AutoIncrVars = {
  log_id: 0,
  vault_id: 0,
  archive_id: 0,
};

export const DEFAULT_VAULT: Vault = {
  id: DEFAULT_VAULT_ID,
  n: DEFAULT_VAULT_NAME,
  r: 'Default vault',
  cat: 'system',
  st: 'Protected',
};

export const DEFAULT_LOG_TAIL = 15;
export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const UPDATE_REPO = process.env.ARCHIVER_GITHUB_REPO ?? 'aldia/archiver';
export const UPDATE_TIMEOUT_MS = 10_000;
