import type { Command } from 'commander';
import { CheckIssueLevel } from '../consts/enums.js';
import { t } from '../i18n/index.js';
import type { CommandContext } from '../services/context.js';
import { info, renderTable, success } from '../utils/terminal.js';
import { runAction } from './command-utils.js';

function renderIssueLevel(level: CheckIssueLevel): string {
  if (level === CheckIssueLevel.Error) {
    return t('command.check.level.error');
  }
  if (level === CheckIssueLevel.Warn) {
    return t('command.check.level.warn');
  }
  return t('command.check.level.info');
}

export function registerCheckCommands(program: Command, ctx: CommandContext): void {
  program
    .command('check')
    .alias('chk')
    .description(t('command.check.description'))
    .action(() =>
      runAction(async () => {
        const report = await ctx.checkService.run();

        const errors = report.issues.filter((issue) => issue.level === CheckIssueLevel.Error);
        const warnings = report.issues.filter((issue) => issue.level === CheckIssueLevel.Warn);

        if (report.issues.length > 0) {
          const rows = report.issues.map((issue) => [renderIssueLevel(issue.level), issue.code, issue.message]);
          console.log(
            renderTable(
              [t('command.check.table.level'), t('command.check.table.code'), t('command.check.table.message')],
              rows,
            ),
          );
        } else {
          success(t('command.check.no_issues'));
        }

        report.info.forEach((line) => info(line));
        info(
          t('command.check.total_issues', {
            total: report.issues.length,
            errors: errors.length,
            warnings: warnings.length,
          }),
        );

        await ctx.auditLogger.log(
          errors.length > 0 ? 'ERROR' : warnings.length > 0 ? 'WARN' : 'INFO',
          { main: 'check', source: 'u' },
          t('command.check.audit.finished', {
            errors: errors.length,
            warnings: warnings.length,
          }),
        );

        if (errors.length > 0) {
          process.exitCode = 2;
        }
      }),
    );
}
