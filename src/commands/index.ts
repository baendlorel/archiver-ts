import { Command } from 'commander';
import { APP_NAME } from '../consts/index.js';
import { t } from '../i18n/index.js';
import type { CommandContext } from '../services/context.js';
import { registerArchiveCommands } from './archive.js';
import { registerCheckCommands } from './check.js';
import { registerConfigCommands } from './config.js';
import { registerListCommands } from './list.js';
import { registerLogCommands } from './log.js';
import { registerUpdateCommands } from './update.js';
import { registerVaultCommands } from './vault.js';

export function createProgram(ctx: CommandContext): Command {
  const program = new Command();

  program.name(APP_NAME).description(t('app.description')).version(ctx.version);

  registerArchiveCommands(program, ctx);
  registerVaultCommands(program, ctx);
  registerListCommands(program, ctx);
  registerLogCommands(program, ctx);
  registerConfigCommands(program, ctx);
  registerUpdateCommands(program, ctx);
  registerCheckCommands(program, ctx);

  return program;
}
