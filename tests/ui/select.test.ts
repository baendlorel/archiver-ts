import { describe, expect, it } from 'vitest';
import { createSelectState, getSelectedOption, moveSelect, type SelectOption } from '../../src/ui/select.js';

describe('ui select', () => {
  it('uses initial value when available', () => {
    const options: SelectOption<string>[] = [
      { value: 'list', label: 'list' },
      { value: 'help', label: 'help' },
    ];
    const state = createSelectState(options, 'help');
    expect(getSelectedOption(state)?.value).toBe('help');
  });

  it('moves with wrap-around', () => {
    const options: SelectOption<string>[] = [
      { value: 'list', label: 'list' },
      { value: 'help', label: 'help' },
    ];
    const state = createSelectState(options, 'list');
    const movedLeft = moveSelect(state, 'left');
    expect(getSelectedOption(movedLeft)?.value).toBe('help');
    const movedRight = moveSelect(movedLeft, 'right');
    expect(getSelectedOption(movedRight)?.value).toBe('list');
  });

  it('skips disabled options while moving', () => {
    const options: SelectOption<string>[] = [
      { value: 'list', label: 'list' },
      { value: 'help', label: 'help', disabled: true },
      { value: 'none', label: 'none' },
    ];
    const state = createSelectState(options, 'list');
    const moved = moveSelect(state, 'right');
    expect(getSelectedOption(moved)?.value).toBe('none');
  });

  it('keeps selection when all options are disabled', () => {
    const options: SelectOption<string>[] = [
      { value: 'list', label: 'list', disabled: true },
      { value: 'help', label: 'help', disabled: true },
    ];
    const state = createSelectState(options, 'list');
    const moved = moveSelect(state, 'right');
    expect(moved.selectedIndex).toBe(state.selectedIndex);
  });
});
