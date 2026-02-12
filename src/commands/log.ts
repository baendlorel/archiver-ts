import type { Command } from 'commander';
import { t } from '../i18n/index.js';
import type { CommandContext } from '../services/context.js';
import { runAction } from './command-utils.js';

export function registerLogCommands(program: Command, ctx: CommandContext): void {
  program
    .command('log')
    .description(t('command.log.description'))
    .action(() =>
      runAction(async () => {
        const logs = await ctx.logService.getLogs({ mode: 'all' });

        if (logs.length === 0) {
          return;
        }

        const lines = logs.map((entry) =>
          [
            String(entry.id),
            entry.operedAt,
            entry.level,
            `${entry.oper.main}${entry.oper.sub ? `/${entry.oper.sub}` : ''}`,
            entry.message,
            entry.archiveIds !== undefined ? String(entry.archiveIds) : '',
            entry.vaultIds !== undefined ? String(entry.vaultIds) : '',
          ].join('\t'),
        );

        console.log(lines.join('\n'));
      }),
    );
}
