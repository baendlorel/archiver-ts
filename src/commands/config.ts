import path from 'node:path';
import type { Command } from 'commander';
import type { CommandContext } from '../services/context.js';
import { applyStyleFromConfig } from '../utils/style.js';
import { maybeAutoUpdateCheck, runAction } from './command-utils.js';
import { renderTable, success } from '../utils/terminal.js';

export function registerConfigCommands(program: Command, ctx: CommandContext): void {
  const config = program.command('config').alias('c').alias('cfg').description('Manage config values');

  config
    .command('list')
    .description('Show current config')
    .option('-c, --comment', 'Show key comments')
    .action((options: { comment?: boolean }) =>
      runAction(async () => {
        const current = await ctx.configService.getConfig();
        if (options.comment) {
          const rows: string[][] = [
            ['current_vault_id', String(current.currentVaultId), 'Current default vault id'],
            ['update_check', current.updateCheck, 'Enable automatic update checks'],
            ['last_update_check', current.lastUpdateCheck || '', 'Last auto-check timestamp (ISO)'],
            ['alias_map', JSON.stringify(current.aliasMap), 'Path alias map for display only'],
            ['vault_item_sep', current.vaultItemSeparator, 'Separator shown between vault and item'],
            ['style', current.style, 'Styled output: on or off'],
          ];
          console.log(renderTable(['Key', 'Value', 'Comment'], rows));
        } else {
          console.log(JSON.stringify(current, null, 2));
        }
      }),
    );

  config
    .command('alias')
    .description('Set or remove a display alias: <alias=path> [-r]')
    .argument('<alias-path>', 'Format: alias=/absolute/path')
    .option('-r, --remove', 'Remove alias')
    .action((aliasPath: string, options: { remove?: boolean }) =>
      runAction(async () => {
        if (options.remove) {
          const alias = aliasPath.includes('=') ? aliasPath.split('=', 1)[0] : aliasPath;
          if (!alias) {
            throw new Error('Alias cannot be empty.');
          }
          await ctx.configService.removeAlias(alias);
          success(`Removed alias ${alias}.`);

          await ctx.auditLogger.log(
            'INFO',
            { main: 'config', sub: 'alias', args: [alias], opts: { remove: true }, source: 'u' },
            `Removed alias ${alias}`,
          );
        } else {
          const split = aliasPath.split('=');
          if (split.length !== 2 || !split[0] || !split[1]) {
            throw new Error('Alias format must be alias=path.');
          }
          const alias = split[0].trim();
          const targetPath = split[1].trim();
          await ctx.configService.addAlias(alias, targetPath);
          success(`Set alias ${alias}=${path.resolve(targetPath)}.`);

          await ctx.auditLogger.log(
            'INFO',
            { main: 'config', sub: 'alias', args: [aliasPath], source: 'u' },
            `Set alias ${alias}`,
          );
        }

        await maybeAutoUpdateCheck(ctx);
      }),
    );

  config
    .command('update-check')
    .description('Enable or disable auto update checks')
    .argument('<state>', 'on|off')
    .action((state: string) =>
      runAction(async () => {
        const normalized = state.toLowerCase();
        if (normalized !== 'on' && normalized !== 'off') {
          throw new Error('State must be on or off.');
        }

        await ctx.configService.setUpdateCheck(normalized);
        success(`Auto update check is now ${normalized}.`);

        await ctx.auditLogger.log(
          'INFO',
          { main: 'config', sub: 'update-check', args: [normalized], source: 'u' },
          `Set update_check=${normalized}`,
        );

        await maybeAutoUpdateCheck(ctx);
      }),
    );

  config
    .command('style')
    .description('Enable or disable styled output')
    .argument('<state>', 'on|off')
    .action((state: string) =>
      runAction(async () => {
        const normalized = state.toLowerCase();
        if (normalized !== 'on' && normalized !== 'off') {
          throw new Error('State must be on or off.');
        }

        const updated = await ctx.configService.setStyle(normalized);
        applyStyleFromConfig(updated);
        success(`Style output is now ${normalized}.`);

        await ctx.auditLogger.log(
          'INFO',
          { main: 'config', sub: 'style', args: [normalized], source: 'u' },
          `Set style=${normalized}`,
        );
      }),
    );

  config
    .command('vault-item-sep')
    .description('Set separator between vault and item in list output')
    .argument('<sep>', 'Separator string')
    .action((separator: string) =>
      runAction(async () => {
        if (!separator.trim()) {
          throw new Error('Separator cannot be empty.');
        }

        await ctx.configService.setVaultItemSeparator(separator);
        success(`vault_item_sep updated to '${separator}'.`);

        await ctx.auditLogger.log(
          'INFO',
          { main: 'config', sub: 'vault-item-sep', args: [separator], source: 'u' },
          `Set vault_item_sep=${separator}`,
        );

        await maybeAutoUpdateCheck(ctx);
      }),
    );
}
