import readline from 'node:readline';
import chalk from 'chalk';
import { ArchiveStatus } from '../consts/index.js';

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

const LIST_ACTIONS: ListAction[] = ['enter', 'restore'];
const ACTION_LABELS: Record<ListAction, string> = {
  enter: 'Enter slot',
  restore: 'Retrieve',
};
const ACTION_LABEL_WIDTH = Math.max(...Object.values(ACTION_LABELS).map((label) => label.length));

export function canRunInteractiveList(): boolean {
  if (process.stdin.isTTY && process.stdout.isTTY) {
    return true;
  }
  return Boolean(process.stdin.isTTY && process.env.ARV_FORCE_INTERACTIVE === '1');
}

export function isActionAvailable(entry: InteractiveListEntry, action: ListAction): boolean {
  if (action === 'enter' || action === 'restore') {
    return entry.status === ArchiveStatus.Archived;
  }
  return false;
}

function renderActionLabel(action: ListAction, selected: boolean, disabled: boolean): string {
  const label = ACTION_LABELS[action];
  const paddedLabel = label.padEnd(ACTION_LABEL_WIDTH, ' ');
  const marker = disabled ? 'x' : selected ? '>' : ' ';
  const content = `${marker} ${paddedLabel}`;
  if (disabled) {
    return chalk.dim(`[${content}]`);
  }
  if (selected) {
    return chalk.black.bgGreen(`[${content}]`);
  }
  return chalk.green(`[${content}]`);
}

function renderKeyHint(label: string): string {
  return chalk.black.bgWhite(` ${label} `);
}

function moveAction(current: ListAction, direction: 'left' | 'right'): ListAction {
  const currentIndex = LIST_ACTIONS.indexOf(current);
  const offset = direction === 'left' ? -1 : 1;
  const nextIndex = (currentIndex + offset + LIST_ACTIONS.length) % LIST_ACTIONS.length;
  return LIST_ACTIONS[nextIndex] ?? current;
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
  const maxListRows = Math.max(rows - 8, 5);
  const centerOffset = Math.floor(maxListRows / 2);
  const maxStart = Math.max(entries.length - maxListRows, 0);
  const start = Math.min(Math.max(selectedIndex - centerOffset, 0), maxStart);
  const end = Math.min(start + maxListRows, entries.length);

  const lines: string[] = [];
  lines.push(
    `${renderKeyHint('Up/Down')} choose entry  ${renderKeyHint('Left/Right')} choose action  ${renderKeyHint('Enter')} confirm  ${renderKeyHint('q/Esc')} cancel`,
  );
  lines.push(
    `Action: ${renderActionLabel('enter', action === 'enter', !isActionAvailable(selectedEntry, 'enter'))}  ${renderActionLabel('restore', action === 'restore', !isActionAvailable(selectedEntry, 'restore'))}`,
  );
  lines.push(note ? chalk.yellow(note) : chalk.dim(''));
  lines.push('');

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
      lines.push(chalk.bold(mainLine));
      lines.push(chalk.cyan(pathLine));
    } else {
      lines.push(mainLine);
      lines.push(pathLine);
    }
  }

  lines.push('');
  lines.push(chalk.dim(`Showing ${start + 1}-${end} of ${entries.length}`));

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
        action = moveAction(action, 'left');
        note = '';
        renderScreen(entries, selectedIndex, action, note);
        return;
      }

      if (key.name === 'right') {
        action = moveAction(action, 'right');
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

        if (!isActionAvailable(entry, action)) {
          note = 'This entry is restored; enter/restore actions are unavailable.';
          renderScreen(entries, selectedIndex, action, note);
          return;
        }

        finalize({ entry, action });
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
