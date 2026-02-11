import type { Command } from 'commander';
import { Defaults } from '../consts/index.js';
import { t } from '../i18n/index.js';
import type { CommandContext } from '../services/context.js';
import { VaultRemovedExistsError } from '../services/vault.js';
import { ask, confirm } from '../utils/prompt.js';
import { info, success, warn } from '../utils/terminal.js';
import { maybeAutoUpdateCheck, runAction } from './command-utils.js';

export function registerVaultCommands(program: Command, ctx: CommandContext): void {
  const vault = program.command('vault').description(t('command.vault.description'));

  vault
    .command('use')
    .description(t('command.vault.use.description'))
    .argument('<name-or-id>', t('command.vault.use.argument'))
    .action((nameOrId: string) =>
      runAction(async () => {
        const target = await ctx.vaultService.useVault(nameOrId);
        success(
          t('command.vault.use.updated', {
            name: target.name,
            id: target.id,
          }),
        );

        await ctx.auditLogger.log(
          'INFO',
          { main: 'vault', sub: 'use', args: [nameOrId], source: 'u' },
          t('command.vault.use.audit', {
            name: target.name,
            id: target.id,
          }),
          { vid: target.id },
        );

        await maybeAutoUpdateCheck(ctx);
      }),
    );

  vault
    .command('create')
    .description(t('command.vault.create.description'))
    .argument('<name>', t('command.vault.create.argument'))
    .option('-r, --remark <remark>', t('command.vault.create.option.remark'))
    .option('-a, --activate', t('command.vault.create.option.activate'))
    .action((name: string, options: { remark?: string; activate?: boolean }) =>
      runAction(async () => {
        let recovered = false;
        const createOrRecover = async (recoverRemoved: boolean): Promise<void> => {
          const result = await ctx.vaultService.createVault({
            name,
            remark: options.remark,
            activate: options.activate,
            recoverRemoved,
          });

          recovered = result.recovered;
          success(
            t(recovered ? 'command.vault.create.recovered' : 'command.vault.create.created', {
              name: result.vault.name,
              id: result.vault.id,
            }),
          );

          if (options.activate) {
            success(
              t('command.vault.create.activated', {
                name: result.vault.name,
                id: result.vault.id,
              }),
            );
          }

          await ctx.auditLogger.log(
            'INFO',
            {
              main: 'vault',
              sub: recovered ? 'recover' : 'create',
              args: [name],
              opts: {
                activate: Boolean(options.activate),
              },
              source: 'u',
            },
            t(recovered ? 'command.vault.create.recovered' : 'command.vault.create.created', {
              name: result.vault.name,
              id: result.vault.id,
            }),
            { vid: result.vault.id },
          );
        };

        try {
          await createOrRecover(false);
        } catch (err) {
          if (err instanceof VaultRemovedExistsError) {
            const shouldRecover = await confirm(
              t('command.vault.create.confirm_recover', {
                name,
              }),
            );
            if (!shouldRecover) {
              warn(t('command.vault.operation.cancelled'));
              return;
            }
            await createOrRecover(true);
          } else {
            throw err;
          }
        }

        await maybeAutoUpdateCheck(ctx);
      }),
    );

  vault
    .command('remove')
    .description(t('command.vault.remove.description'))
    .argument('<name-or-id>', t('command.vault.remove.argument'))
    .action((nameOrId: string) =>
      runAction(async () => {
        const stepOne = await confirm(
          t('command.vault.remove.confirm', {
            nameOrId,
          }),
        );
        if (!stepOne) {
          warn(t('command.vault.operation.cancelled'));
          return;
        }

        const verifyCode = Math.random().toString(36).slice(2, 8).toUpperCase();
        const typed = await ask(
          t('command.vault.remove.verify_prompt', {
            verifyCode,
          }),
        );
        if (typed !== verifyCode) {
          warn(t('command.vault.remove.verify_mismatch'));
          return;
        }

        const result = await ctx.vaultService.removeVault(nameOrId);

        success(
          t('command.vault.remove.done', {
            name: result.vault.name,
            id: result.vault.id,
          }),
        );
        if (result.movedArchiveIds.length > 0) {
          info(
            t('command.vault.remove.moved_to_default', {
              count: result.movedArchiveIds.length,
              name: Defaults.Vault.name,
            }),
          );
        }

        await ctx.auditLogger.log(
          'WARN',
          {
            main: 'vault',
            sub: 'remove',
            args: [nameOrId],
            source: 'u',
          },
          t('command.vault.remove.done', {
            name: result.vault.name,
            id: result.vault.id,
          }),
          { vid: result.vault.id },
        );

        await maybeAutoUpdateCheck(ctx);
      }),
    );

  vault
    .command('recover')
    .description(t('command.vault.recover.description'))
    .argument('<name-or-id>', t('command.vault.recover.argument'))
    .action((nameOrId: string) =>
      runAction(async () => {
        const result = await ctx.vaultService.recoverVault(nameOrId);
        success(
          t('command.vault.recover.done', {
            name: result.name,
            id: result.id,
          }),
        );

        await ctx.auditLogger.log(
          'INFO',
          {
            main: 'vault',
            sub: 'recover',
            args: [nameOrId],
            source: 'u',
          },
          t('command.vault.recover.done', {
            name: result.name,
            id: result.id,
          }),
          { vid: result.id },
        );

        await maybeAutoUpdateCheck(ctx);
      }),
    );

  vault
    .command('rename')
    .description(t('command.vault.rename.description'))
    .argument('<old>', t('command.vault.rename.argument.old'))
    .argument('<new>', t('command.vault.rename.argument.new'))
    .action((oldName: string, newName: string) =>
      runAction(async () => {
        const renamed = await ctx.vaultService.renameVault(oldName, newName);
        success(
          t('command.vault.rename.done', {
            name: renamed.name,
            id: renamed.id,
          }),
        );

        await ctx.auditLogger.log(
          'INFO',
          {
            main: 'vault',
            sub: 'rename',
            args: [oldName, newName],
            source: 'u',
          },
          t('command.vault.rename.done', {
            name: renamed.name,
            id: renamed.id,
          }),
          { vid: renamed.id },
        );

        await maybeAutoUpdateCheck(ctx);
      }),
    );

  vault
    .command('list')
    .description(t('command.vault.list.description'))
    .option('-a, --all', t('command.vault.list.option.all'))
    .action((options: { all?: boolean }) =>
      runAction(async () => {
        const vaults = await ctx.vaultService.listVaults(Boolean(options.all));

        if (vaults.length === 0) {
          info(t('command.vault.list.empty'));
          return;
        }

        const output = vaults.map((entry) => `${String(entry.id).padStart(3, ' ')}  ${entry.name}`).join('\n');
        console.log(output);
      }),
    );
}
