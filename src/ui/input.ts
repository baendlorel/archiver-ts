import chalk from 'chalk';

export interface InputState {
  value: string;
  cursor: number;
}

export interface InputKeypress {
  ctrl?: boolean;
  name?: string;
}

export interface InputUpdate {
  state: InputState;
  action: 'continue' | 'submit' | 'cancel';
}

function clampCursor(cursor: number, value: string): number {
  if (cursor < 0) {
    return 0;
  }
  if (cursor > value.length) {
    return value.length;
  }
  return cursor;
}

function replaceWithCursor(value: string, cursor: number): InputState {
  return { value, cursor: clampCursor(cursor, value) };
}

function isPrintableInput(value: string): boolean {
  if (!value) {
    return false;
  }
  for (const char of value) {
    const code = char.charCodeAt(0);
    if ((code >= 0 && code <= 31) || code === 127) {
      return false;
    }
  }
  return true;
}

export function createInputState(initialValue: string = ''): InputState {
  return { value: initialValue, cursor: initialValue.length };
}

export function moveInputCursor(state: InputState, direction: 'left' | 'right'): InputState {
  if (direction === 'left') {
    return replaceWithCursor(state.value, state.cursor - 1);
  }
  return replaceWithCursor(state.value, state.cursor + 1);
}

export function applyInputKeypress(state: InputState, value: string, key: InputKeypress): InputUpdate {
  if (key.ctrl && key.name === 'c') {
    return { state, action: 'cancel' };
  }

  if (key.name === 'escape') {
    return { state, action: 'cancel' };
  }

  if (key.name === 'return' || key.name === 'enter') {
    return { state, action: 'submit' };
  }

  if (key.name === 'left') {
    return { state: moveInputCursor(state, 'left'), action: 'continue' };
  }

  if (key.name === 'right') {
    return { state: moveInputCursor(state, 'right'), action: 'continue' };
  }

  if (key.name === 'home') {
    return { state: replaceWithCursor(state.value, 0), action: 'continue' };
  }

  if (key.name === 'end') {
    return { state: replaceWithCursor(state.value, state.value.length), action: 'continue' };
  }

  if (key.name === 'backspace') {
    if (state.cursor === 0) {
      return { state, action: 'continue' };
    }
    const nextValue = `${state.value.slice(0, state.cursor - 1)}${state.value.slice(state.cursor)}`;
    return { state: replaceWithCursor(nextValue, state.cursor - 1), action: 'continue' };
  }

  if (key.name === 'delete') {
    if (state.cursor >= state.value.length) {
      return { state, action: 'continue' };
    }
    const nextValue = `${state.value.slice(0, state.cursor)}${state.value.slice(state.cursor + 1)}`;
    return { state: replaceWithCursor(nextValue, state.cursor), action: 'continue' };
  }

  if (!isPrintableInput(value)) {
    return { state, action: 'continue' };
  }

  const nextValue = `${state.value.slice(0, state.cursor)}${value}${state.value.slice(state.cursor)}`;
  return { state: replaceWithCursor(nextValue, state.cursor + value.length), action: 'continue' };
}

export function renderInput(state: InputState, active: boolean = true, placeholder: string = ''): string {
  if (!active) {
    const staticValue = state.value || placeholder;
    return chalk.dim(`[${staticValue}]`);
  }

  if (!state.value) {
    if (placeholder) {
      return `[${chalk.dim(placeholder)}]`;
    }
    return `[${chalk.inverse(' ')}]`;
  }

  const cursor = clampCursor(state.cursor, state.value);
  if (cursor >= state.value.length) {
    return `[${state.value}${chalk.inverse(' ')}]`;
  }

  const before = state.value.slice(0, cursor);
  const current = state.value.slice(cursor, cursor + 1);
  const after = state.value.slice(cursor + 1);
  return `[${before}${chalk.inverse(current)}${after}]`;
}
