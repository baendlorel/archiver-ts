import type { Command } from 'commander';
import { t } from '../i18n/index.js';
import type { CommandContext } from '../services/context.js';
import { maybeAutoUpdateCheck, runAction } from './command-utils.js';
import { canRunInteractiveDot, runInteractiveDot, type DotArchiveResult } from './dot-interactive.js';

function toFallbackPutFailedMessage(input: string): string {
  return t('command.archive.result.put.failed', {
    id: '-',
    input,
    message: '-',
  });
}

async function archiveFromDot(ctx: CommandContext, fullPath: string, displayName: string): Promise<DotArchiveResult> {
  try {
    const result = await ctx.archiveService.put([fullPath], {});
    const ok = result.ok[0];
    if (ok) {
      return {
        ok: true,
        message: t('command.archive.result.put.ok', {
          id: ok.id ?? '-',
          input: displayName,
          message: ok.message,
        }),
      };
    }

    const failed = result.failed[0];
    if (failed) {
      return {
        ok: false,
        message: t('command.archive.result.put.failed', {
          id: failed.id ?? '-',
          input: displayName,
          message: failed.message,
        }),
      };
    }

    return {
      ok: false,
      message: toFallbackPutFailedMessage(displayName),
    };
  } catch (error) {
    return {
      ok: false,
      message: (error as Error).message,
    };
  }
}

async function openDotInteractive(ctx: CommandContext): Promise<void> {
  if (!canRunInteractiveDot()) {
    throw new Error(t('command.dot.error.no_tty'));
  }

  let archivedCount = 0;

  await runInteractiveDot(async (entry) => {
    const result = await archiveFromDot(ctx, entry.fullPath, entry.name);
    if (result.ok) {
      archivedCount += 1;
    }
    return result;
  });

  if (archivedCount > 0) {
    await maybeAutoUpdateCheck(ctx);
  }
}

export function registerDotCommand(program: Command, ctx: CommandContext): void {
  program
    .command('.')
    .description(t('command.dot.description'))
    .action(() =>
      runAction(async () => {
        await openDotInteractive(ctx);
      }),
    );
}
