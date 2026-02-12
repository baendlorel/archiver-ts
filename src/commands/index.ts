import { Command } from 'commander';
import { APP_NAME } from '../consts/index.js';
import { t } from '../i18n/index.js';
import type { CommandContext } from '../services/context.js';
import { registerArchiveCommands } from './archive.js';
import { registerConfigCommands } from './config.js';
import { registerDotCommand } from './dot.js';
import { registerListCommands } from './list.js';
import { registerLogCommands } from './log.js';
import { registerVaultCommands } from './vault.js';

export function createProgram(ctx: CommandContext): Command {
  const program = new Command();

  program.name(APP_NAME).description(t('app.description')).version(ctx.version);

  registerArchiveCommands(program, ctx);
  registerVaultCommands(program, ctx);
  registerListCommands(program, ctx);
  registerDotCommand(program, ctx);
  registerLogCommands(program, ctx);
  registerConfigCommands(program, ctx);

  return program;
}
