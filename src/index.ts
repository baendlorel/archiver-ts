import './macros.js';

import type { CommandContext } from './services/context.js';
import type { ArchiverConfig } from './global.js';

import { Defaults, Paths } from './consts/index.js';
import { createProgram } from './commands/index.js';
import { ensureArvShellWrapper } from './core/initialize.js';
import { createCommandContext } from './services/context.js';
import { ask } from './utils/prompt.js';
import { readJsonc } from './utils/jsonc.js';
import { setLanguage, t } from './i18n/index.js';
import { applyStyleFromConfig } from './utils/style.js';
import { error, info, success } from './utils/terminal.js';

type NoCommandAction = Exclude<ArchiverConfig['noCommandAction'], 'unknown'>;

function parseNoCommandActionAnswer(answer: string): NoCommandAction | undefined {
  const normalized = answer.trim().toLowerCase();
  if (
    normalized === '' ||
    normalized === '1' ||
    normalized === 'list' ||
    normalized === '列表' ||
    normalized === t('common.action.list').toLowerCase()
  ) {
    return 'list';
  }
  if (
    normalized === '2' ||
    normalized === 'help' ||
    normalized === '帮助' ||
    normalized === t('common.action.help').toLowerCase()
  ) {
    return 'help';
  }
  return undefined;
}

async function promptNoCommandAction(ctx: CommandContext): Promise<NoCommandAction> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return 'help';
  }

  info(t('index.no_command_action.unknown'));
  console.log(t('index.no_command_action.question'));
  console.log(t('index.no_command_action.option_list'));
  console.log(t('index.no_command_action.option_help'));

  while (true) {
    const selected = parseNoCommandActionAnswer(await ask(t('index.no_command_action.choose')));
    if (!selected) {
      info(t('index.no_command_action.invalid'));
      continue;
    }

    await ctx.configService.setNoCommandAction(selected);
    success(t('index.no_command_action.updated', { action: selected }));
    return selected;
  }
}

async function main(): Promise<void> {
  const rawConfig = await readJsonc<Partial<ArchiverConfig>>(Paths.File.config, Defaults.Config);
  setLanguage(rawConfig.language);
  applyStyleFromConfig({
    style: rawConfig.style === 'off' ? 'off' : 'on',
  });

  const initResult = await ensureArvShellWrapper();
  if (initResult.installed) {
    const where = initResult.profilePath ? ` ${initResult.profilePath}` : '';
    info(t('index.shell_wrapper.installed', { where }));
    if (initResult.reloadCommand) {
      info(
        t('index.shell_wrapper.reload_hint', {
          reloadCommand: initResult.reloadCommand,
        }),
      );
    }
    return;
  }

  const context = await createCommandContext();
  const config = await context.configService.getConfig();
  setLanguage(config.language);
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
