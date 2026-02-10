import { createProgram } from './commands/index.js';
import { createCommandContext } from './services/context.js';
import { error } from './utils/terminal.js';

async function main(): Promise<void> {
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
