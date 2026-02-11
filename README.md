# archiver

`archiver` (binary: `arv`) archives files/folders into a managed vault directory and lets you restore them later.

It uses filesystem move/rename semantics (no compression), keeps metadata in `.archiver`, and records audit logs.

## Quick start

Install dependencies and build:

```bash
npm install -g archiver-ts
```

## Common commands

Archive / restore:

```bash
arv put <items...> [-v|--vault <vault>] [-m|--message <msg>] [-r|--remark <remark>]
arv restore <ids...>
arv move <ids...> --to <vault>
```

Vault management:

```bash
arv vault use <name-or-id>
arv vault create <name> [-r|--remark <remark>] [-a|--activate]
arv vault remove <name-or-id>
arv vault recover <name-or-id>
arv vault rename <old> <new>
arv vault list [-a|--all]
```

Query and maintenance:

```bash
arv list [--restored] [--all] [--vault <vault>] [--no-interactive] [--plain]
arv log [YYYYMM | YYYYMM-YYYYMM | all]
arv log --id <log-id>
arv config list [-c|--comment]
arv config alias <alias=path> [-r|--remove]
arv config update-check <on|off>
arv config vault-item-sep <separator>
arv config style <on|off>
arv config no-command-action <help|list|unknown>
arv update [--repo <owner/repo>] [--install]
arv check
```

## List output behavior

`arv list` default non-interactive output is one line per entry:

- format: `[<archiveId>] <A|R> <display-name>`
- `<archiveId>` is zero-padded to 4 digits
- default vault (`@`, id `0`): `<display-name>` is item name only
- non-default vault: `<display-name>` is `<vaultName>(<vaultId>)<sep><item>`
- `<sep>` comes from `config vault-item-sep` (default `::`)

Use `arv list --plain` for grep/script usage:

- format: `<archiveId><TAB><A|R><TAB><display-name>`
- always disables interactive picker
- prints no extra hints/messages when no entries match

Examples:

```text
[0001] A todo.txt
[0002] A work(1)::report.pdf
1	A	todo.txt
2	A	work(1)::report.pdf
```

## Shell wrapper note

On interactive terminal startup, `arv` may auto-install a shell wrapper function so `arv list` interactive `Enter slot` can move your shell to archive slot paths.

Use project-prefixed env overrides when needed:

```bash
ARCHIVER_DISABLE_SHELL_INIT=1 arv <command>
ARCHIVER_STYLE=off arv list
```

## No-command behavior

When you run `arv` without any subcommand, behavior is controlled by config:

- `unknown` (default): ask once (list/help) and save to config
- `help`: show help text
- `list`: run `arv list`

If `no_command_action` is `unknown` and input is not TTY (e.g. piped/CI), `arv` falls back to help text for that run.

Set it with:

```bash
arv config no-command-action unknown
arv config no-command-action help
arv config no-command-action list
```

## JSONC defaults and comments

- `config.jsonc` and `auto-incr.jsonc` are initialized from built-in JSONC templates in `src/default-files`.
- These templates are embedded as raw text during build, so release bundle still ships as a single JS file.
- Saving config/auto-incr updates values while preserving existing JSONC comments.

## Useful aliases

- `list`: `l`, `ls`
- `log`: `lg`
- `config`: `c`, `cfg`
- `update`: `u`, `upd`
- `check`: `chk`
