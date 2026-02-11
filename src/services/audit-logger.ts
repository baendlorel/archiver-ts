import { Paths } from '../consts/index.js';
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

    const entry: LogEntry = {
      id,
      operedAt: formatDateTime(now),
      level: level,
      oper: operation,
      message: message,
      ...(links?.aid !== undefined ? { archiveIds: links.aid } : {}),
      ...(links?.vid !== undefined ? { vaultIds: links.vid } : {}),
    };

    await appendJsonLine(Paths.File.log, entry);

    return entry;
  }
}
