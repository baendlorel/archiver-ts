import { ArchiverContext } from '../core/context.js';
import { ArchiveService } from './archive.js';
import { AuditLogger } from './audit-logger.js';
import { CheckService } from './check.js';
import { ConfigService } from './config.js';
import { LogService } from './log.js';
import { UpdateService } from './update.js';
import { VaultService } from './vault.js';

export interface CommandContext {
  readonly context: ArchiverContext;
  readonly archiveService: ArchiveService;
  readonly vaultService: VaultService;
  readonly configService: ConfigService;
  readonly logService: LogService;
  readonly checkService: CheckService;
  readonly auditLogger: AuditLogger;
  readonly updateService: UpdateService;
  readonly version: string;
}

export async function createCommandContext(): Promise<CommandContext> {
  const context = new ArchiverContext();
  await context.init();

  const configService = new ConfigService(context);
  const auditLogger = new AuditLogger(context);
  const archiveService = new ArchiveService(context, configService, auditLogger);
  const vaultService = new VaultService(context, configService);
  const logService = new LogService(context);
  const checkService = new CheckService(context);
  const version = __VERSION__;
  const updateService = new UpdateService(version);

  return {
    context,
    archiveService,
    vaultService,
    configService,
    logService,
    checkService,
    auditLogger,
    updateService,
    version,
  };
}
