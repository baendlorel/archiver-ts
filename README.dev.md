# archiver-ts (Developer Guide)

This file is for contributors and maintainers.

If you are an end user, read `readme.md`.

## Tech stack

- Node.js >= 20
- TypeScript (ESM)
- Commander for CLI
- Vitest for tests
- Rollup for build output

## Quick start (dev)

```bash
npm install
npm run check
npm test
```

Run CLI from source:

```bash
npm run dev -- --help
```

Build:

```bash
npm run build
```

Run built CLI:

```bash
node dist/index.js --help
```

## Repo scripts

- `npm run dev`: run CLI from `src/index.ts` via `tsx`
- `npm run check`: TypeScript type-check (`tsc --noEmit`)
- `npm test`: unit/e2e tests via Vitest
- `npm run e2e`: helper wrapper for e2e entry script
- `npm run build`: clean `dist` then build bundle with Rollup
- `npm run arv`: build and run built CLI
- `npm run pub`: publish helper script

## Runtime and data root

Root resolution is implemented in `src/consts/path-tree.ts`:

- `NODE_ENV=production`: `ARCHIVER_PATH` or `~/.archiver`
- otherwise: `<cwd>/.archiver`

Current data layout:

```text
.archiver/
  config.jsonc
  auto-incr.jsonc
  list.jsonl
  vaults.jsonl
  log.jsonl
  vaults/
    <vaultId>/
      <archiveId>/
        <originalName>
```

## Architecture map

- `src/index.ts`: process entry, shell wrapper bootstrap, command parse
- `src/commands/*`: CLI command definitions and command-level flows
- `src/services/*`: business logic (archive, vault, config, log, update, check)
- `src/core/context.ts`: persistence and path helpers
- `src/core/initialize.ts`: shell wrapper auto-install
- `src/consts/*`: app constants/defaults/path tree
- `src/utils/*`: table rendering, parsing, fs/json/date helpers, prompt helpers
- `tests/*`: unit/integration/e2e tests

## Command wiring notes

- Program wiring lives in `src/commands/index.ts`
- Main command groups:
  - archive actions: `put`, `restore`, `move`, `cd`
  - vault actions: `vault use/create/remove/recover/rename/list`
  - views and maintenance: `list`, `log`, `config`, `update`, `check`

## Important behavior notes

- Archive/restore/move use filesystem rename operations.
- Default vault is `@` (id `0`) and is protected.
- `list` plain mode prints `[id] status name`; default vault entries omit vault prefix in the name part.
- Audit logs are appended into a single file: `log.jsonl`.
- Auto update check interval is 24h (`src/consts/update.ts`).
- Shell wrapper install is best-effort and should not block command execution.

## Recovery helper

Legacy helper script:

```bash
node .scripts/recover.js [--apply] [--force] [--root <path>]
```

This script is for recovery from legacy rust data layout and is not part of normal CLI flows.

## Testing

Run all tests:

```bash
npm test
```

Useful test focus:

- e2e CLI flow: `tests/e2e/cli.e2e.test.ts`
- archive/vault workflow: `tests/services/archive-workflow.test.ts`
- shell wrapper init: `tests/core/initialize.test.ts`
