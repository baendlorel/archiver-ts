import type { VaultStatus, ArchiveStatus, CheckIssueLevel } from './consts/enums.js';

export interface ListEntry {
  archivedAt: string;
  status: ArchiveStatus;
  isDirectory: 0 | 1;
  vaultId: number;
  id: number;
  item: string;
  directory: string;
  message: string;
  remark: string;
}

export interface Vault {
  id: number;
  name: string;
  remark: string;
  createdAt: string;
  status: VaultStatus;
}

export interface ArchiverConfig {
  currentVaultId: number;
  updateCheck: 'on' | 'off';
  lastUpdateCheck: string;
  aliasMap: Record<string, string>;
  vaultItemSeparator: string;
}

export interface AutoIncrVars {
  logId: number;
  vaultId: number;
  archiveId: number;
}

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

export type OperationSource = 'u' | 's' | 't';

export interface Operation {
  main: string;
  sub?: string;
  args?: string[];
  opts?: Record<string, string | number | boolean>;
  source?: OperationSource;
}

export interface LogEntry {
  id: number;
  operedAt: string;
  level: LogLevel;
  oper: Operation;
  message: string;
  archiveIds?: number;
  vaultIds?: number;
}

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  htmlUrl?: string;
  publishedAt?: string;
}

export interface CheckIssue {
  level: CheckIssueLevel;
  code: string;
  message: string;
}

export interface CheckReport {
  issues: CheckIssue[];
  info: string[];
}
