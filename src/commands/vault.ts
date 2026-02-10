import type { Command } from 'commander';
import { Defaults } from '../consts/index.js';
import type { CommandContext } from '../services/context.js';
import { ask, confirm } from '../utils/prompt.js';
import { info, renderTable, styleVaultStatus, success, warn } from '../utils/terminal.js';
import { maybeAutoUpdateCheck, runAction } from './command-utils.js';

export function registerVaultCommands(program: Command, ctx: CommandContext): void {
  const vault = program.command('vault').description('Vault management');

  vault
    .command('use')
    .description('Use a vault as the current vault')
    .argument('<name-or-id>', 'Vault name or id')
    .action((nameOrId: string) =>
      runAction(async () => {
        const target = await ctx.vaultService.useVault(nameOrId);
        success(`Current vault changed to ${target.name}(${target.id}).`);

        await ctx.auditLogger.log(
          'INFO',
          { main: 'vault', sub: 'use', args: [nameOrId], source: 'u' },
          `Switch current vault to ${target.name}(${target.id})`,
          { vid: target.id },
        );

        await maybeAutoUpdateCheck(ctx);
      }),
    );

  vault
    .command('create')
    .description('Create a vault')
    .argument('<name>', 'Vault name')
    .option('-r, --remark <remark>', 'Vault remark')
    .option('-a, --activate', 'Activate after creation')
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
          const actionText = recovered ? 'Recovered' : 'Created';
          success(`${actionText} vault ${result.vault.name}(${result.vault.id}).`);

          if (options.activate) {
            success(`Activated vault ${result.vault.name}(${result.vault.id}).`);
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
            `${actionText} vault ${result.vault.name}(${result.vault.id})`,
            { vid: result.vault.id },
          );
        };

        try {
          await createOrRecover(false);
        } catch (err) {
          const message = (err as Error).message;
          if (message.includes('A removed vault named')) {
            const shouldRecover = await confirm(`A removed vault named ${name} exists. Recover it instead? [y/N] `);
            if (!shouldRecover) {
              warn('Operation cancelled.');
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
    .description('Remove a vault (moves archived entries to default vault @)')
    .argument('<name-or-id>', 'Vault name or id')
    .action((nameOrId: string) =>
      runAction(async () => {
        const stepOne = await confirm(`Remove vault ${nameOrId}? This cannot be undone directly. [y/N] `);
        if (!stepOne) {
          warn('Operation cancelled.');
          return;
        }

        const verifyCode = Math.random().toString(36).slice(2, 8).toUpperCase();
        const typed = await ask(`Type verification code '${verifyCode}' to continue: `);
        if (typed !== verifyCode) {
          warn('Verification code does not match. Operation cancelled.');
          return;
        }

        const result = await ctx.vaultService.removeVault(nameOrId);

        success(`Vault ${result.vault.name}(${result.vault.id}) removed.`);
        if (result.movedArchiveIds.length > 0) {
          info(`Moved ${result.movedArchiveIds.length} archived objects to default vault ${Defaults.Vault.name}.`);
        }

        await ctx.auditLogger.log(
          'WARN',
          {
            main: 'vault',
            sub: 'remove',
            args: [nameOrId],
            source: 'u',
          },
          `Removed vault ${result.vault.name}(${result.vault.id})`,
          { vid: result.vault.id },
        );

        await maybeAutoUpdateCheck(ctx);
      }),
    );

  vault
    .command('recover')
    .description('Recover a removed vault')
    .argument('<name-or-id>', 'Vault name or id')
    .action((nameOrId: string) =>
      runAction(async () => {
        const result = await ctx.vaultService.recoverVault(nameOrId);
        success(`Recovered vault ${result.name}(${result.id}).`);

        await ctx.auditLogger.log(
          'INFO',
          {
            main: 'vault',
            sub: 'recover',
            args: [nameOrId],
            source: 'u',
          },
          `Recovered vault ${result.name}(${result.id})`,
          { vid: result.id },
        );

        await maybeAutoUpdateCheck(ctx);
      }),
    );

  vault
    .command('rename')
    .description('Rename a vault')
    .argument('<old>', 'Current vault name or id')
    .argument('<new>', 'New vault name')
    .action((oldName: string, newName: string) =>
      runAction(async () => {
        const renamed = await ctx.vaultService.renameVault(oldName, newName);
        success(`Renamed vault to ${renamed.name}(${renamed.id}).`);

        await ctx.auditLogger.log(
          'INFO',
          {
            main: 'vault',
            sub: 'rename',
            args: [oldName, newName],
            source: 'u',
          },
          `Renamed vault ${oldName} to ${newName}`,
          { vid: renamed.id },
        );

        await maybeAutoUpdateCheck(ctx);
      }),
    );

  vault
    .command('list')
    .description('List vaults')
    .option('-a, --all', 'Show removed vaults')
    .action((options: { all?: boolean }) =>
      runAction(async () => {
        const config = await ctx.configService.getConfig();
        const vaults = await ctx.vaultService.listVaults(Boolean(options.all));

        const headers = ['ID', 'Name', 'Status', 'Created At', 'Remark', 'Current'];
        const rows = vaults.map((entry) => [
          String(entry.id),
          entry.name,
          styleVaultStatus(entry.status),
          entry.createdAt,
          entry.remark,
          config.currentVaultId === entry.id ? '*' : '',
        ]);

        if (rows.length === 0) {
          info('No vaults found.');
          return;
        }

        console.log(renderTable(headers, rows));
      }),
    );
}
