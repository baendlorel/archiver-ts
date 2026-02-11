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
arv cd <archive-id | vault/archive-id> [--print]
arv cd - [--print]
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
arv list [--restored] [--all] [--vault <vault>] [--no-interactive]
arv log [YYYYMM | YYYYMM-YYYYMM | all]
arv log --id <log-id>
arv config list [-c|--comment]
arv config alias <alias=path> [-r|--remove]
arv config update-check <on|off>
arv config vault-item-sep <separator>
arv update [--repo <owner/repo>] [--install]
arv check
```

## List output behavior

`arv list` plain mode prints one entry per line:

- format: `[<archiveId>] <A|R> <display-name>`
- default vault (`@`, id `0`): `<display-name>` is item name only
- non-default vault: `<display-name>` is `<vaultName>(<vaultId>)<sep><item>`
- `<sep>` comes from `config vault-item-sep` (default `::`)

Example:

```text
[0001] A todo.txt
[0002] A work(1)::report.pdf
```

## Shell wrapper note

On interactive terminal startup, `arv` may auto-install a shell wrapper function so `cd` can move your shell to archive slot paths.

Disable this behavior if needed:

```bash
ARV_DISABLE_SHELL_INIT=1 arv <command>
```

## Useful aliases

- `list`: `l`, `ls`
- `log`: `lg`
- `config`: `c`, `cfg`
- `update`: `u`, `upd`
- `check`: `chk`
