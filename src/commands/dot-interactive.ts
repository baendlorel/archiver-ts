import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import chalk from 'chalk';
import { t } from '../i18n/index.js';
import { canUseInteractiveTerminal } from '../ui/interactive.js';
import { layoutFullscreenHintStatusLines } from '../ui/screen.js';
import { renderKeyHint } from '../ui/select.js';

interface Keypress {
  ctrl?: boolean;
  name?: string;
}

export interface DotEntry {
  name: string;
  fullPath: string;
  isDirectory: boolean;
}

export interface DotArchiveResult {
  ok: boolean;
  message: string;
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

function resolveSelectedIndex(entries: DotEntry[], current: number, preferredName?: string): number {
  if (entries.length === 0) {
    return 0;
  }
  if (preferredName) {
    const index = entries.findIndex((entry) => entry.name === preferredName);
    if (index >= 0) {
      return index;
    }
  }
  return Math.min(current, entries.length - 1);
}

function compareEntryNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

export function sortDotEntries(entries: DotEntry[]): DotEntry[] {
  return [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
    return compareEntryNames(a.name, b.name);
  });
}

export async function listCurrentDirectoryEntries(cwd: string): Promise<DotEntry[]> {
  const dirents = await fs.readdir(cwd, { withFileTypes: true });

  const entries = await Promise.all(
    dirents.map(async (dirent): Promise<DotEntry> => {
      const fullPath = path.join(cwd, dirent.name);
      let isDirectory = dirent.isDirectory();
      if (dirent.isSymbolicLink()) {
        try {
          const stats = await fs.stat(fullPath);
          isDirectory = stats.isDirectory();
        } catch {
          isDirectory = false;
        }
      }

      return {
        name: dirent.name,
        fullPath,
        isDirectory,
      };
    }),
  );

  return sortDotEntries(entries);
}

function renderScreen(options: {
  cwd: string;
  entries: DotEntry[];
  selectedIndex: number;
  note: string;
}): void {
  const { cwd, entries, selectedIndex, note } = options;
  const rows = process.stdout.rows ?? 24;
  const contentLines: string[] = [chalk.bold(cwd), ''];
  const bottomBarLineCount = 2;
  const availableRows = Math.max(rows - contentLines.length - bottomBarLineCount, 1);

  if (entries.length === 0) {
    contentLines.push(chalk.dim(t('command.dot.empty')));
  } else {
    const maxEntries = Math.max(availableRows, 1);
    const centerOffset = Math.floor(maxEntries / 2);
    const maxStart = Math.max(entries.length - maxEntries, 0);
    const start = Math.min(Math.max(selectedIndex - centerOffset, 0), maxStart);
    const end = Math.min(start + maxEntries, entries.length);

    for (let index = start; index < end; index += 1) {
      const entry = entries[index];
      if (!entry) {
        continue;
      }
      const isSelected = index === selectedIndex;
      const pointer = isSelected ? chalk.cyan('>') : ' ';
      const marker = entry.isDirectory ? chalk.cyan('[D]') : chalk.dim('[ ]');
      const name = entry.isDirectory ? `${entry.name}/` : entry.name;
      const line = `${pointer} ${marker} ${name}`;
      contentLines.push(isSelected ? chalk.bold(line) : line);
    }
  }

  const hint = t('command.dot.hint', {
    upDown: renderKeyHint(t('command.dot.key.up_down')),
    enter: renderKeyHint(t('command.dot.key.enter')),
    cancel: renderKeyHint(t('command.dot.key.cancel')),
  });
  const statusLine = note ? chalk.yellow(note) : chalk.dim(t('command.dot.summary', { total: entries.length }));
  const lines = layoutFullscreenHintStatusLines({
    contentLines,
    hintLine: hint,
    statusLine,
    rows,
  });

  process.stdout.write('\x1B[2J\x1B[H\x1B[?25l');
  process.stdout.write(lines.join('\n'));
}

export function canRunInteractiveDot(): boolean {
  return canUseInteractiveTerminal();
}

export async function runInteractiveDot(
  onArchive: (entry: DotEntry) => Promise<DotArchiveResult>,
): Promise<void> {
  if (!canRunInteractiveDot()) {
    throw new Error(t('command.dot.error.no_tty'));
  }

  const cwd = process.cwd();
  let entries = await listCurrentDirectoryEntries(cwd);
  let selectedIndex = resolveSelectedIndex(entries, 0);
  let processing = false;
  let note = '';

  const refreshEntries = async (preferredName?: string): Promise<void> => {
    entries = await listCurrentDirectoryEntries(cwd);
    selectedIndex = resolveSelectedIndex(entries, selectedIndex, preferredName);
  };

  const render = (): void => {
    renderScreen({
      cwd,
      entries,
      selectedIndex,
      note,
    });
  };

  const input = process.stdin;
  readline.emitKeypressEvents(input);
  input.setRawMode(true);
  input.resume();

  return new Promise<void>((resolve) => {
    const finalize = (): void => {
      input.off('keypress', onKeypress);
      input.setRawMode(false);
      input.pause();
      process.stdout.write('\x1B[2J\x1B[H\x1B[?25h\n');
      resolve();
    };

    const onKeypress = (_value: string, key: Keypress): void => {
      if (processing) {
        return;
      }

      if (key.ctrl && key.name === 'c') {
        finalize();
        return;
      }
      if (key.name === 'escape' || key.name === 'q') {
        finalize();
        return;
      }

      if (key.name === 'up' || key.name === 'down') {
        selectedIndex = moveEntryIndex(selectedIndex, key.name, entries.length);
        note = '';
        render();
        return;
      }

      if (key.name !== 'return' && key.name !== 'enter') {
        return;
      }

      const entry = entries[selectedIndex];
      if (!entry) {
        note = t('command.dot.empty');
        render();
        return;
      }

      processing = true;
      note = t('command.dot.archiving', { name: entry.name });
      render();

      void (async () => {
        try {
          const result = await onArchive(entry);
          note = result.message;
        } catch (error) {
          note = (error as Error).message;
        } finally {
          processing = false;
          await refreshEntries(entry.name);
          render();
        }
      })();
    };

    input.on('keypress', onKeypress);
    render();
  });
}
