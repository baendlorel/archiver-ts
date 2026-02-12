import readline from 'node:readline';
import chalk from 'chalk';
import { ArchiveStatus } from '../consts/index.js';
import { t } from '../i18n/index.js';
import { applyInputKeypress, createInputState, renderInput, type InputState } from '../ui/input.js';
import { canUseInteractiveTerminal } from '../ui/interactive.js';
import { layoutFullscreenHintStatusLines } from '../ui/screen.js';
import {
  createSelectState,
  getSelectedOption,
  moveSelect,
  renderKeyHint,
  renderSelect,
  type SelectOption,
} from '../ui/select.js';

export type ListAction = 'enter' | 'restore';
type StatusFilter = 'all' | 'archived' | 'restored';
type VaultFilterValue = 'all' | number;
type FocusTarget = 'status' | 'vault' | 'query' | 'entries' | 'action';

const FOCUS_ORDER: FocusTarget[] = ['status', 'vault', 'query', 'entries', 'action'];

export interface InteractiveListEntry {
  id: number;
  status: ArchiveStatus;
  title: string;
  path: string;
  vaultId: number;
  vaultName: string;
}

export interface InteractiveListSelection {
  entry: InteractiveListEntry;
  action: ListAction;
}

interface Keypress {
  ctrl?: boolean;
  shift?: boolean;
  name?: string;
}

function getActionLabel(action: ListAction): string {
  if (action === 'enter') {
    return t('command.list.interactive.action.enter');
  }
  return t('command.list.interactive.action.restore');
}

function getStatusLabel(status: StatusFilter): string {
  if (status === 'archived') {
    return t('command.list.interactive.filter.status.archived');
  }
  if (status === 'restored') {
    return t('command.list.interactive.filter.status.restored');
  }
  return t('command.list.interactive.filter.status.all');
}

function createStatusState(status: StatusFilter) {
  return createSelectState<StatusFilter>(
    [
      { value: 'all', label: getStatusLabel('all') },
      { value: 'archived', label: getStatusLabel('archived') },
      { value: 'restored', label: getStatusLabel('restored') },
    ],
    status,
  );
}

function createVaultOptions(entries: InteractiveListEntry[]): Array<SelectOption<VaultFilterValue>> {
  const options: Array<SelectOption<VaultFilterValue>> = [{ value: 'all', label: t('command.list.interactive.filter.vault.all') }];
  const seen = new Set<number>();

  const sorted = [...entries].sort((a, b) => a.vaultId - b.vaultId);
  for (const entry of sorted) {
    if (seen.has(entry.vaultId)) {
      continue;
    }
    seen.add(entry.vaultId);
    options.push({
      value: entry.vaultId,
      label: entry.vaultName,
    });
  }

  return options;
}

function createVaultState(options: Array<SelectOption<VaultFilterValue>>, selected: VaultFilterValue) {
  return createSelectState<VaultFilterValue>(options, selected);
}

function getVaultLabel(options: Array<SelectOption<VaultFilterValue>>, value: VaultFilterValue): string {
  return options.find((option) => option.value === value)?.label ?? t('command.list.interactive.filter.vault.all');
}

function createActionState(entry: InteractiveListEntry | undefined, action: ListAction) {
  return createSelectState<ListAction>(
    [
      { value: 'enter', label: getActionLabel('enter'), disabled: !isActionAvailable(entry, 'enter') },
      { value: 'restore', label: getActionLabel('restore'), disabled: !isActionAvailable(entry, 'restore') },
    ],
    action,
  );
}

function getResolvedAction(entry: InteractiveListEntry | undefined, action: ListAction): ListAction {
  const selected = getSelectedOption(createActionState(entry, action))?.value;
  return selected ?? action;
}

function moveAction(entry: InteractiveListEntry | undefined, current: ListAction, direction: 'left' | 'right'): ListAction {
  const state = createActionState(entry, current);
  const moved = moveSelect(state, direction);
  return getSelectedOption(moved)?.value ?? current;
}

