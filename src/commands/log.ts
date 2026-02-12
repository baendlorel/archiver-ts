import type { Command } from 'commander';
import { t } from '../i18n/index.js';
import type { CommandContext } from '../services/context.js';
import { parseLogRange } from '../utils/parse.js';
import { info, renderTable, styleArchiveStatus, styleLogLevel, styleVaultStatus } from '../utils/terminal.js';
import { runAction } from './command-utils.js';

export function registerLogCommands(program: Command, ctx: CommandContext): void {
  program
    .command('log')
    .description(t('command.log.description'))
    .argument('[range]', t('command.log.argument.range'))
    .option('--id <id>', t('command.log.option.id'))
    .action((range: string | undefined, options: { id?: string }) =>
      runAction(async () => {
        if (options.id !== undefined) {
          if (!/^\d+$/.test(options.id)) {
            throw new Error(t('command.log.error.invalid_id', { id: options.id }));
          }
          const logId = Number(options.id);
          const detail = await ctx.logService.getLogById(logId);
          if (!detail) {
            throw new Error(t('command.log.error.not_found', { id: logId }));
          }

          info(
            t('command.log.detail.title', {
              id: detail.log.id,
            }),
          );
          console.log(
            renderTable(
              [t('command.log.detail.table.field'), t('command.log.detail.table.value')],
              [
                [t('command.log.detail.field.id'), String(detail.log.id)],
                [t('command.log.detail.field.time'), detail.log.operedAt],
                [t('command.log.detail.field.level'), styleLogLevel(detail.log.level)],
                [
                  t('command.log.detail.field.operation'),
                  `${detail.log.oper.main}${detail.log.oper.sub ? `/${detail.log.oper.sub}` : ''}`,
                ],
                [t('command.log.detail.field.message'), detail.log.message],
                [
                  t('command.log.detail.field.archive_id'),
                  detail.log.archiveIds !== undefined ? String(detail.log.archiveIds) : '',
                ],
                [
                  t('command.log.detail.field.vault_id'),
                  detail.log.vaultIds !== undefined ? String(detail.log.vaultIds) : '',
                ],
              ],
            ),
          );

          if (detail.archive) {
            info(t('command.log.detail.linked_archive'));
            console.log(
              renderTable(
                [
                  t('command.log.detail.archive.table.id'),
                  t('command.log.detail.archive.table.status'),
                  t('command.log.detail.archive.table.vault'),
                  t('command.log.detail.archive.table.item'),
                  t('command.log.detail.archive.table.dir'),
                ],
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
            info(t('command.log.detail.linked_vault'));
            console.log(
              renderTable(
                [
                  t('command.log.detail.vault.table.id'),
                  t('command.log.detail.vault.table.name'),
                  t('command.log.detail.vault.table.status'),
                  t('command.log.detail.vault.table.remark'),
                ],
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
        const logs = await ctx.logService.getLogs(parsedRange);

        if (logs.length === 0) {
          info(t('command.log.empty'));
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

        console.log(
          renderTable(
            [
              t('command.log.table.id'),
              t('command.log.table.time'),
              t('command.log.table.level'),
              t('command.log.table.op'),
              t('command.log.table.message'),
              t('command.log.table.aid'),
              t('command.log.table.vid'),
            ],
            rows,
          ),
        );
      }),
    );
}
