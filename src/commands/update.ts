import type { Command } from 'commander';
import { Update } from '../consts/index.js';
import type { CommandContext } from '../services/context.js';
import { confirm } from '../utils/prompt.js';
import { info, success, warn } from '../utils/terminal.js';
import { runAction } from './command-utils.js';

export function registerUpdateCommands(program: Command, ctx: CommandContext): void {
  program
    .command('update')
    .alias('u')
    .alias('upd')
    .description('Check for updates from GitHub releases')
    .option('--repo <owner/repo>', `GitHub repository (default: ${Update.Repo})`)
    .option('--install', 'Install by running release install script asset')
    .action((options: { repo?: string; install?: boolean }) =>
      runAction(async () => {
        const repo = options.repo ?? Update.Repo;
        const update = await ctx.updateService.checkLatest(repo);

        info(`Current version: ${update.currentVersion}`);
        info(`Latest version : ${update.latestVersion}`);

        if (!update.hasUpdate) {
          success('You are already on the latest version.');
        } else {
          warn('A new version is available.');
          if (update.htmlUrl) {
            info(`Release page: ${update.htmlUrl}`);
          }
          if (update.publishedAt) {
            info(`Published at: ${update.publishedAt}`);
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
          `Checked updates from ${repo}: latest=${update.latestVersion}, hasUpdate=${update.hasUpdate}`,
        );

        if (options.install) {
          if (!update.hasUpdate) {
            info('Skip install because current version is latest.');
            return;
          }

          const shouldInstall = await confirm('Run release install script now? [y/N] ');
          if (!shouldInstall) {
            warn('Installation cancelled.');
            return;
          }

          const output = await ctx.updateService.installLatest(repo);
          success('Install script executed.');
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
            `Executed install script from latest release (${repo})`,
          );
        }
      }),
    );
}
