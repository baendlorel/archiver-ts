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
arv list [-p|--plain]
arv log
arv config
arv update [--repo <owner/repo>] [--install]
arv check
```


## Interactive config editor

Run:

```bash
arv config
```

In the editor:

- Up/Down: activate config item
- Left/Right: switch select options, move cursor in input, or choose save/cancel/reset-default action
- Type: edit input field text
- Enter: save current action (or quick-save on field)
- q/Esc: cancel

All fullscreen interactive UIs (`arv list` picker, `arv config`, `arv dot`, and no-command selector) now:

- auto re-render on terminal resize
- keep fullscreen layout after resize
- show a terminal-size warning when the viewport is too small

## List output behavior

`arv list` opens an interactive picker (TTY):

- status filter: Archived / Restored / All (default All)
- vault filter: All or a specific vault (default All)
- fuzzy filter input: matches archive names and hides non-matching rows
- actions: enter slot / restore (when applicable)

When not in TTY, `arv list` falls back to plain list lines.

Non-interactive line format:

- format: `[<archiveId>] <A|R> <display-name>`
- `<archiveId>` is zero-padded to 4 digits
- default vault (`@`, id `0`): `<display-name>` is item name only
- non-default vault: `<display-name>` is `<vaultName>(<vaultId>)<sep><item>`
- `<sep>` comes from config editor (`vault_item_sep`, default `::`)

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

## Log output behavior

`arv log` always prints all records (no options) in a grep-friendly format.

- format: `<logId><TAB><time><TAB><level><TAB><op><TAB><message><TAB><archiveId><TAB><vaultId>`
- `op` uses `main/sub` when sub operation exists
- `archiveId` and `vaultId` are empty when not present

Example:

```text
12\t2026-02-12 10:22:33\tINFO\tarchive/put\tArchived foo.txt\t34\t0
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

Set it in:

```bash
arv config
```

## Language

- default language is `zh`
- switch language in:

```bash
arv config
```

## JSONC defaults and comments

- `config.jsonc` and `auto-incr.jsonc` are initialized from `public/config.default.jsonc` and `public/auto-incr.default.jsonc`.
- Build keeps these default JSONC files and copies them into `dist/` as-is.
- Saving config/auto-incr updates values while preserving existing JSONC comments.

## Useful aliases

- `list`: `l`, `ls`
- `log`: `lg`
- `config`: `c`, `cfg`
- `update`: `u`, `upd`
- `check`: `chk`
