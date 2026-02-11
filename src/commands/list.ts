import type { Command } from 'commander';
import { ArchiveStatus, Defaults } from '../consts/index.js';
import type { CommandContext } from '../services/context.js';
import { error, info, styleArchiveStatus, success } from '../utils/terminal.js';
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

function formatListName(entry: DecoratedListEntry, vaultItemSeparator: string): string {
  if (entry.vaultId === Defaults.Vault.id) {
    return entry.item;
  }
  return `${entry.vaultName}${vaultItemSeparator}${entry.item}`;
}

function formatListId(id: number): string {
  return String(id).padStart(4, '0');
}

function formatListLine(entry: DecoratedListEntry, vaultItemSeparator: string): string {
  const statusText = styleArchiveStatus(entry.status === ArchiveStatus.Archived ? 'A' : 'R');
  return `[${formatListId(entry.id)}] ${statusText} ${formatListName(entry, vaultItemSeparator)}`;
}

function renderList(entries: DecoratedListEntry[], vaultItemSeparator: string): string {
  return entries.map((entry) => formatListLine(entry, vaultItemSeparator)).join('\n');
}

function toInteractiveEntries(entries: DecoratedListEntry[], vaultItemSeparator: string): InteractiveListEntry[] {
  return entries.map((entry) => ({
    id: entry.id,
    status: entry.status,
    title: formatListName(entry, vaultItemSeparator),
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
    .option('--no-interactive', 'Disable keyboard picker in TTY and print plain list only')
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
          console.log(renderList(decorated, config.vaultItemSeparator));
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
