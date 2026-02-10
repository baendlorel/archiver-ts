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
    const id = await this.context.nextAutoIncrement('log_id');
    const now = new Date();
    const year = String(now.getFullYear());

    const entry: LogEntry = {
      id,
      oat: formatDateTime(now),
      lv: level,
      o: operation,
      m: message,
      ...(links?.aid !== undefined ? { aid: links.aid } : {}),
      ...(links?.vid !== undefined ? { vid: links.vid } : {}),
    };

    const filePath = path.join(this.context.logsDir, `${year}.jsonl`);
    await appendJsonLine(filePath, entry);

    return entry;
  }
}
