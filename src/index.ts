import type { CommandContext } from './services/context.js';
import type { ArchiverConfig } from './global.js';

import { Defaults, Paths } from './consts/index.js';
import { createProgram } from './commands/index.js';
import { ensureArvShellWrapper } from './core/initialize.js';
import { createCommandContext } from './services/context.js';
import { readJsonc } from './utils/jsonc.js';
import { setLanguage, t } from './i18n/index.js';
import { canUseInteractiveTerminal } from './ui/interactive.js';
import { promptSelect, renderKeyHint } from './ui/select.js';
import { applyStyleFromConfig } from './utils/style.js';
import { error, info, success } from './utils/terminal.js';

type NoCommandAction = Exclude<ArchiverConfig['noCommandAction'], 'unknown'>;

async function promptNoCommandAction(ctx: CommandContext): Promise<NoCommandAction> {
  if (!canUseInteractiveTerminal()) {
    return 'help';
  }

  info(t('index.no_command_action.unknown'));
  const selected = await promptSelect<NoCommandAction>({
    title: t('index.no_command_action.question'),
    description: t('index.no_command_action.note'),
    options: [
      { value: 'list', label: t('index.no_command_action.option.list') },
      { value: 'help', label: t('index.no_command_action.option.help') },
    ],
    initialValue: 'list',
    allowCancel: false,
    hint: t('index.no_command_action.hint', {
      leftRight: renderKeyHint(t('index.no_command_action.key.left_right')),
      enter: renderKeyHint(t('index.no_command_action.key.enter')),
    }),
  });
  if (!selected) {
    process.exit(130);
  }
  await ctx.configService.setNoCommandAction(selected);
  success(t('index.no_command_action.updated', { action: selected }));
  return selected;
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
