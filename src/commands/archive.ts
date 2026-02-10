import { spawn } from 'node:child_process';
import { once } from 'node:events';
import type { Command } from 'commander';
import type { CommandContext } from '../services/context.js';
import { parseIdList } from '../utils/parse.js';
import { error, info, success, warn } from '../utils/terminal.js';
import { maybeAutoUpdateCheck, runAction, shellQuote, summarizeBatch } from './command-utils.js';

export function registerArchiveCommands(program: Command, ctx: CommandContext): void {
  program
    .command('put')
    .description('Archive one or many files/directories')
    .argument('<items...>', 'Items to archive')
    .option('-v, --vault <vault>', 'Target vault name or id')
    .option('-m, --message <message>', 'Archive message')
    .option('-r, --remark <remark>', 'Archive remark')
    .action((items: string[], options: { vault?: string; message?: string; remark?: string }) =>
      runAction(async () => {
        const result = await ctx.archiveService.put(items, options);

        for (const item of result.ok) {
          success(`[${item.id}] ${item.input} -> ${item.message}`);
        }
        for (const item of result.failed) {
          error(`[${item.id ?? '-'}] ${item.input}: ${item.message}`);
        }

        summarizeBatch('put', result);

        await maybeAutoUpdateCheck(ctx);
      }),
    );

  program
    .command('restore')
    .description('Restore archived entries by id')
    .argument('<ids...>', 'Archive ids')
    .action((ids: string[]) =>
      runAction(async () => {
        const parsedIds = parseIdList(ids);
        const result = await ctx.archiveService.restore(parsedIds);

        for (const item of result.ok) {
          success(`[${item.id}] restored: ${item.message}`);
        }
        for (const item of result.failed) {
          error(`[${item.id ?? '-'}] restore failed: ${item.message}`);
        }

        summarizeBatch('restore', result);

        await maybeAutoUpdateCheck(ctx);
      }),
    );

  program
    .command('move')
    .description('Move archived entries to another vault')
    .argument('<ids...>', 'Archive ids')
    .requiredOption('--to <vault>', 'Destination vault name or id')
    .action((ids: string[], options: { to: string }) =>
      runAction(async () => {
        const parsedIds = parseIdList(ids);
        const result = await ctx.archiveService.move(parsedIds, options.to);

        for (const item of result.ok) {
          success(`[${item.id}] moved: ${item.message}`);
        }
        for (const item of result.failed) {
          error(`[${item.id ?? '-'}] move failed: ${item.message}`);
        }

        summarizeBatch('move', result);

        await maybeAutoUpdateCheck(ctx);
      }),
    );

  program
    .command('cd')
    .description('Enter archived slot folder by <archive-id> or <vault>/<archive-id>')
    .argument('<target>', 'Archive id, or vault/id')
    .option('-p, --print', 'Print slot path only')
    .action((target: string, options: { print?: boolean }) =>
      runAction(async () => {
        const resolved = await ctx.archiveService.resolveCdTarget(target);

        await ctx.auditLogger.log(
          'INFO',
          {
            main: 'cd',
            args: [target],
            source: 'u',
          },
          `Open archive slot ${resolved.vault.id}/${resolved.archiveId}`,
          { aid: resolved.archiveId, vid: resolved.vault.id },
        );

        if (options.print || !process.stdin.isTTY || !process.stdout.isTTY) {
          console.log(resolved.slotPath);
          return;
        }

        info(`Opening subshell in ${shellQuote(resolved.slotPath)}. Type 'exit' to return.`);

        const shell =
          process.env.SHELL ?? (process.platform === 'win32' ? (process.env.COMSPEC ?? 'cmd.exe') : '/bin/bash');

        const child = spawn(shell, {
          cwd: resolved.slotPath,
          stdio: 'inherit',
        });

        const [exitCode, signal] = (await once(child, 'exit')) as [number | null, NodeJS.Signals | null];
        if (signal) {
          warn(`Subshell exited with signal ${signal}.`);
          return;
        }
        if (exitCode !== null && exitCode !== 0) {
          process.exitCode = exitCode;
        }
      }),
    );
}
