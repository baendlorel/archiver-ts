import { Defaults, Paths } from './consts/index.js';
import { createProgram } from './commands/index.js';
import { ensureArvShellWrapper } from './core/initialize.js';
import type { CommandContext } from './services/context.js';
import { createCommandContext } from './services/context.js';
import { ask } from './utils/prompt.js';
import { readJsonc } from './utils/jsonc.js';
import type { ArchiverConfig } from './global.js';
import { applyStyleFromConfig } from './utils/style.js';
import { error, info, success } from './utils/terminal.js';

type NoCommandAction = Exclude<ArchiverConfig['noCommandAction'], 'unknown'>;

function parseNoCommandActionAnswer(answer: string): NoCommandAction | undefined {
  const normalized = answer.trim().toLowerCase();
  if (normalized === '' || normalized === '1' || normalized === 'list') {
    return 'list';
  }
  if (normalized === '2' || normalized === 'help') {
    return 'help';
  }
  return undefined;
}

async function promptNoCommandAction(ctx: CommandContext): Promise<NoCommandAction> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return 'help';
  }

  info('No-command action is unknown.');
  console.log('When you run `arv` with no subcommand, what should it do?');
  console.log('  1) list');
  console.log('  2) help');

  while (true) {
    const selected = parseNoCommandActionAnswer(await ask('Choose [1/2] (default 1): '));
    if (!selected) {
      info('Please enter 1/list or 2/help.');
      continue;
    }

    await ctx.configService.setNoCommandAction(selected);
    success(`No-command action is now ${selected}.`);
    return selected;
  }
}

async function main(): Promise<void> {
  const rawConfig = await readJsonc<Partial<ArchiverConfig>>(Paths.File.config, Defaults.Config);
  applyStyleFromConfig({
    style: rawConfig.style === 'off' ? 'off' : 'on',
  });

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
  const config = await context.configService.getConfig();
  applyStyleFromConfig(config);
  const program = createProgram(context);

  if (process.argv.length <= 2) {
    const action = config.noCommandAction === 'unknown' ? await promptNoCommandAction(context) : config.noCommandAction;

    if (action === 'list') {
      await program.parseAsync([...process.argv, 'list']);
      return;
    }
    program.outputHelp();
    return;
  }

  await program.parseAsync(process.argv);
}

main().catch((e) => {
  error((e as Error).message);
  process.exit(1);
});
