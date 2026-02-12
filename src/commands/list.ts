import type { Command } from 'commander';
import { ArchiveStatus, Defaults } from '../consts/index.js';
import { t } from '../i18n/index.js';
import type { CommandContext } from '../services/context.js';
import { error, info, styleArchiveStatus, success } from '../utils/terminal.js';
import { emitCdTarget } from './cd-shell.js';
import { maybeAutoUpdateCheck, runAction, summarizeBatch } from './command-utils.js';
import {
  canRunInteractiveList,
  pickInteractiveListAction,
  type InteractiveListEntry,
} from './list-interactive.js';

interface ListCommandOptions {
  plain?: boolean;
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

function toStatusCode(entry: DecoratedListEntry): 'A' | 'R' {
  return entry.status === ArchiveStatus.Archived ? 'A' : 'R';
}

function formatListLine(entry: DecoratedListEntry, vaultItemSeparator: string): string {
  const statusText = styleArchiveStatus(toStatusCode(entry));
  return `[${formatListId(entry.id)}] ${statusText} ${formatListName(entry, vaultItemSeparator)}`;
}

function renderList(entries: DecoratedListEntry[], vaultItemSeparator: string): string {
  return entries.map((entry) => formatListLine(entry, vaultItemSeparator)).join('\n');
}

function renderPlainList(entries: DecoratedListEntry[], vaultItemSeparator: string): string {
  return entries
    .map((entry) => `${entry.id}\t${toStatusCode(entry)}\t${formatListName(entry, vaultItemSeparator)}`)
    .join('\n');
}

function toInteractiveEntries(entries: DecoratedListEntry[], vaultItemSeparator: string): InteractiveListEntry[] {
  return entries.map((entry) => ({
    id: entry.id,
    status: entry.status,
    title: formatListName(entry, vaultItemSeparator),
    path: entry.displayPath,
    vaultId: entry.vaultId,
    vaultName: entry.vaultName,
  }));
}

async function runSelectionAction(
  ctx: CommandContext,
  selection: { entry: InteractiveListEntry; action: 'enter' | 'restore' },
): Promise<void> {
  const archiveId = selection.entry.id;

  if (selection.action === 'restore') {
    const result = await ctx.archiveService.restore([archiveId]);

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
    t('command.list.audit.open_slot', {
      vaultId: resolved.vault.id,
      archiveId: resolved.archiveId,
    }),
    { aid: resolved.archiveId, vid: resolved.vault.id },
  );

  await emitCdTarget(resolved.slotPath);
}

export function registerListCommands(program: Command, ctx: CommandContext): void {
  program
    .command('list')
    .description(t('command.list.description'))
    .option('-p, --plain', t('command.list.option.plain'))
    .action((options: ListCommandOptions) =>
      runAction(async () => {
        const entries = await ctx.archiveService.listEntries({ all: true });
        const decorated = await ctx.archiveService.decorateEntries(entries);
        const config = await ctx.configService.getConfig();

        if (decorated.length === 0) {
          if (options.plain) {
            return;
          }
          info(t('command.list.empty'));
          return;
        }

        if (options.plain) {
          console.log(renderPlainList(decorated, config.vaultItemSeparator));
          return;
        }

        if (!canRunInteractiveList()) {
          console.log(renderList(decorated, config.vaultItemSeparator));
          return;
        }

        const selection = await pickInteractiveListAction(toInteractiveEntries(decorated, config.vaultItemSeparator));
        if (!selection) {
          info(t('command.list.cancelled'));
          return;
        }
        await runSelectionAction(ctx, selection);
      }),
    );
}
