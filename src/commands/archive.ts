import type { Command } from 'commander';
import type { CommandContext } from '../services/context.js';
import { t } from '../i18n/index.js';
import { parseIdList } from '../utils/parse.js';
import { error, success } from '../utils/terminal.js';
import { maybeAutoUpdateCheck, runAction, summarizeBatch } from './command-utils.js';

export function registerArchiveCommands(program: Command, ctx: CommandContext): void {
  program
    .command('put')
    .description(t('command.archive.put.description'))
    .argument('<items...>', t('command.archive.put.argument.items'))
    .option('-v, --vault <vault>', t('command.archive.put.option.vault'))
    .option('-m, --message <message>', t('command.archive.put.option.message'))
    .option('-r, --remark <remark>', t('command.archive.put.option.remark'))
    .action((items: string[], options: { vault?: string; message?: string; remark?: string }) =>
      runAction(async () => {
        const result = await ctx.archiveService.put(items, options);

        for (const item of result.ok) {
          success(
            t('command.archive.result.put.ok', {
              id: item.id,
              input: item.input,
              message: item.message,
            }),
          );
        }
        for (const item of result.failed) {
          error(
            t('command.archive.result.put.failed', {
              id: item.id ?? '-',
              input: item.input,
              message: item.message,
            }),
          );
        }

        summarizeBatch('put', result);

        await maybeAutoUpdateCheck(ctx);
      }),
    );

  program
    .command('restore')
    .description(t('command.archive.restore.description'))
    .argument('<ids...>', t('command.archive.restore.argument.ids'))
    .action((ids: string[]) =>
      runAction(async () => {
        const parsedIds = parseIdList(ids);
        const result = await ctx.archiveService.restore(parsedIds);

        for (const item of result.ok) {
          success(
            t('command.archive.result.restore.ok', {
              id: item.id,
              message: item.message,
            }),
          );
        }
        for (const item of result.failed) {
          error(
            t('command.archive.result.restore.failed', {
              id: item.id ?? '-',
              message: item.message,
            }),
          );
        }

        summarizeBatch('restore', result);

        await maybeAutoUpdateCheck(ctx);
      }),
    );

  program
    .command('move')
    .description(t('command.archive.move.description'))
    .argument('<ids...>', t('command.archive.move.argument.ids'))
    .requiredOption('--to <vault>', t('command.archive.move.option.to'))
    .action((ids: string[], options: { to: string }) =>
      runAction(async () => {
        const parsedIds = parseIdList(ids);
        const result = await ctx.archiveService.move(parsedIds, options.to);

        for (const item of result.ok) {
          success(
            t('command.archive.result.move.ok', {
              id: item.id,
              message: item.message,
            }),
          );
        }
        for (const item of result.failed) {
          error(
            t('command.archive.result.move.failed', {
              id: item.id ?? '-',
              message: item.message,
            }),
          );
        }

        summarizeBatch('move', result);

        await maybeAutoUpdateCheck(ctx);
      }),
    );

}
