import type { Command } from 'commander';
import type { CommandContext } from '../services/context.js';
import { styleArchiveStatus, info, renderTable } from '../utils/terminal.js';
import { runAction } from './command-utils.js';

export function registerListCommands(program: Command, ctx: CommandContext): void {
  program
    .command('list')
    .alias('l')
    .alias('ls')
    .description('List archived entries')
    .option('--restored', 'Show only restored entries')
    .option('--all', 'Show all entries')
    .option('--vault <vault>', 'Filter by vault name or id')
    .action((options: { restored?: boolean; all?: boolean; vault?: string }) =>
      runAction(async () => {
        const entries = await ctx.archiveService.listEntries(options);
        const decorated = await ctx.archiveService.decorateEntries(entries);
        const config = await ctx.configService.getConfig();

        const headers = [
          'ID',
          'ST',
          `Vault${config.vaultItemSeparator}Item`,
          'Path',
          'Archived At',
          'Message',
          'Remark',
        ];

        const rows = decorated.map((entry) => {
          const dirDisplay = ctx.configService.renderPathWithAlias(entry.directory, config.aliasMap);
          return [
            String(entry.id),
            styleArchiveStatus(entry.status),
            `${entry.vaultName}${config.vaultItemSeparator}${entry.item}`,
            dirDisplay,
            entry.archivedAt,
            entry.message,
            entry.remark,
          ];
        });

        if (rows.length === 0) {
          info('No entries matched.');
          return;
        }

        console.log(renderTable(headers, rows));
      }),
    );
}
