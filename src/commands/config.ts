import type { Command } from 'commander';
import { Defaults } from '../consts/index.js';
import { t } from '../i18n/index.js';
import type { CommandContext } from '../services/context.js';
import { applyStyleFromConfig } from '../utils/style.js';
import { info, success } from '../utils/terminal.js';
import { maybeAutoUpdateCheck, runAction } from './command-utils.js';
import { isEditableConfigEqual, promptConfigEditor, toEditableConfigValues } from './config-interactive.js';

async function openConfigEditor(ctx: CommandContext): Promise<void> {
  const current = await ctx.configService.getConfig();
  const initialValues = toEditableConfigValues(current);
  const edited = await promptConfigEditor(initialValues);

  if (edited.action === 'cancel') {
    info(t('command.config.edit.cancelled'));
    return;
  }

  if (edited.action === 'reset-default') {
    await ctx.context.saveConfig({ ...Defaults.Config });
    applyStyleFromConfig(Defaults.Config);
    success(t('command.config.edit.reset_default.saved'));

    await ctx.auditLogger.log(
      'INFO',
      { main: 'config', sub: 'reset-default', source: 'u' },
      t('command.config.edit.audit.reset_default'),
    );

    await maybeAutoUpdateCheck(ctx);
    return;
  }

  if (isEditableConfigEqual(initialValues, edited.values)) {
    info(t('command.config.edit.no_changes'));
    return;
  }

  const updated = {
    ...current,
    ...edited.values,
  };

  await ctx.context.saveConfig(updated);
  applyStyleFromConfig(updated);
  success(t('command.config.edit.saved'));

  await ctx.auditLogger.log(
    'INFO',
    { main: 'config', sub: 'edit', source: 'u' },
    t('command.config.edit.audit.saved'),
  );

  await maybeAutoUpdateCheck(ctx);
}

export function registerConfigCommands(program: Command, ctx: CommandContext): void {
  program
    .command('config')
    .description(t('command.config.description'))
    .action(() =>
      runAction(async () => {
        await openConfigEditor(ctx);
      }),
    );
}
