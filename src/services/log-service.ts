import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_LOG_TAIL } from '../constants.js';
import { ArchiverContext } from '../core/context.js';
import type { ListEntry, LogEntry, Vault } from '../global.js';
import type { LogRange } from '../utils/parse.js';
import { readJsonLinesFile } from '../utils/json.js';

function normalizeLogEntry(raw: LogEntry): LogEntry {
  return {
    id: Number(raw.id),
    oat: String(raw.oat ?? ''),
    lv: raw.lv ?? 'INFO',
    o: raw.o ?? { m: 'unknown' },
    m: String(raw.m ?? ''),
    ...(raw.aid !== undefined ? { aid: Number(raw.aid) } : {}),
    ...(raw.vid !== undefined ? { vid: Number(raw.vid) } : {}),
  };
}

function monthFromLog(entry: LogEntry): string {
  const source = entry.oat;
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

  async getLogs(range: LogRange, tailCount: number = DEFAULT_LOG_TAIL): Promise<LogEntry[]> {
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

    if (log.aid !== undefined) {
      const list = await this.context.loadListEntries();
      detail.archive = list.find((entry) => entry.id === log.aid);
    }

    if (log.vid !== undefined) {
      const vaults = await this.context.getVaults({ includeRemoved: true, withDefault: true });
      detail.vault = vaults.find((vault) => vault.id === log.vid);
    }

    return detail;
  }

  private async loadAllLogs(): Promise<LogEntry[]> {
    const yearFiles = await this.listYearFiles();

    const logs: LogEntry[] = [];
    for (const fileName of yearFiles) {
      const filePath = path.join(this.context.logsDir, fileName);
      const rows = await readJsonLinesFile<LogEntry>(filePath);
      rows.forEach((row) => logs.push(normalizeLogEntry(row)));
    }

    logs.sort((a, b) => a.id - b.id);
    return logs;
  }

  private async listYearFiles(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.context.logsDir, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile() && /^\d{4}\.jsonl$/.test(entry.name))
        .map((entry) => entry.name)
        .sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }
}
