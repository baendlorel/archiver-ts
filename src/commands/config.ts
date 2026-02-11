import path from 'node:path';
import type { Command } from 'commander';
import { t } from '../i18n/index.js';
import type { CommandContext } from '../services/context.js';
import { applyStyleFromConfig } from '../utils/style.js';
import { maybeAutoUpdateCheck, runAction } from './command-utils.js';
import { renderTable, success } from '../utils/terminal.js';

export function registerConfigCommands(program: Command, ctx: CommandContext): void {
  const config = program.command('config').alias('c').alias('cfg').description(t('command.config.description'));

  config
    .command('list')
    .description(t('command.config.list.description'))
    .option('-c, --comment', t('command.config.list.option.comment'))
    .action((options: { comment?: boolean }) =>
      runAction(async () => {
        const current = await ctx.configService.getConfig();
        if (options.comment) {
          const rows: string[][] = [
            ['current_vault_id', String(current.currentVaultId), t('command.config.list.comment.current_vault_id')],
            ['update_check', current.updateCheck, t('command.config.list.comment.update_check')],
            ['last_update_check', current.lastUpdateCheck || '', t('command.config.list.comment.last_update_check')],
            ['alias_map', JSON.stringify(current.aliasMap), t('command.config.list.comment.alias_map')],
            ['vault_item_sep', current.vaultItemSeparator, t('command.config.list.comment.vault_item_sep')],
            ['style', current.style, t('command.config.list.comment.style')],
            ['language', current.language, t('command.config.list.comment.language')],
            [
              'no_command_action',
              current.noCommandAction,
              t('command.config.list.comment.no_command_action'),
            ],
          ];
          console.log(
            renderTable(
              [t('command.config.list.table.key'), t('command.config.list.table.value'), t('command.config.list.table.comment')],
              rows,
            ),
          );
        } else {
          console.log(JSON.stringify(current, null, 2));
        }
      }),
    );

  config
    .command('alias')
    .description(t('command.config.alias.description'))
    .argument('<alias-path>', t('command.config.alias.argument'))
    .option('-r, --remove', t('command.config.alias.option.remove'))
    .action((aliasPath: string, options: { remove?: boolean }) =>
      runAction(async () => {
        if (options.remove) {
          const alias = aliasPath.includes('=') ? aliasPath.split('=', 1)[0] : aliasPath;
          if (!alias) {
            throw new Error(t('command.config.alias.error.empty'));
          }
          await ctx.configService.removeAlias(alias);
          success(t('command.config.alias.removed', { alias }));

          await ctx.auditLogger.log(
            'INFO',
            { main: 'config', sub: 'alias', args: [alias], opts: { remove: true }, source: 'u' },
            t('command.config.alias.removed', { alias }),
          );
        } else {
          const split = aliasPath.split('=');
          if (split.length !== 2 || !split[0] || !split[1]) {
            throw new Error(t('command.config.alias.error.format'));
          }
          const alias = split[0].trim();
          const targetPath = split[1].trim();
          await ctx.configService.addAlias(alias, targetPath);
          const resolvedPath = path.resolve(targetPath);
          success(t('command.config.alias.set', { alias, path: resolvedPath }));

          await ctx.auditLogger.log(
            'INFO',
            { main: 'config', sub: 'alias', args: [aliasPath], source: 'u' },
            t('command.config.alias.set', { alias, path: resolvedPath }),
          );
        }

        await maybeAutoUpdateCheck(ctx);
      }),
    );

  config
    .command('update-check')
    .description(t('command.config.update_check.description'))
    .argument('<state>', t('command.config.update_check.argument'))
    .action((state: string) =>
      runAction(async () => {
        const normalized = state.toLowerCase();
        if (normalized !== 'on' && normalized !== 'off') {
          throw new Error(t('command.config.state.error'));
        }

        await ctx.configService.setUpdateCheck(normalized);
        success(t('command.config.update_check.updated', { state: normalized }));

        await ctx.auditLogger.log(
          'INFO',
          { main: 'config', sub: 'update-check', args: [normalized], source: 'u' },
          t('command.config.update_check.updated', { state: normalized }),
        );

        await maybeAutoUpdateCheck(ctx);
      }),
    );

  config
    .command('style')
    .description(t('command.config.style.description'))
    .argument('<state>', t('command.config.style.argument'))
    .action((state: string) =>
      runAction(async () => {
        const normalized = state.toLowerCase();
        if (normalized !== 'on' && normalized !== 'off') {
          throw new Error(t('command.config.state.error'));
        }

        const updated = await ctx.configService.setStyle(normalized);
        applyStyleFromConfig(updated);
        success(t('command.config.style.updated', { state: normalized }));

        await ctx.auditLogger.log(
          'INFO',
          { main: 'config', sub: 'style', args: [normalized], source: 'u' },
          t('command.config.style.updated', { state: normalized }),
        );
      }),
    );

  config
    .command('vault-item-sep')
    .description(t('command.config.vault_item_sep.description'))
    .argument('<sep>', t('command.config.vault_item_sep.argument'))
    .action((separator: string) =>
      runAction(async () => {
        if (!separator.trim()) {
          throw new Error(t('command.config.vault_item_sep.error.empty'));
        }

        await ctx.configService.setVaultItemSeparator(separator);
        success(
          t('command.config.vault_item_sep.updated', {
            separator,
          }),
        );

        await ctx.auditLogger.log(
          'INFO',
          { main: 'config', sub: 'vault-item-sep', args: [separator], source: 'u' },
          t('command.config.vault_item_sep.updated', {
            separator,
          }),
        );

        await maybeAutoUpdateCheck(ctx);
      }),
    );

  config
    .command('no-command-action')
    .description(t('command.config.no_command_action.description'))
    .argument('<action>', t('command.config.no_command_action.argument'))
    .action((action: string) =>
      runAction(async () => {
        const normalized = action.toLowerCase();
        if (normalized !== 'help' && normalized !== 'list' && normalized !== 'unknown') {
          throw new Error(t('command.config.no_command_action.error.invalid'));
        }

        await ctx.configService.setNoCommandAction(normalized);
        success(t('command.config.no_command_action.updated', { action: normalized }));

        await ctx.auditLogger.log(
          'INFO',
          { main: 'config', sub: 'no-command-action', args: [normalized], source: 'u' },
          t('command.config.no_command_action.updated', { action: normalized }),
        );
      }),
    );

  config
    .command('language')
    .description(t('command.config.language.description'))
    .argument('<language>', t('command.config.language.argument'))
    .action((language: string) =>
      runAction(async () => {
        const normalized = language.toLowerCase();
        if (normalized !== 'zh' && normalized !== 'en') {
          throw new Error(t('command.config.language.error.invalid'));
        }

        await ctx.configService.setLanguage(normalized);
        success(t('command.config.language.updated', { language: normalized }));

        await ctx.auditLogger.log(
          'INFO',
          { main: 'config', sub: 'language', args: [normalized], source: 'u' },
          t('command.config.language.updated', { language: normalized }),
        );
      }),
    );
}
