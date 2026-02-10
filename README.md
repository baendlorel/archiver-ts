# archiver-ts

A TypeScript rebuild of the `archiver` CLI.

`archiver-ts` moves files/directories out of your workspace into `~/.archiver` without compression and without copy/delete workflows. It keeps metadata in JSON/JSONL files and records audit logs for every operation.

Runtime root behavior:

- Development runtime (running from `src`, e.g. `npm run dev`): stores data in `<current-working-directory>/.archiver-dev`
- Production runtime (running built CLI): stores data in `~/.archiver`
- Override for both modes: set `ARCHIVER_ROOT=/custom/path`
- Force runtime mode: set `ARCHIVER_RUNTIME=development|production`

## Features

- `put <items...>`: archive files/folders into the current or specified vault
- `restore <ids...>`: restore archived items back to original paths
- `move <ids...> --to <vault>`: move archived objects between vaults
- `cd <id | vault/id>`: jump to an archive slot folder for inspection
- `vault`: manage vaults (`use`, `create`, `remove`, `recover`, `rename`, `list`)
- `list`: query archive records by state and vault
- `log`: inspect operation logs by range or log id
- `config`: update alias map, update checks, and UI separator
- `update`: check latest release from GitHub Releases API
- `check`: run consistency validation for metadata and filesystem objects

## Compatibility Notes

The storage layout is intentionally compatible with the original behavior described in `TS_REWRITE_FEATURE_SUMMARY.md`:

```text
~/.archiver/
  logs/
    <year>.jsonl
  core/
    config.jsonc
    auto-incr.jsonc
    list.jsonl
    vaults.jsonl
  vaults/
    <vaultId>/
      <archiveId>/
        <originalName>
```

Important compatibility points:

- Uses filesystem rename/move (no compression, no copy/delete fallback).
- Supports only slot-based storage (`<archiveId>/<originalName>`); legacy direct-object layout is not handled.
- Keeps compact field names in JSON/JSONL (`aat`, `st`, `is_d`, `vid`, `id`, etc.).
- Keeps default vault `@` with id `0` as a runtime-injected protected vault.
- Maintains auto increment behavior (`next` = increment first, then return).
- Records operation source and related ids in logs.

## Install

```bash
npm install
npm run build
```

Run locally:

```bash
npm run dev -- --help
```

Or after build:

```bash
node dist/index.js --help
```

## Command Reference

### Archive / Restore

```bash
archiver put <items...> [-v|--vault <vault>] [-m|--message <msg>] [-r|--remark <remark>]
archiver restore <ids...>
archiver move <ids...> --to <vault>
archiver cd <archive-id | vault/archive-id> [--print]
```

Aliases:

- `put`: `p`
- `restore`: `r`, `rst`
- `move`: `m`, `mv`, `mov`
- `cd`: (no short alias)

`cd` behavior:

- In interactive terminals, opens a subshell in the archive slot directory.
- With `--print` (or non-interactive stdout), prints the slot path only.

### Vault Management

```bash
archiver vault use <name-or-id>
archiver vault create <name> [-r|--remark <remark>] [-a|--activate]
archiver vault remove <name-or-id>
archiver vault recover <name-or-id>
archiver vault rename <old> <new>
archiver vault list [-a|--all]
```

Aliases:

- `vault`: `v`, `vlt`

### Query & Logs

```bash
archiver list [--restored] [--all] [--vault <vault>] [--no-interactive]
archiver log [range]
archiver log --id <log-id>
```

`range` supports:

- `YYYYMM`
- `YYYYMM-YYYYMM`
- `all`, `*`, `a`

Aliases:

- `list`: `l`, `ls`
- `log`: `lg`

`list` interactive mode (TTY terminals):

- `Up` / `Down`: select archive entry
- `Left` / `Right`: choose action (`Enter slot` / `Restore`)
- `Enter`: confirm selected action
- `q` / `Esc`: cancel
- Use `--no-interactive` to force plain-table output

### Config

```bash
archiver config list [-c|--comment]
archiver config alias <alias=path> [-r|--remove]
archiver config update-check <on|off>
archiver config vault-item-sep <separator>
```

Aliases:

- `config`: `c`, `cfg`

### Maintenance

```bash
archiver update [--repo <owner/repo>] [--install]
archiver check
```

Aliases:

- `update`: `u`, `upd`
- `check`: `chk`

## Update Checks

Automatic update checks are enabled by default (`config.update_check = on`) and only run for non-display workflows. Display-only commands (`update`, `list`, `log`, `check`) do not trigger auto checks unless `list` executes a restore action in interactive mode.

Set `ARCHIVER_GITHUB_REPO` to control release source for update checks.

## Development

```bash
npm run check
npm run build
```

The codebase is split into:

- `src/core`: storage paths and persistence context
- `src/services`: business logic (archive, vault, logs, check, update)
- `src/utils`: parsing, JSONL helpers, prompts, terminal rendering
- `src/index.ts`: CLI wiring and command handlers
