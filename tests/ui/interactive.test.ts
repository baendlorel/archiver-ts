import { describe, expect, it } from 'vitest';
import { canUseInteractiveTerminal } from '../../src/ui/interactive.js';

describe('ui interactive', () => {
  it('returns true when stdin/stdout are TTY and raw mode is available', () => {
    expect(
      canUseInteractiveTerminal({
        stdinIsTTY: true,
        stdoutIsTTY: true,
        hasRawMode: true,
        forceInteractive: false,
      }),
    ).toBe(true);
  });

  it('returns true when force interactive is on and stderr is TTY', () => {
    expect(
      canUseInteractiveTerminal({
        stdinIsTTY: true,
        stdoutIsTTY: false,
        stderrIsTTY: true,
        hasRawMode: true,
        forceInteractive: true,
      }),
    ).toBe(true);
  });

  it('returns false when stdin is not TTY', () => {
    expect(
      canUseInteractiveTerminal({
        stdinIsTTY: false,
        stdoutIsTTY: true,
        hasRawMode: true,
        forceInteractive: true,
      }),
    ).toBe(false);
  });

  it('returns false when raw mode is unavailable', () => {
    expect(
      canUseInteractiveTerminal({
        stdinIsTTY: true,
        stdoutIsTTY: true,
        hasRawMode: false,
        forceInteractive: true,
      }),
    ).toBe(false);
  });

  it('returns false when force interactive is on but both outputs are not TTY', () => {
    expect(
      canUseInteractiveTerminal({
        stdinIsTTY: true,
        stdoutIsTTY: false,
        stderrIsTTY: false,
        hasRawMode: true,
        forceInteractive: true,
      }),
    ).toBe(false);
  });
});
