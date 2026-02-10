import path from 'node:path';
import { ArchiverContext } from '../core/context.js';
import type { LogEntry, LogLevel, Operation } from '../global.js';
import { formatDateTime } from '../utils/date.js';
import { appendJsonLine } from '../utils/json.js';

export class AuditLogger {
  constructor(private readonly context: ArchiverContext) {}

  async log(
    level: LogLevel,
    operation: Operation,
    message: string,
    links?: { aid?: number; vid?: number },
  ): Promise<LogEntry> {
    const id = await this.context.nextAutoIncrement('logId');
    const now = new Date();
    const year = String(now.getFullYear());

    const entry: LogEntry = {
      id,
      operedAt: formatDateTime(now),
      level: level,
      oper: operation,
      message: message,
      ...(links?.aid !== undefined ? { archiveIds: links.aid } : {}),
      ...(links?.vid !== undefined ? { vaultIds: links.vid } : {}),
    };

    const filePath = path.join(this.context.logsDir, `${year}.jsonl`);
    await appendJsonLine(filePath, entry);

    return entry;
  }
}
