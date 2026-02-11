import type { Command } from 'commander';
import { Update } from '../consts/index.js';
import { t } from '../i18n/index.js';
import type { CommandContext } from '../services/context.js';
import { confirm } from '../utils/prompt.js';
import { info, success, warn } from '../utils/terminal.js';
import { runAction } from './command-utils.js';

export function registerUpdateCommands(program: Command, ctx: CommandContext): void {
  program
    .command('update')
    .alias('u')
    .alias('upd')
    .description(t('command.update.description'))
    .option(
      '--repo <owner/repo>',
      t('command.update.option.repo', {
        repo: Update.Repo,
      }),
    )
    .option('--install', t('command.update.option.install'))
    .action((options: { repo?: string; install?: boolean }) =>
      runAction(async () => {
        const repo = options.repo ?? Update.Repo;
        const update = await ctx.updateService.checkLatest(repo);

        info(
          t('command.update.current_version', {
            version: update.currentVersion,
          }),
        );
        info(
          t('command.update.latest_version', {
            version: update.latestVersion,
          }),
        );

        if (!update.hasUpdate) {
          success(t('command.update.already_latest'));
        } else {
          warn(t('command.update.new_available'));
          if (update.htmlUrl) {
            info(
              t('command.update.release_page', {
                url: update.htmlUrl,
              }),
            );
          }
          if (update.publishedAt) {
            info(
              t('command.update.published_at', {
                publishedAt: update.publishedAt,
              }),
            );
          }
        }

        await ctx.auditLogger.log(
          'INFO',
          {
            main: 'update',
            args: [],
            opts: { repo },
            source: 'u',
          },
          t('command.update.audit.checked', {
            repo,
            latestVersion: update.latestVersion,
            hasUpdate: update.hasUpdate,
          }),
        );

        if (options.install) {
          if (!update.hasUpdate) {
            info(t('command.update.skip_install'));
            return;
          }

          const shouldInstall = await confirm(t('command.update.confirm_install'));
          if (!shouldInstall) {
            warn(t('command.update.cancelled'));
            return;
          }

          const output = await ctx.updateService.installLatest(repo);
          success(t('command.update.install_executed'));
          if (output) {
            console.log(output);
          }

          await ctx.auditLogger.log(
            'INFO',
            {
              main: 'update',
              sub: 'install',
              opts: { repo },
              source: 'u',
            },
            t('command.update.audit.installed', { repo }),
          );
        }
      }),
    );
}
