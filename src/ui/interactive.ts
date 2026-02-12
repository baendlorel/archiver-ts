export interface InteractiveTerminalOptions {
  stdinIsTTY?: boolean;
  stdoutIsTTY?: boolean;
  stderrIsTTY?: boolean;
  forceInteractive?: boolean;
  hasRawMode?: boolean;
}

export function canUseInteractiveTerminal(options: InteractiveTerminalOptions = {}): boolean {
  const stdinIsTTY = options.stdinIsTTY ?? Boolean(process.stdin.isTTY);
  const stdoutIsTTY = options.stdoutIsTTY ?? Boolean(process.stdout.isTTY);
  const stderrIsTTY = options.stderrIsTTY ?? Boolean(process.stderr.isTTY);
  const forceInteractive = options.forceInteractive ?? process.env.ARCHIVER_FORCE_INTERACTIVE === '1';
  const hasRawMode = options.hasRawMode ?? typeof process.stdin.setRawMode === 'function';
  return stdinIsTTY && hasRawMode && (stdoutIsTTY || (forceInteractive && stderrIsTTY));
}

export function getInteractiveOutputStream(): NodeJS.WriteStream {
  if (process.stdout.isTTY) {
    return process.stdout;
  }
  if (process.env.ARCHIVER_FORCE_INTERACTIVE === '1' && process.stderr.isTTY) {
    return process.stderr;
  }
  return process.stdout;
}
