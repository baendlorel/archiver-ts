# Archiver TypeScript Spec

This document captures the compatibility targets used for this TypeScript rewrite.

## Product Goal

`archiver` is a CLI that moves files/directories you do not want in the current workspace into `~/.archiver`, while preserving restore capability, vault grouping, audit logs, and consistency checks.

Core principle:

- No compression, no database.
- Use filesystem `rename/move`.
- Metadata is persisted in JSON/JSONL.
- Global incremental IDs are used for archives, vaults, and logs.

## Command Surface

- `put <items...>` (`p`)
- `restore <ids...>` (`r`, `rst`)
- `move <ids...> --to <vault>` (`m`, `mv`, `mov`)
- `cd <archive-id | vault/archive-id>`
- `vault <subcommand>` (`v`, `vlt`)
- `list` (`l`, `ls`)
- `log [range]` (`lg`)
- `config <subcommand>` (`c`, `cfg`)
- `update` (`u`, `upd`)
- `check` (`chk`)

## Data Layout

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

- Default vault is runtime-injected: name `@`, id `0`, protected.
- Archive slot path: `~/.archiver/vaults/<vaultId>/<archiveId>`.
- Archived object path: `~/.archiver/vaults/<vaultId>/<archiveId>/<originalName>`.
- Legacy direct-object layout (`~/.archiver/vaults/<vaultId>/<archiveId>`) is not supported.

## Core Record Fields

`list.jsonl` record (`ListEntry`):

- `aat`, `st`, `is_d`, `vid`, `id`, `i`, `d`, `m`, `r`

`vaults.jsonl` record (`Vault`):

- `id`, `n`, `r`, `cat`, `st`

`config.jsonc`:

- `current_vault_id`, `update_check`, `last_update_check`, `alias_map`, `vault_item_sep`

`auto-incr.jsonc`:

- `log_id`, `vault_id`, `archive_id`

`logs/<year>.jsonl` record (`LogEntry`):

- `id`, `oat`, `lv`, `o`, `m`, optional `aid`, optional `vid`

Operation payload (`o`):

- `m`, optional `s`, optional `a`, optional `opt`, optional `sc`

## Behavioral Baseline

### put

- Validate item paths, duplicates, and forbidden paths related to `~/.archiver`.
- Validate destination archive slots.
- Move object via `rename`.
- Append list entry and write audit log.

### restore

- Validate ids, existence, duplicates, and status.
- Validate source archive object and restore target conflict.
- Create parent directory if needed.
- Move object back via `rename`.
- Update status and write audit log.

### move

- Validate target vault.
- Validate each archive id and source/target slot existence.
- Move archive object via `rename`.
- Update `vid` and write audit log.

### cd

- Resolve `<archive-id>` globally or `<vault>/<archive-id>` explicitly.
- Validate archive entry state and slot directory.
- Open a subshell at the slot path (interactive), or print path in non-interactive mode.

### vault

- `create`: unique name, optional activate; can recover removed vault with same name.
- `remove`: two-step confirmation and verification code; move archived objects to default vault first.
- `recover`: set removed vault back to valid.
- `rename`: rename valid vault.
- `use`: change config current vault.

### list / log

- `list`: supports archived/restored/all and vault filtering.
- `log`: default tail 15, supports month ranges and `--id` detail view.

### config

- `alias` changes display path mapping only.
- `update-check` toggles automatic update checks.
- `vault-item-sep` controls vault-item display separator.

### update

- Uses GitHub Releases API (`/releases/latest`) to compare versions.
- Optional install script execution from release assets.

### check

- Verifies required path layout, metadata consistency, id uniqueness, and auto-increment sanity.
- Verifies archive object presence/type by status.
- Verifies vault directory consistency.
