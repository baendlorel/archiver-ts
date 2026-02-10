import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { info, warn } from '../utils/terminal.js';
import { shellQuote } from './command-utils.js';

interface OpenSubshellAtPathOptions {
  print?: boolean;
}

export async function openSubshellAtPath(
  slotPath: string,
  options: OpenSubshellAtPathOptions = {},
): Promise<void> {
  if (options.print || !process.stdin.isTTY || !process.stdout.isTTY) {
    console.log(slotPath);
    return;
  }

  info(`Opening subshell in ${shellQuote(slotPath)}. Type 'exit' to return.`);

  const shell =
    process.env.SHELL ?? (process.platform === 'win32' ? (process.env.COMSPEC ?? 'cmd.exe') : '/bin/bash');

  const child = spawn(shell, {
    cwd: slotPath,
    stdio: 'inherit',
  });

  const [exitCode, signal] = (await once(child, 'exit')) as [number | null, NodeJS.Signals | null];
  if (signal) {
    warn(`Subshell exited with signal ${signal}.`);
    return;
  }
  if (exitCode !== null && exitCode !== 0) {
    process.exitCode = exitCode;
  }
}
