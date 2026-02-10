import { Update } from '../consts/index.js';
import type { CommandContext } from '../services/context.js';
import { nowIso } from '../utils/date.js';
import { error, info } from '../utils/terminal.js';

export function summarizeBatch(operationName: string, result: { ok: unknown[]; failed: unknown[] }): void {
  info(`${operationName}: ${result.ok.length} succeeded, ${result.failed.length} failed.`);
}

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export async function maybeAutoUpdateCheck(ctx: CommandContext): Promise<void> {
  const config = await ctx.configService.getConfig();
  if (config.updateCheck !== 'on') {
    return;
  }

  if (config.lastUpdateCheck) {
    const last = new Date(config.lastUpdateCheck);
    if (!Number.isNaN(last.getTime())) {
      const diff = Date.now() - last.getTime();
      if (diff < Update.CheckInterval) {
        return;
      }
    }
  }

  try {
    const updateInfo = await ctx.updateService.checkLatest();
    await ctx.configService.updateLastCheck(nowIso());
    if (updateInfo.hasUpdate) {
      info(
        `New version available: ${updateInfo.latestVersion} (current ${updateInfo.currentVersion}). Run 'archiver update'.`,
      );
    }
  } catch {
    // Ignore update check failures in command flows.
  }
}

export async function runAction(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (e) {
    error((e as Error).message);
    process.exitCode = 1;
  }
}
