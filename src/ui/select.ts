import readline from 'node:readline';
import chalk from 'chalk';
import { canUseInteractiveTerminal } from './interactive.js';
import { layoutFullscreenLines } from './screen.js';

interface Keypress {
  ctrl?: boolean;
  name?: string;
}

export type SelectDirection = 'left' | 'right';

export interface SelectOption<T> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SelectState<T> {
  options: ReadonlyArray<SelectOption<T>>;
  selectedIndex: number;
}

export interface SelectPromptOptions<T> {
  title: string;
  description?: string;
  options: ReadonlyArray<SelectOption<T>>;
  initialValue?: T;
  hint?: string;
  allowCancel?: boolean;
}

function findNextEnabledIndex<T>(
  options: ReadonlyArray<SelectOption<T>>,
  start: number,
  direction: SelectDirection,
): number | undefined {
  if (options.length === 0) {
    return undefined;
  }
  const offset = direction === 'left' ? -1 : 1;
  for (let moved = 1; moved <= options.length; moved += 1) {
    const index = (start + offset * moved + options.length) % options.length;
    if (!options[index]?.disabled) {
      return index;
    }
  }
  return undefined;
}

export function createSelectState<T>(options: ReadonlyArray<SelectOption<T>>, initialValue?: T): SelectState<T> {
  if (options.length === 0) {
    return { options, selectedIndex: 0 };
  }

  let selectedIndex = initialValue === undefined ? 0 : options.findIndex((option) => Object.is(option.value, initialValue));
  if (selectedIndex < 0) {
    selectedIndex = 0;
  }

  if (options[selectedIndex]?.disabled) {
    const nextEnabled = findNextEnabledIndex(options, selectedIndex, 'right');
    if (nextEnabled !== undefined) {
      selectedIndex = nextEnabled;
    }
  }

  return { options, selectedIndex };
}

export function moveSelect<T>(state: SelectState<T>, direction: SelectDirection): SelectState<T> {
  const nextIndex = findNextEnabledIndex(state.options, state.selectedIndex, direction);
  if (nextIndex === undefined) {
    return state;
  }
  return { ...state, selectedIndex: nextIndex };
}

export function getSelectedOption<T>(state: SelectState<T>): SelectOption<T> | undefined {
  return state.options[state.selectedIndex];
}

function getMaxLabelWidth<T>(options: ReadonlyArray<SelectOption<T>>): number {
  return Math.max(...options.map((option) => option.label.length), 1);
}

function renderOption<T>(
  option: SelectOption<T>,
  selected: boolean,
  active: boolean,
  labelWidth: number,
): string {
  const marker = option.disabled ? 'x' : selected ? '>' : ' ';
  const content = `${marker} ${option.label.padEnd(labelWidth, ' ')}`;
  if (option.disabled) {
    return chalk.dim(`[${content}]`);
  }
  if (selected && active) {
    return chalk.black.bgGreen(`[${content}]`);
  }
  if (selected) {
    return chalk.green(`[${content}]`);
  }
  if (active) {
    return chalk.green(`[${content}]`);
  }
  return chalk.dim(`[${content}]`);
}

export function renderSelect<T>(state: SelectState<T>, active: boolean = true): string {
  const labelWidth = getMaxLabelWidth(state.options);
  return state.options
    .map((option, index) => renderOption(option, index === state.selectedIndex, active, labelWidth))
    .join('  ');
}

export function renderKeyHint(label: string): string {
  return chalk.black.bgWhite(` ${label} `);
}

export async function promptSelect<T>(options: SelectPromptOptions<T>): Promise<T | null> {
  const initialState = createSelectState(options.options, options.initialValue);
  if (options.options.length === 0) {
    return null;
  }
  if (!canUseInteractiveTerminal()) {
    return getSelectedOption(initialState)?.value ?? null;
  }

  const input = process.stdin;
  let state = initialState;
  const allowCancel = options.allowCancel !== false;

  readline.emitKeypressEvents(input);
  input.setRawMode(true);
  input.resume();

  return new Promise<T | null>((resolve) => {
    const render = (): void => {
      const contentLines: string[] = [options.title];
      if (options.description) {
        contentLines.push(chalk.dim(options.description));
      }
      contentLines.push('', renderSelect(state));
      const footerLines = options.hint ? [options.hint] : [];
      const lines = layoutFullscreenLines({ contentLines, footerLines, rows: process.stdout.rows });
      process.stdout.write('\x1B[2J\x1B[H\x1B[?25l');
      process.stdout.write(`${lines.join('\n')}\n`);
    };

    const finalize = (selectedValue: T | null): void => {
      input.off('keypress', onKeypress);
      input.setRawMode(false);
      input.pause();
      process.stdout.write('\x1B[2J\x1B[H\x1B[?25h\n');
      resolve(selectedValue);
    };

    const onKeypress = (_value: string, key: Keypress): void => {
      if (key.ctrl && key.name === 'c') {
        finalize(null);
        return;
      }
      if (allowCancel && (key.name === 'q' || key.name === 'escape')) {
        finalize(null);
        return;
      }
      if (key.name === 'left') {
        state = moveSelect(state, 'left');
        render();
        return;
      }
      if (key.name === 'right') {
        state = moveSelect(state, 'right');
        render();
        return;
      }
      if (key.name === 'return' || key.name === 'enter') {
        const selected = getSelectedOption(state);
        if (!selected || selected.disabled) {
          return;
        }
        finalize(selected.value);
      }
    };

    input.on('keypress', onKeypress);
    render();
  });
}
