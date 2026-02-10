#!/usr/bin/env node
import path from "node:path";
import { Command } from "commander";
import {
  APP_DESCRIPTION,
  APP_NAME,
  DEFAULT_LOG_TAIL,
  DEFAULT_VAULT,
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_REPO,
} from "./constants.js";
import { ArchiverContext } from "./core/context.js";
import { ArchiveService } from "./services/archive-service.js";
import { AuditLogger } from "./services/audit-logger.js";
import { CheckService } from "./services/check-service.js";
import { ConfigService } from "./services/config-service.js";
import { LogService } from "./services/log-service.js";
import { readCurrentVersion, UpdateService } from "./services/update-service.js";
import { VaultService } from "./services/vault-service.js";
import { formatDateTime, nowIso } from "./utils/date.js";
import { ask, confirm } from "./utils/prompt.js";
import { parseIdList, parseLogRange } from "./utils/parse.js";
import {
  error,
  info,
  renderTable,
  styleArchiveStatus,
  styleLogLevel,
  styleVaultStatus,
  success,
  warn,
} from "./utils/terminal.js";

interface CommandContext {
  context: ArchiverContext;
  archiveService: ArchiveService;
  vaultService: VaultService;
  configService: ConfigService;
  logService: LogService;
  checkService: CheckService;
  auditLogger: AuditLogger;
  updateService: UpdateService;
  version: string;
}

function summarizeBatch(operationName: string, result: { ok: unknown[]; failed: unknown[] }): void {
  info(`${operationName}: ${result.ok.length} succeeded, ${result.failed.length} failed.`);
}

