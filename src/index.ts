import { createProgram } from './commands/index.js';
import { ensureArvShellWrapper } from './core/initialize.js';
import { createCommandContext } from './services/context.js';
import { error, info } from './utils/terminal.js';

async function main(): Promise<void> {
  const initResult = await ensureArvShellWrapper();
  if (initResult.installed) {
    const where = initResult.profilePath ? ` at ${initResult.profilePath}` : '';
    info(`Installed arv shell wrapper${where}.`);
    if (initResult.reloadCommand) {
      info(`Run "${initResult.reloadCommand}" or reopen terminal, then retry your command.`);
    }
    return;
  }

  const context = await createCommandContext();
  const program = createProgram(context);

  await program.parseAsync(process.argv);

  if (process.argv.length <= 2) {
    program.outputHelp();
  }
}

main().catch((e) => {
  error((e as Error).message);
  process.exit(1);
});
