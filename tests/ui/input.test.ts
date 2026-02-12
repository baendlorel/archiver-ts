import { describe, expect, it } from 'vitest';
import { applyInputKeypress, createInputState, moveInputCursor } from '../../src/ui/input.js';

describe('ui input', () => {
  it('creates state with cursor at end', () => {
    const state = createInputState('demo');
    expect(state.value).toBe('demo');
    expect(state.cursor).toBe(4);
  });

  it('inserts characters and supports backspace', () => {
    let state = createInputState();
    state = applyInputKeypress(state, 'a', {}).state;
    state = applyInputKeypress(state, 'b', {}).state;
    expect(state.value).toBe('ab');
    expect(state.cursor).toBe(2);

    state = applyInputKeypress(state, '', { name: 'backspace' }).state;
    expect(state.value).toBe('a');
    expect(state.cursor).toBe(1);
  });

  it('supports cursor movement and middle insert', () => {
    let state = createInputState('ac');
    state = moveInputCursor(state, 'left');
    state = applyInputKeypress(state, 'b', {}).state;
    expect(state.value).toBe('abc');
    expect(state.cursor).toBe(2);
  });

  it('supports delete at cursor', () => {
    let state = createInputState('abcd');
    state = moveInputCursor(state, 'left');
    state = moveInputCursor(state, 'left');
    state = applyInputKeypress(state, '', { name: 'delete' }).state;
    expect(state.value).toBe('abd');
    expect(state.cursor).toBe(2);
  });

  it('returns submit and cancel actions', () => {
    const state = createInputState('demo');
    expect(applyInputKeypress(state, '', { name: 'enter' }).action).toBe('submit');
    expect(applyInputKeypress(state, '', { name: 'escape' }).action).toBe('cancel');
    expect(applyInputKeypress(state, '', { name: 'c', ctrl: true }).action).toBe('cancel');
  });
});
