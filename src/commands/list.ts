import type { Command } from 'commander';
import { ArchiveStatus } from '../consts/index.js';
import type { CommandContext } from '../services/context.js';
import { error, styleArchiveStatus, info, renderTable, success } from '../utils/terminal.js';
import { emitCdTarget } from './cd-shell.js';
import { maybeAutoUpdateCheck, runAction, summarizeBatch } from './command-utils.js';
import {
  canRunInteractiveList,
  pickInteractiveListAction,
  type InteractiveListEntry,
  type InteractiveListSelection,
} from './list-interactive.js';

interface ListCommandOptions {
  restored?: boolean;
  all?: boolean;
  vault?: string;
  interactive?: boolean;
}

type DecoratedListEntry = Awaited<ReturnType<CommandContext['archiveService']['decorateEntries']>>[number];

function renderListTable(entries: DecoratedListEntry[], vaultItemSeparator: string): string {
  const headers = ['ID', 'ST', `Vault${vaultItemSeparator}Item`, 'Path', 'Archived At', 'Message', 'Remark'];

  const rows = entries.map((entry) => {
    return [
      String(entry.id),
      styleArchiveStatus(entry.status),
      `${entry.vaultName}${vaultItemSeparator}${entry.item}`,
      entry.displayPath,
      entry.archivedAt,
      entry.message,
      entry.remark,
    ];
  });

  return renderTable(headers, rows);
}

function toInteractiveEntries(entries: DecoratedListEntry[], vaultItemSeparator: string): InteractiveListEntry[] {
  return entries.map((entry) => ({
    id: entry.id,
    status: entry.status,
    title: `${entry.vaultName}${vaultItemSeparator}${entry.item}`,
    path: entry.displayPath,
  }));
}

async function runSelectionAction(ctx: CommandContext, selection: InteractiveListSelection): Promise<void> {
  const archiveId = selection.entry.id;

  if (selection.action === 'restore') {
    const result = await ctx.archiveService.restore([archiveId]);

    for (const item of result.ok) {
      success(`[${item.id}] restored: ${item.message}`);
    }
    for (const item of result.failed) {
      error(`[${item.id ?? '-'}] restore failed: ${item.message}`);
    }

    summarizeBatch('restore', result);
    await maybeAutoUpdateCheck(ctx);
    return;
  }

  const resolved = await ctx.archiveService.resolveCdTarget(String(archiveId));
  await ctx.auditLogger.log(
    'INFO',
    {
      main: 'list',
      sub: 'enter',
      args: [String(archiveId)],
      source: 'u',
    },
    `Open archive slot ${resolved.vault.id}/${resolved.archiveId} from list`,
    { aid: resolved.archiveId, vid: resolved.vault.id },
  );

  await emitCdTarget(resolved.slotPath);
}

export function registerListCommands(program: Command, ctx: CommandContext): void {
  program
    .command('list')
    .alias('l')
    .alias('ls')
    .description('List archived entries')
    .option('--restored', 'Show only restored entries')
    .option('--all', 'Show all entries')
    .option('--vault <vault>', 'Filter by vault name or id')
    .option('--no-interactive', 'Disable keyboard picker in TTY and print plain table only')
    .action((options: ListCommandOptions) =>
      runAction(async () => {
        const entries = await ctx.archiveService.listEntries(options);
        const decorated = await ctx.archiveService.decorateEntries(entries);
        const config = await ctx.configService.getConfig();

        if (decorated.length === 0) {
          info('No entries matched.');
          return;
        }

        const shouldUseInteractive = options.interactive !== false && canRunInteractiveList();
        const hasArchivedEntry = decorated.some((entry) => entry.status === ArchiveStatus.Archived);

        if (!shouldUseInteractive || !hasArchivedEntry) {
          console.log(renderListTable(decorated, config.vaultItemSeparator));
          if (shouldUseInteractive && !hasArchivedEntry) {
            info('All visible entries are restored; interactive actions are unavailable.');
          }
          return;
        }

        const selection = await pickInteractiveListAction(toInteractiveEntries(decorated, config.vaultItemSeparator));
        if (!selection) {
          info('Cancelled.');
          return;
        }

        await runSelectionAction(ctx, selection);
      }),
    );
}
