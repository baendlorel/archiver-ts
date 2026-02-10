import type { Command } from 'commander';
import { Defaults } from '../consts/index.js';
import type { CommandContext } from '../services/context.js';
import { parseLogRange } from '../utils/parse.js';
import { info, renderTable, styleArchiveStatus, styleLogLevel, styleVaultStatus } from '../utils/terminal.js';
import { runAction } from './command-utils.js';

export function registerLogCommands(program: Command, ctx: CommandContext): void {
  program
    .command('log')
    .alias('lg')
    .description('Show operation logs')
    .argument('[range]', 'YYYYMM | YYYYMM-YYYYMM | all|*|a')
    .option('--id <id>', 'Show one log record by id')
    .action((range: string | undefined, options: { id?: string }) =>
      runAction(async () => {
        if (options.id !== undefined) {
          if (!/^\d+$/.test(options.id)) {
            throw new Error(`Invalid log id: ${options.id}`);
          }
          const logId = Number(options.id);
          const detail = await ctx.logService.getLogById(logId);
          if (!detail) {
            throw new Error(`Log id ${logId} not found.`);
          }

          info(`Log #${detail.log.id}`);
          console.log(
            renderTable(
              ['Field', 'Value'],
              [
                ['id', String(detail.log.id)],
                ['time', detail.log.operedAt],
                ['level', styleLogLevel(detail.log.level)],
                ['operation', `${detail.log.oper.main}${detail.log.oper.sub ? `/${detail.log.oper.sub}` : ''}`],
                ['message', detail.log.message],
                ['archive_id', detail.log.archiveIds !== undefined ? String(detail.log.archiveIds) : ''],
                ['vault_id', detail.log.vaultIds !== undefined ? String(detail.log.vaultIds) : ''],
              ],
            ),
          );

          if (detail.archive) {
            info('Linked archive entry');
            console.log(
              renderTable(
                ['id', 'status', 'vault', 'item', 'dir'],
                [
                  [
                    String(detail.archive.id),
                    styleArchiveStatus(detail.archive.status),
                    String(detail.archive.vaultId),
                    detail.archive.item,
                    detail.archive.directory,
                  ],
                ],
              ),
            );
          }

          if (detail.vault) {
            info('Linked vault');
            console.log(
              renderTable(
                ['id', 'name', 'status', 'remark'],
                [
                  [
                    String(detail.vault.id),
                    detail.vault.name,
                    styleVaultStatus(detail.vault.status),
                    detail.vault.remark,
                  ],
                ],
              ),
            );
          }

          return;
        }

        const parsedRange = parseLogRange(range);
        const logs = await ctx.logService.getLogs(parsedRange, Defaults.logTail);

        if (logs.length === 0) {
          info('No logs found.');
          return;
        }

        const rows = logs.map((entry) => [
          String(entry.id),
          entry.operedAt,
          styleLogLevel(entry.level),
          `${entry.oper.main}${entry.oper.sub ? `/${entry.oper.sub}` : ''}`,
          entry.message,
          entry.archiveIds !== undefined ? String(entry.archiveIds) : '',
          entry.vaultIds !== undefined ? String(entry.vaultIds) : '',
        ]);

        console.log(renderTable(['ID', 'Time', 'Level', 'Op', 'Message', 'AID', 'VID'], rows));
      }),
    );
}
