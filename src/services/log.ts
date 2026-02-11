import { Defaults, Paths } from '../consts/index.js';
import { ArchiverContext } from '../core/context.js';
import type { ListEntry, LogEntry, Vault } from '../global.js';
import type { LogRange } from '../utils/parse.js';
import { readJsonLinesFile } from '../utils/json.js';

function normalizeLogEntry(raw: LogEntry): LogEntry {
  return {
    id: Number(raw.id),
    operedAt: String(raw.operedAt ?? ''),
    level: raw.level ?? 'INFO',
    oper: raw.oper ?? { main: 'unknown' },
    message: String(raw.message ?? ''),
    ...(raw.archiveIds !== undefined ? { archiveIds: Number(raw.archiveIds) } : {}),
    ...(raw.vaultIds !== undefined ? { vaultIds: Number(raw.vaultIds) } : {}),
  };
}

function monthFromLog(entry: LogEntry): string {
  const source = entry.operedAt;
  const normalized = source.replace(/[-:\sT]/g, '');
  return normalized.slice(0, 6);
}

export interface LogDetail {
  log: LogEntry;
  archive?: ListEntry;
  vault?: Vault;
}

export class LogService {
  constructor(private readonly context: ArchiverContext) {}

  async getLogs(range: LogRange, tailCount: number = Defaults.LogTail): Promise<LogEntry[]> {
    const allLogs = await this.loadAllLogs();

    if (range.mode === 'tail') {
      return allLogs.slice(-tailCount);
    }

    if (range.mode === 'all') {
      return allLogs;
    }

    return allLogs.filter((entry) => {
      const month = monthFromLog(entry);
      if (!month || month.length !== 6) {
        return false;
      }
      return month >= range.from && month <= range.to;
    });
  }

  async getLogById(logId: number): Promise<LogDetail | undefined> {
    const allLogs = await this.loadAllLogs();
    const log = allLogs.find((entry) => entry.id === logId);
    if (!log) {
      return undefined;
    }

    const detail: LogDetail = { log };

    if (log.archiveIds !== undefined) {
      const list = await this.context.loadListEntries();
      detail.archive = list.find((entry) => entry.id === log.archiveIds);
    }

    if (log.vaultIds !== undefined) {
      const vaults = await this.context.getVaults({ includeRemoved: true, withDefault: true });
      detail.vault = vaults.find((vault) => vault.id === log.vaultIds);
    }

    return detail;
  }

  private async loadAllLogs(): Promise<LogEntry[]> {
    const rows = await readJsonLinesFile<LogEntry>(Paths.File.log);
    const logs = rows.map((row) => normalizeLogEntry(row));

    logs.sort((a, b) => a.id - b.id);
    return logs;
  }
}