function moveFocus(current: FocusTarget, direction: 'left' | 'right'): FocusTarget {
  const offset = direction === 'left' ? -1 : 1;
  const index = FOCUS_ORDER.indexOf(current);
  if (index === -1) {
    return FOCUS_ORDER[0] ?? 'entries';
  }
  return FOCUS_ORDER[(index + offset + FOCUS_ORDER.length) % FOCUS_ORDER.length] ?? current;
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

function isQueryMatch(text: string, query: string): boolean {
  if (!query) {
    return true;
  }

  let i = 0;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  for (const char of lowerText) {
    if (char === lowerQuery[i]) {
      i += 1;
      if (i >= lowerQuery.length) {
        return true;
      }
    }
  }
  return false;
}

export function filterInteractiveEntries(
  entries: InteractiveListEntry[],
  status: StatusFilter,
  vault: VaultFilterValue,
  query: string,
): InteractiveListEntry[] {
  const normalizedQuery = query.trim();

  return entries.filter((entry) => {
    if (status === 'archived' && entry.status !== ArchiveStatus.Archived) {
      return false;
    }
    if (status === 'restored' && entry.status !== ArchiveStatus.Restored) {
      return false;
    }
    if (vault !== 'all' && entry.vaultId !== vault) {
      return false;
    }
    return isQueryMatch(entry.title, normalizedQuery);
  });
}

function resolveSelectedIndex(entries: InteractiveListEntry[], current: number, preferredId?: number): number {
  if (entries.length === 0) {
    return 0;
  }
  if (preferredId !== undefined) {
    const index = entries.findIndex((entry) => entry.id === preferredId);
    if (index >= 0) {
      return index;
    }
  }
  return Math.min(current, entries.length - 1);
}

function renderScreen(options: {
  entries: InteractiveListEntry[];
  filteredEntries: InteractiveListEntry[];
  selectedIndex: number;
  statusFilter: StatusFilter;
  vaultFilter: VaultFilterValue;
  vaultOptions: Array<SelectOption<VaultFilterValue>>;
  queryState: InputState;
  focus: FocusTarget;
  action: ListAction;
  note: string;
}): void {
  const {
    entries,
    filteredEntries,
    selectedIndex,
    statusFilter,
    vaultFilter,
    vaultOptions,
    queryState,
    focus,
    action,
    note,
  } = options;

  const selectedEntry = filteredEntries[selectedIndex];
  const rows = process.stdout.rows ?? 24;
  const statusState = createStatusState(statusFilter);
  const vaultState = createVaultState(vaultOptions, vaultFilter);
  const actionState = createActionState(selectedEntry, action);

  const selectLine = (target: FocusTarget, label: string, body: string): string => {
    const active = focus === target;
    const pointer = active ? chalk.cyan('>') : ' ';
    const text = `${label} ${body}`;
    return active ? `${pointer} ${chalk.bold(text)}` : `${pointer} ${text}`;
  };

  const headerLines: string[] = [
    selectLine('status', `${t('command.list.interactive.filter.status.label')}:`, renderSelect(statusState, focus === 'status')),
    selectLine('vault', `${t('command.list.interactive.filter.vault.label')}:`, renderSelect(vaultState, focus === 'vault')),
    selectLine(
      'query',
      `${t('command.list.interactive.filter.query.label')}:`,
      renderInput(queryState, focus === 'query', t('command.list.interactive.filter.query.placeholder')),
    ),
    '',
  ];

  const footerContentLines = 2;
  const bottomBarLineCount = 2;
  const availableRows = Math.max(rows - headerLines.length - footerContentLines - bottomBarLineCount, 2);
  const maxEntries = Math.max(Math.floor(availableRows / 2), 1);
  const centerOffset = Math.floor(maxEntries / 2);
  const maxStart = Math.max(filteredEntries.length - maxEntries, 0);
  const start = Math.min(Math.max(selectedIndex - centerOffset, 0), maxStart);
  const end = Math.min(start + maxEntries, filteredEntries.length);

  const contentLines: string[] = [...headerLines];

  if (filteredEntries.length === 0) {
    contentLines.push(chalk.dim(t('command.list.interactive.empty_filtered')));
  } else {
    for (let index = start; index < end; index += 1) {
      const entry = filteredEntries[index];
      if (!entry) {
        continue;
      }

      const isSelected = index === selectedIndex;
      const pointer = isSelected ? (focus === 'entries' ? chalk.cyan('>') : chalk.green('>')) : ' ';
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
  }

  contentLines.push('');
  contentLines.push(selectLine('action', `${t('command.list.interactive.action_prefix')}:`, renderSelect(actionState, focus === 'action')));

  const hint = t('command.list.interactive.hint', {
    tab: renderKeyHint(t('command.list.interactive.key.tab')),
    upDown: renderKeyHint(t('command.list.interactive.key.up_down')),
    leftRight: renderKeyHint(t('command.list.interactive.key.left_right')),
    type: renderKeyHint(t('command.list.interactive.key.type')),
    enter: renderKeyHint(t('command.list.interactive.key.enter')),
    cancel: renderKeyHint(t('command.list.interactive.key.cancel')),
  });

  const queryText = queryState.value.trim() || t('command.list.interactive.summary.query_empty');
  const summary = t('command.list.interactive.summary', {
    matched: filteredEntries.length,
    total: entries.length,
    status: getStatusLabel(statusFilter),
    vault: getVaultLabel(vaultOptions, vaultFilter),
    query: queryText,
  });
  const statusLine = note
    ? chalk.yellow(note)
    : chalk.dim(summary);
  const lines = layoutFullscreenHintStatusLines({
    contentLines,
    hintLine: hint,
    statusLine,
    rows,
  });

  process.stdout.write('\x1B[2J\x1B[H\x1B[?25l');
  process.stdout.write(lines.join('\n'));
}

export function canRunInteractiveList(): boolean {
  return canUseInteractiveTerminal();
}

export function isActionAvailable(entry: InteractiveListEntry | undefined, action: ListAction): boolean {
  if (!entry) {
    return false;
  }
  if (action === 'enter' || action === 'restore') {
    return entry.status === ArchiveStatus.Archived;
  }
  return false;
}

export async function pickInteractiveListAction(entries: InteractiveListEntry[]): Promise<InteractiveListSelection | null> {
  if (entries.length === 0 || !canRunInteractiveList()) {
    return null;
  }

  const input = process.stdin;
  const vaultOptions = createVaultOptions(entries);
  let statusFilter: StatusFilter = 'all';
  let vaultFilter: VaultFilterValue = 'all';
  let queryState = createInputState('');
  let focus: FocusTarget = 'entries';
  let filteredEntries = filterInteractiveEntries(entries, statusFilter, vaultFilter, queryState.value);
  let selectedIndex = resolveSelectedIndex(filteredEntries, 0);
  let action: ListAction = getResolvedAction(filteredEntries[selectedIndex], 'enter');
  let note = '';

  const refreshFiltered = (): void => {
    const preferredId = filteredEntries[selectedIndex]?.id;
    filteredEntries = filterInteractiveEntries(entries, statusFilter, vaultFilter, queryState.value);
    selectedIndex = resolveSelectedIndex(filteredEntries, selectedIndex, preferredId);
    action = getResolvedAction(filteredEntries[selectedIndex], action);
  };

  const render = (): void => {
    renderScreen({
      entries,
      filteredEntries,
      selectedIndex,
      statusFilter,
      vaultFilter,
      vaultOptions,
      queryState,
      focus,
      action,
      note,
    });
  };

  const confirmCurrentSelection = (finalize: (selection: InteractiveListSelection | null) => void): void => {
    const entry = filteredEntries[selectedIndex];
    if (!entry) {
      note = t('command.list.interactive.empty_filtered');
      render();
      return;
    }

    const selectedAction = getResolvedAction(entry, action);
    if (!isActionAvailable(entry, selectedAction)) {
      note = t('command.list.interactive.note.restored_unavailable');
      render();
      return;
    }

    finalize({ entry, action: selectedAction });
  };

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

    const onKeypress = (value: string, key: Keypress): void => {
      if (key.ctrl && key.name === 'c') {
        finalize(null);
        return;
      }
      if (key.name === 'escape') {
        finalize(null);
        return;
      }
      if (key.name === 'q' && focus !== 'query') {
        finalize(null);
        return;
      }

      if (key.name === 'tab') {
        focus = moveFocus(focus, key.shift ? 'left' : 'right');
        note = '';
        render();
        return;
      }

      if (key.name === 'return' || key.name === 'enter') {
        confirmCurrentSelection(finalize);
        return;
      }

      if (focus === 'entries' && (key.name === 'up' || key.name === 'down')) {
        selectedIndex = moveEntryIndex(selectedIndex, key.name, filteredEntries.length);
        note = '';
        render();
        return;
      }

      if (focus === 'status' && (key.name === 'left' || key.name === 'right')) {
        const moved = moveSelect(createStatusState(statusFilter), key.name);
        statusFilter = getSelectedOption(moved)?.value ?? statusFilter;
        refreshFiltered();
        note = '';
        render();
        return;
      }

      if (focus === 'vault' && (key.name === 'left' || key.name === 'right')) {
        const moved = moveSelect(createVaultState(vaultOptions, vaultFilter), key.name);
        vaultFilter = getSelectedOption(moved)?.value ?? vaultFilter;
        refreshFiltered();
        note = '';
        render();
        return;
      }

      if ((focus === 'action' || focus === 'entries') && (key.name === 'left' || key.name === 'right')) {
        action = moveAction(filteredEntries[selectedIndex], action, key.name);
        note = '';
        render();
        return;
      }

      if (focus === 'query') {
        const update = applyInputKeypress(queryState, value, key);
        queryState = update.state;
        if (update.action === 'cancel') {
          finalize(null);
          return;
        }
        refreshFiltered();
        note = '';
        render();
        return;
      }

      // Quick typing: jump to query field and append input.
      if (value) {
        const quickUpdate = applyInputKeypress(queryState, value, {});
        if (quickUpdate.state.value !== queryState.value || quickUpdate.state.cursor !== queryState.cursor) {
          focus = 'query';
          queryState = quickUpdate.state;
          refreshFiltered();
          note = '';
          render();
        }
      }
    };

    input.on('keypress', onKeypress);
    render();
  });
}
