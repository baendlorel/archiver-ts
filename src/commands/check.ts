import type { Command } from 'commander';
import { CheckIssueLevel } from '../consts/enums.js';
import type { CommandContext } from '../services/context.js';
import { info, renderTable, success } from '../utils/terminal.js';
import { runAction } from './command-utils.js';

export function registerCheckCommands(program: Command, ctx: CommandContext): void {
  program
    .command('check')
    .alias('chk')
    .description('Check data consistency and health')
    .action(() =>
      runAction(async () => {
        const report = await ctx.checkService.run();

        const errors = report.issues.filter((issue) => issue.level === CheckIssueLevel.Error);
        const warnings = report.issues.filter((issue) => issue.level === CheckIssueLevel.Warn);

        if (report.issues.length > 0) {
          const rows = report.issues.map((issue) => [issue.level, issue.code, issue.message]);
          console.log(renderTable(['Level', 'Code', 'Message'], rows));
        } else {
          success('No consistency issues found.');
        }

        report.info.forEach((line) => info(line));
        info(`Total issues: ${report.issues.length} (${errors.length} error, ${warnings.length} warning).`);

        await ctx.auditLogger.log(
          errors.length > 0 ? 'ERROR' : warnings.length > 0 ? 'WARN' : 'INFO',
          { main: 'check', source: 'u' },
          `Health check finished: ${errors.length} errors, ${warnings.length} warnings`,
        );

        if (errors.length > 0) {
          process.exitCode = 2;
        }
      }),
    );
}
