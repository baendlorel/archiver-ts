export type ArchiveStatus = "A" | "R";

export interface ListEntry {
  aat: string;
  st: ArchiveStatus;
  is_d: 0 | 1;
  vid: number;
  id: number;
  i: string;
  d: string;
  m: string;
  r: string;
}

export type VaultStatus = "Valid" | "Removed" | "Protected";

export interface Vault {
  id: number;
  n: string;
  r: string;
  cat: string;
  st: VaultStatus;
}

export interface ArchiverConfig {
  current_vault_id: number;
  update_check: "on" | "off";
  last_update_check: string;
  alias_map: Record<string, string>;
  vault_item_sep: string;
}

export interface AutoIncrVars {
  log_id: number;
  vault_id: number;
  archive_id: number;
}

export type LogLevel = "INFO" | "WARN" | "ERROR" | "FATAL";

export type OperationSource = "u" | "s" | "t";

export interface Operation {
  m: string;
  s?: string;
  a?: string[];
  opt?: Record<string, string | number | boolean>;
  sc?: OperationSource;
}

export interface LogEntry {
  id: number;
  oat: string;
  lv: LogLevel;
  o: Operation;
  m: string;
  aid?: number;
  vid?: number;
}

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  htmlUrl?: string;
  publishedAt?: string;
}

export interface CheckIssue {
  level: "ERROR" | "WARN";
  code: string;
  message: string;
}

export interface CheckReport {
  issues: CheckIssue[];
  info: string[];
}