async function maybeAutoUpdateCheck(ctx: CommandContext): Promise<void> {
  const config = await ctx.configService.getConfig();
  if (config.update_check !== "on") {
    return;
  }

  if (config.last_update_check) {
    const last = new Date(config.last_update_check);
    if (!Number.isNaN(last.getTime())) {
      const diff = Date.now() - last.getTime();
      if (diff < UPDATE_CHECK_INTERVAL_MS) {
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

async function buildContext(): Promise<CommandContext> {
  const context = new ArchiverContext();
  await context.init();

  const configService = new ConfigService(context);
  const auditLogger = new AuditLogger(context);
  const archiveService = new ArchiveService(context, configService, auditLogger);
  const vaultService = new VaultService(context, configService);
  const logService = new LogService(context);
  const checkService = new CheckService(context);
  const version = await readCurrentVersion();
  const updateService = new UpdateService(version);

  return {
    context,
    archiveService,
    vaultService,
    configService,
    logService,
    checkService,
    auditLogger,
    updateService,
    version,
  };
}

async function runAction(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (e) {
    error((e as Error).message);
    process.exitCode = 1;
  }
}

async function createProgram(ctx: CommandContext): Promise<Command> {
  const program = new Command();

  program.name(APP_NAME).description(APP_DESCRIPTION).version(ctx.version);

  program
    .command("put")
    .alias("p")
    .description("Archive one or many files/directories")
    .argument("<items...>", "Items to archive")
    .option("-v, --vault <vault>", "Target vault name or id")
    .option("-m, --message <message>", "Archive message")
    .option("-r, --remark <remark>", "Archive remark")
    .action((items: string[], options: { vault?: string; message?: string; remark?: string }) =>
      runAction(async () => {
        const result = await ctx.archiveService.put(items, options);

        for (const item of result.ok) {
          success(`[${item.id}] ${item.input} -> ${item.message}`);
        }
        for (const item of result.failed) {
          error(`[${item.id ?? "-"}] ${item.input}: ${item.message}`);
        }

        summarizeBatch("put", result);

        await maybeAutoUpdateCheck(ctx);
      }),
    );

  program
    .command("restore")
    .alias("r")
    .alias("rst")
    .description("Restore archived entries by id")
    .argument("<ids...>", "Archive ids")
    .action((ids: string[]) =>
      runAction(async () => {
        const parsedIds = parseIdList(ids);
        const result = await ctx.archiveService.restore(parsedIds);

        for (const item of result.ok) {
          success(`[${item.id}] restored: ${item.message}`);
        }
        for (const item of result.failed) {
          error(`[${item.id ?? "-"}] restore failed: ${item.message}`);
        }

        summarizeBatch("restore", result);

        await maybeAutoUpdateCheck(ctx);
      }),
    );

  program
    .command("move")
    .alias("m")
    .alias("mv")
    .alias("mov")
    .description("Move archived entries to another vault")
    .argument("<ids...>", "Archive ids")
    .requiredOption("--to <vault>", "Destination vault name or id")
    .action((ids: string[], options: { to: string }) =>
      runAction(async () => {
        const parsedIds = parseIdList(ids);
        const result = await ctx.archiveService.move(parsedIds, options.to);

        for (const item of result.ok) {
          success(`[${item.id}] moved: ${item.message}`);
        }
        for (const item of result.failed) {
          error(`[${item.id ?? "-"}] move failed: ${item.message}`);
        }

        summarizeBatch("move", result);

        await maybeAutoUpdateCheck(ctx);
      }),
    );

  const vault = program.command("vault").alias("v").alias("vlt").description("Vault management");

  vault
    .command("use")
    .description("Use a vault as the current vault")
    .argument("<name-or-id>", "Vault name or id")
    .action((nameOrId: string) =>
      runAction(async () => {
        const target = await ctx.vaultService.useVault(nameOrId);
        success(`Current vault changed to ${target.n}(${target.id}).`);

        await ctx.auditLogger.log(
          "INFO",
          { m: "vault", s: "use", a: [nameOrId], sc: "u" },
          `Switch current vault to ${target.n}(${target.id})`,
          { vid: target.id },
        );

        await maybeAutoUpdateCheck(ctx);
      }),
    );

  vault
    .command("create")
    .description("Create a vault")
    .argument("<name>", "Vault name")
    .option("-r, --remark <remark>", "Vault remark")
    .option("-a, --activate", "Activate after creation")
    .action((name: string, options: { remark?: string; activate?: boolean }) =>
      runAction(async () => {
        let recovered = false;
        const createOrRecover = async (recoverRemoved: boolean): Promise<void> => {
          const result = await ctx.vaultService.createVault({
            name,
            remark: options.remark,
            activate: options.activate,
            recoverRemoved,
          });

          recovered = result.recovered;
          const actionText = recovered ? "Recovered" : "Created";
          success(`${actionText} vault ${result.vault.n}(${result.vault.id}).`);

          if (options.activate) {
            success(`Activated vault ${result.vault.n}(${result.vault.id}).`);
          }

          await ctx.auditLogger.log(
            "INFO",
            {
              m: "vault",
              s: recovered ? "recover" : "create",
              a: [name],
              opt: {
                activate: Boolean(options.activate),
              },
              sc: "u",
            },
            `${actionText} vault ${result.vault.n}(${result.vault.id})`,
            { vid: result.vault.id },
          );
        };

        try {
          await createOrRecover(false);
        } catch (err) {
          const message = (err as Error).message;
          if (message.includes("A removed vault named")) {
            const shouldRecover = await confirm(
              `A removed vault named ${name} exists. Recover it instead? [y/N] `,
            );
            if (!shouldRecover) {
              warn("Operation cancelled.");
              return;
            }
            await createOrRecover(true);
          } else {
            throw err;
          }
        }

        await maybeAutoUpdateCheck(ctx);
      }),
    );

  vault
    .command("remove")
    .description("Remove a vault (moves archived entries to default vault @)")
    .argument("<name-or-id>", "Vault name or id")
    .action((nameOrId: string) =>
      runAction(async () => {
        const stepOne = await confirm(`Remove vault ${nameOrId}? This cannot be undone directly. [y/N] `);
        if (!stepOne) {
          warn("Operation cancelled.");
          return;
        }

        const verifyCode = Math.random().toString(36).slice(2, 8).toUpperCase();
        const typed = await ask(`Type verification code '${verifyCode}' to continue: `);
        if (typed !== verifyCode) {
          warn("Verification code does not match. Operation cancelled.");
          return;
        }

        const result = await ctx.vaultService.removeVault(nameOrId);

        success(`Vault ${result.vault.n}(${result.vault.id}) removed.`);
        if (result.movedArchiveIds.length > 0) {
          info(`Moved ${result.movedArchiveIds.length} archived objects to default vault ${DEFAULT_VAULT.n}.`);
        }

        await ctx.auditLogger.log(
          "WARN",
          {
            m: "vault",
            s: "remove",
            a: [nameOrId],
            sc: "u",
          },
          `Removed vault ${result.vault.n}(${result.vault.id})`,
          { vid: result.vault.id },
        );

        await maybeAutoUpdateCheck(ctx);
      }),
    );

  vault
    .command("recover")
    .description("Recover a removed vault")
    .argument("<name-or-id>", "Vault name or id")
    .action((nameOrId: string) =>
      runAction(async () => {
        const result = await ctx.vaultService.recoverVault(nameOrId);
        success(`Recovered vault ${result.n}(${result.id}).`);

        await ctx.auditLogger.log(
          "INFO",
          {
            m: "vault",
            s: "recover",
            a: [nameOrId],
            sc: "u",
          },
          `Recovered vault ${result.n}(${result.id})`,
          { vid: result.id },
        );

        await maybeAutoUpdateCheck(ctx);
      }),
    );

  vault
    .command("rename")
    .description("Rename a vault")
    .argument("<old>", "Current vault name or id")
    .argument("<new>", "New vault name")
    .action((oldName: string, newName: string) =>
      runAction(async () => {
        const renamed = await ctx.vaultService.renameVault(oldName, newName);
        success(`Renamed vault to ${renamed.n}(${renamed.id}).`);

        await ctx.auditLogger.log(
          "INFO",
          {
            m: "vault",
            s: "rename",
            a: [oldName, newName],
            sc: "u",
          },
          `Renamed vault ${oldName} to ${newName}`,
          { vid: renamed.id },
        );

        await maybeAutoUpdateCheck(ctx);
      }),
    );

  vault
    .command("list")
    .description("List vaults")
    .option("-a, --all", "Show removed vaults")
    .action((options: { all?: boolean }) =>
      runAction(async () => {
        const config = await ctx.configService.getConfig();
        const vaults = await ctx.vaultService.listVaults(Boolean(options.all));

        const headers = ["ID", "Name", "Status", "Created At", "Remark", "Current"];
        const rows = vaults.map((entry) => [
          String(entry.id),
          entry.n,
          styleVaultStatus(entry.st),
          entry.cat,
          entry.r,
          config.current_vault_id === entry.id ? "*" : "",
        ]);

        if (rows.length === 0) {
          info("No vaults found.");
          return;
        }

        console.log(renderTable(headers, rows));
      }),
    );

  program
    .command("list")
    .alias("l")
    .alias("ls")
    .description("List archived entries")
    .option("--restored", "Show only restored entries")
    .option("--all", "Show all entries")
    .option("--vault <vault>", "Filter by vault name or id")
    .action((options: { restored?: boolean; all?: boolean; vault?: string }) =>
      runAction(async () => {
        const entries = await ctx.archiveService.listEntries(options);
        const decorated = await ctx.archiveService.decorateEntries(entries);
        const config = await ctx.configService.getConfig();

        const headers = ["ID", "ST", `Vault${config.vault_item_sep}Item`, "Path", "Archived At", "Message", "Remark"];

        const rows = decorated.map((entry) => {
          const dirDisplay = ctx.configService.renderPathWithAlias(entry.d, config.alias_map);
          return [
            String(entry.id),
            styleArchiveStatus(entry.st),
            `${entry.vaultName}${config.vault_item_sep}${entry.i}`,
            dirDisplay,
            entry.aat,
            entry.m,
            entry.r,
          ];
        });

        if (rows.length === 0) {
          info("No entries matched.");
          return;
        }

        console.log(renderTable(headers, rows));
      }),
    );

  program
    .command("log")
    .alias("lg")
    .description("Show operation logs")
    .argument("[range]", "YYYYMM | YYYYMM-YYYYMM | all|*|a")
    .option("--id <id>", "Show one log record by id")
    .action((range: string | undefined, options: { id?: string }) =>
      runAction(async () => {
        if (options.id !== undefined) {
          if (!/^\d+$/.test(options.id)) {
            throw new Error(`Invalid log id: ${options.id}`);
          }
          const logId = Number(options.id);
          const detail = await ctx.logService.getLogById(logId);
          if (!detail) {
            throw new Error(`Log id ${logId} not found.`);
          }

          info(`Log #${detail.log.id}`);
          console.log(
            renderTable(
              ["Field", "Value"],
              [
                ["id", String(detail.log.id)],
                ["time", detail.log.oat],
                ["level", styleLogLevel(detail.log.lv)],
                ["operation", `${detail.log.o.m}${detail.log.o.s ? `/${detail.log.o.s}` : ""}`],
                ["message", detail.log.m],
                ["archive_id", detail.log.aid !== undefined ? String(detail.log.aid) : ""],
                ["vault_id", detail.log.vid !== undefined ? String(detail.log.vid) : ""],
              ],
            ),
          );

          if (detail.archive) {
            info("Linked archive entry");
            console.log(
              renderTable(
                ["id", "status", "vault", "item", "dir"],
                [[
                  String(detail.archive.id),
                  styleArchiveStatus(detail.archive.st),
                  String(detail.archive.vid),
                  detail.archive.i,
                  detail.archive.d,
                ]],
              ),
            );
          }

          if (detail.vault) {
            info("Linked vault");
            console.log(
              renderTable(
                ["id", "name", "status", "remark"],
                [[
                  String(detail.vault.id),
                  detail.vault.n,
                  styleVaultStatus(detail.vault.st),
                  detail.vault.r,
                ]],
              ),
            );
          }

          return;
        }

        const parsedRange = parseLogRange(range);
        const logs = await ctx.logService.getLogs(parsedRange, DEFAULT_LOG_TAIL);

        if (logs.length === 0) {
          info("No logs found.");
          return;
        }

        const rows = logs.map((entry) => [
          String(entry.id),
          entry.oat,
          styleLogLevel(entry.lv),
          `${entry.o.m}${entry.o.s ? `/${entry.o.s}` : ""}`,
          entry.m,
          entry.aid !== undefined ? String(entry.aid) : "",
          entry.vid !== undefined ? String(entry.vid) : "",
        ]);

        console.log(renderTable(["ID", "Time", "Level", "Op", "Message", "AID", "VID"], rows));
      }),
    );

  const config = program.command("config").alias("c").alias("cfg").description("Manage config values");

  config
    .command("list")
    .description("Show current config")
    .option("-c, --comment", "Show key comments")
    .action((options: { comment?: boolean }) =>
      runAction(async () => {
        const current = await ctx.configService.getConfig();
        if (options.comment) {
          const rows: string[][] = [
            ["current_vault_id", String(current.current_vault_id), "Current default vault id"],
            ["update_check", current.update_check, "Enable automatic update checks"],
            ["last_update_check", current.last_update_check || "", "Last auto-check timestamp (ISO)"] ,
            ["alias_map", JSON.stringify(current.alias_map), "Path alias map for display only"],
            ["vault_item_sep", current.vault_item_sep, "Separator shown between vault and item"],
          ];
          console.log(renderTable(["Key", "Value", "Comment"], rows));
        } else {
          console.log(JSON.stringify(current, null, 2));
        }
      }),
    );

  config
    .command("alias")
    .description("Set or remove a display alias: <alias=path> [-r]")
    .argument("<alias-path>", "Format: alias=/absolute/path")
    .option("-r, --remove", "Remove alias")
    .action((aliasPath: string, options: { remove?: boolean }) =>
      runAction(async () => {
        if (options.remove) {
          const alias = aliasPath.includes("=") ? aliasPath.split("=", 1)[0] : aliasPath;
          if (!alias) {
            throw new Error("Alias cannot be empty.");
          }
          await ctx.configService.removeAlias(alias);
          success(`Removed alias ${alias}.`);

          await ctx.auditLogger.log(
            "INFO",
            { m: "config", s: "alias", a: [alias], opt: { remove: true }, sc: "u" },
            `Removed alias ${alias}`,
          );
        } else {
          const split = aliasPath.split("=");
          if (split.length !== 2 || !split[0] || !split[1]) {
            throw new Error("Alias format must be alias=path.");
          }
          const alias = split[0].trim();
          const targetPath = split[1].trim();
          await ctx.configService.addAlias(alias, targetPath);
          success(`Set alias ${alias}=${path.resolve(targetPath)}.`);

          await ctx.auditLogger.log(
            "INFO",
            { m: "config", s: "alias", a: [aliasPath], sc: "u" },
            `Set alias ${alias}`,
          );
        }

        await maybeAutoUpdateCheck(ctx);
      }),
    );

  config
    .command("update-check")
    .description("Enable or disable auto update checks")
    .argument("<state>", "on|off")
    .action((state: string) =>
      runAction(async () => {
        const normalized = state.toLowerCase();
        if (normalized !== "on" && normalized !== "off") {
          throw new Error("State must be on or off.");
        }

        await ctx.configService.setUpdateCheck(normalized);
        success(`Auto update check is now ${normalized}.`);

        await ctx.auditLogger.log(
          "INFO",
          { m: "config", s: "update-check", a: [normalized], sc: "u" },
          `Set update_check=${normalized}`,
        );

        await maybeAutoUpdateCheck(ctx);
      }),
    );

  config
    .command("vault-item-sep")
    .description("Set separator between vault and item in list output")
    .argument("<sep>", "Separator string")
    .action((separator: string) =>
      runAction(async () => {
        if (!separator.trim()) {
          throw new Error("Separator cannot be empty.");
        }

        await ctx.configService.setVaultItemSeparator(separator);
        success(`vault_item_sep updated to '${separator}'.`);

        await ctx.auditLogger.log(
          "INFO",
          { m: "config", s: "vault-item-sep", a: [separator], sc: "u" },
          `Set vault_item_sep=${separator}`,
        );

        await maybeAutoUpdateCheck(ctx);
      }),
    );

  program
    .command("update")
    .alias("u")
    .alias("upd")
    .description("Check for updates from GitHub releases")
    .option("--repo <owner/repo>", `GitHub repository (default: ${UPDATE_REPO})`)
    .option("--install", "Install by running release install script asset")
    .action((options: { repo?: string; install?: boolean }) =>
      runAction(async () => {
        const repo = options.repo ?? UPDATE_REPO;
        const update = await ctx.updateService.checkLatest(repo);

        info(`Current version: ${update.currentVersion}`);
        info(`Latest version : ${update.latestVersion}`);

        if (!update.hasUpdate) {
          success("You are already on the latest version.");
        } else {
          warn("A new version is available.");
          if (update.htmlUrl) {
            info(`Release page: ${update.htmlUrl}`);
          }
          if (update.publishedAt) {
            info(`Published at: ${update.publishedAt}`);
          }
        }

        await ctx.auditLogger.log(
          "INFO",
          {
            m: "update",
            a: [],
            opt: { repo },
            sc: "u",
          },
          `Checked updates from ${repo}: latest=${update.latestVersion}, hasUpdate=${update.hasUpdate}`,
        );

        if (options.install) {
          if (!update.hasUpdate) {
            info("Skip install because current version is latest.");
            return;
          }

          const shouldInstall = await confirm("Run release install script now? [y/N] ");
          if (!shouldInstall) {
            warn("Installation cancelled.");
            return;
          }

          const output = await ctx.updateService.installLatest(repo);
          success("Install script executed.");
          if (output) {
            console.log(output);
          }

          await ctx.auditLogger.log(
            "INFO",
            {
              m: "update",
              s: "install",
              opt: { repo },
              sc: "u",
            },
            `Executed install script from latest release (${repo})`,
          );
        }
      }),
    );

  program
    .command("check")
    .alias("chk")
    .description("Check data consistency and health")
    .action(() =>
      runAction(async () => {
        const report = await ctx.checkService.run();

        const errors = report.issues.filter((issue) => issue.level === "ERROR");
        const warnings = report.issues.filter((issue) => issue.level === "WARN");

        if (report.issues.length > 0) {
          const rows = report.issues.map((issue) => [issue.level, issue.code, issue.message]);
          console.log(renderTable(["Level", "Code", "Message"], rows));
        } else {
          success("No consistency issues found.");
        }

        report.info.forEach((line) => info(line));
        info(`Total issues: ${report.issues.length} (${errors.length} error, ${warnings.length} warning).`);

        await ctx.auditLogger.log(
          errors.length > 0 ? "ERROR" : warnings.length > 0 ? "WARN" : "INFO",
          { m: "check", sc: "u" },
          `Health check finished: ${errors.length} errors, ${warnings.length} warnings`,
        );

        if (errors.length > 0) {
          process.exitCode = 2;
        }
      }),
    );

  return program;
}

async function main(): Promise<void> {
  const context = await buildContext();
  const program = await createProgram(context);

  await program.parseAsync(process.argv);

  if (process.argv.length <= 2) {
    program.outputHelp();
  }
}

main().catch((e) => {
  error((e as Error).message);
  process.exit(1);
});
