import readline from 'node:readline';
import chalk from 'chalk';
import { ArchiveStatus } from '../consts/index.js';
import { t } from '../i18n/index.js';
import { canUseInteractiveTerminal } from '../ui/interactive.js';
import { layoutFullscreenLines } from '../ui/screen.js';
import { createSelectState, getSelectedOption, moveSelect, renderKeyHint, renderSelect } from '../ui/select.js';

export type ListAction = 'enter' | 'restore';

export interface InteractiveListEntry {
  id: number;
  status: ArchiveStatus;
  title: string;
  path: string;
}

export interface InteractiveListSelection {
  entry: InteractiveListEntry;
  action: ListAction;
}

interface Keypress {
  ctrl?: boolean;
  name?: string;
}

function getActionLabel(action: ListAction): string {
  if (action === 'enter') {
    return t('command.list.interactive.action.enter');
  }
  return t('command.list.interactive.action.restore');
}

export function canRunInteractiveList(): boolean {
  return canUseInteractiveTerminal();
}

export function isActionAvailable(entry: InteractiveListEntry, action: ListAction): boolean {
  if (action === 'enter' || action === 'restore') {
    return entry.status === ArchiveStatus.Archived;
  }
  return false;
}

function createActionState(entry: InteractiveListEntry, action: ListAction) {
  return createSelectState<ListAction>(
    [
      { value: 'enter', label: getActionLabel('enter'), disabled: !isActionAvailable(entry, 'enter') },
      { value: 'restore', label: getActionLabel('restore'), disabled: !isActionAvailable(entry, 'restore') },
    ],
    action,
  );
}

function getResolvedAction(entry: InteractiveListEntry, action: ListAction): ListAction {
  const selected = getSelectedOption(createActionState(entry, action))?.value;
  return selected ?? action;
}

function moveAction(entry: InteractiveListEntry, current: ListAction, direction: 'left' | 'right'): ListAction {
  const state = createActionState(entry, current);
  const moved = moveSelect(state, direction);
  return getSelectedOption(moved)?.value ?? current;
}

function moveEntryIndex(current: number, direction: 'up' | 'down', total: number): number {
  if (total <= 0) {
    return 0;
  }
  if (direction === 'up') {
    return (current - 1 + total) % total;
  }
  return (current + 1) % total;
}

function renderScreen(entries: InteractiveListEntry[], selectedIndex: number, action: ListAction, note: string): void {
  const selectedEntry = entries[selectedIndex];
  if (!selectedEntry) {
    return;
  }

  const rows = process.stdout.rows ?? 24;
  const hint = t('command.list.interactive.hint', {
    upDown: renderKeyHint(t('command.list.interactive.key.up_down')),
    leftRight: renderKeyHint(t('command.list.interactive.key.left_right')),
    enter: renderKeyHint(t('command.list.interactive.key.enter')),
    cancel: renderKeyHint(t('command.list.interactive.key.cancel')),
  });

  const actionState = createActionState(selectedEntry, action);
  const headerLines: string[] = [
    `${t('command.list.interactive.action_prefix')} ${renderSelect(actionState)}`,
    note ? chalk.yellow(note) : '',
    '',
  ];
  const footerLineCount = 2;
  const maxListRows = Math.max(rows - headerLines.length - footerLineCount, 2);
  const maxEntries = Math.max(Math.floor(maxListRows / 2), 1);
  const centerOffset = Math.floor(maxEntries / 2);
  const maxStart = Math.max(entries.length - maxEntries, 0);
  const start = Math.min(Math.max(selectedIndex - centerOffset, 0), maxStart);
  const end = Math.min(start + maxEntries, entries.length);

  const contentLines: string[] = [...headerLines];

  for (let index = start; index < end; index += 1) {
    const entry = entries[index];
    if (!entry) {
      continue;
    }

    const isSelected = index === selectedIndex;
    const pointer = isSelected ? chalk.cyan('>') : ' ';
    const status = entry.status === ArchiveStatus.Archived ? chalk.green('A') : chalk.gray('R');
    const mainLine = `${pointer} [${String(entry.id).padStart(4, ' ')}] ${status} ${entry.title}`;
    const pathLine = `      ${chalk.dim(entry.path)}`;

    if (isSelected) {
      contentLines.push(chalk.bold(mainLine));
      contentLines.push(chalk.cyan(pathLine));
    } else {
      contentLines.push(mainLine);
      contentLines.push(pathLine);
    }
  }

  const footerLines = [
    chalk.dim(
      t('command.list.interactive.showing', {
        start: start + 1,
        end,
        total: entries.length,
      }),
    ),
    hint,
  ];
  const lines = layoutFullscreenLines({ contentLines, footerLines, rows });

  process.stdout.write('\x1B[2J\x1B[H\x1B[?25l');
  process.stdout.write(`${lines.join('\n')}\n`);
}

export async function pickInteractiveListAction(
  entries: InteractiveListEntry[],
): Promise<InteractiveListSelection | null> {
  if (entries.length === 0 || !canRunInteractiveList()) {
    return null;
  }

  const input = process.stdin;
  let selectedIndex = 0;
  let action: ListAction = 'enter';
  let note = '';

  readline.emitKeypressEvents(input);
  input.setRawMode(true);
  input.resume();

  return new Promise<InteractiveListSelection | null>((resolve) => {
    const finalize = (selection: InteractiveListSelection | null): void => {
      input.off('keypress', onKeypress);
      input.setRawMode(false);
      input.pause();
      process.stdout.write('\x1B[2J\x1B[H\x1B[?25h\n');
      resolve(selection);
    };

    const onKeypress = (_value: string, key: Keypress): void => {
      if (key.ctrl && key.name === 'c') {
        finalize(null);
        return;
      }

      if (key.name === 'up') {
        selectedIndex = moveEntryIndex(selectedIndex, 'up', entries.length);
        note = '';
        renderScreen(entries, selectedIndex, action, note);
        return;
      }

      if (key.name === 'down') {
        selectedIndex = moveEntryIndex(selectedIndex, 'down', entries.length);
        note = '';
        renderScreen(entries, selectedIndex, action, note);
        return;
      }

      if (key.name === 'left') {
        const entry = entries[selectedIndex];
        if (!entry) {
          finalize(null);
          return;
        }
        action = moveAction(entry, action, 'left');
        note = '';
        renderScreen(entries, selectedIndex, action, note);
        return;
      }

      if (key.name === 'right') {
        const entry = entries[selectedIndex];
        if (!entry) {
          finalize(null);
          return;
        }
        action = moveAction(entry, action, 'right');
        note = '';
        renderScreen(entries, selectedIndex, action, note);
        return;
      }

      if (key.name === 'return' || key.name === 'enter') {
        const entry = entries[selectedIndex];
        if (!entry) {
          finalize(null);
          return;
        }
        const selectedAction = getResolvedAction(entry, action);

        if (!isActionAvailable(entry, selectedAction)) {
          note = t('command.list.interactive.note.restored_unavailable');
          renderScreen(entries, selectedIndex, action, note);
          return;
        }

        finalize({ entry, action: selectedAction });
        return;
      }

      if (key.name === 'q' || key.name === 'escape') {
        finalize(null);
      }
    };

    input.on('keypress', onKeypress);
    renderScreen(entries, selectedIndex, action, note);
  });
}
