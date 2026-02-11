import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function readOption(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

function statusIsArchived(rawStatus) {
  return rawStatus === 'A' || rawStatus === 'Archived';
}

function normalizeEntry(raw) {
  const id = Number(raw.id);
  const vaultId = Number(raw.vid ?? raw.vaultId);
  const item = String(raw.i ?? raw.item ?? '');
  const directory = String(raw.d ?? raw.directory ?? '');
  const status = String(raw.st ?? raw.status ?? '');
  if (!Number.isInteger(id) || id <= 0) {
    return undefined;
  }
  if (!Number.isInteger(vaultId) || vaultId < 0) {
    return undefined;
  }
  if (!item || !directory) {
    return undefined;
  }
  return { id, vaultId, item, directory, status };
}

function readJsonl(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.trim()) {
    return [];
  }

  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid JSON at ${filePath}:${index + 1}: ${error.message}`);
      }
    });
}

function readListTable(rootPath) {
  const jsonlPath = path.join(rootPath, 'core', 'list.jsonl');
  if (fs.existsSync(jsonlPath)) {
    return readJsonl(jsonlPath);
  }

  const jsonPath = path.join(rootPath, 'core', 'list.json');
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Neither list.jsonl nor list.json exists under ${path.join(rootPath, 'core')}.`);
  }

  const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  return Array.isArray(parsed) ? parsed : [parsed];
}

function main() {
  const apply = hasFlag('--apply');
  const force = hasFlag('--force');

  const rootPath = path.join(os.homedir(), '.archiver-rust');

  const rows = readListTable(rootPath);
  const entries = rows
    .map((row) => normalizeEntry(row))
    .filter((entry) => entry !== undefined)
    .filter((entry) => statusIsArchived(entry.status))
    .sort((a, b) => a.id - b.id);

  if (entries.length === 0) {
    console.log(`[INFO] No archived entries found in ${rootPath}.`);
    return;
  }

  let listed = 0;
  let restored = 0;
  let skippedMissing = 0;
  let skippedTargetExists = 0;
  let failed = 0;

  console.log(`[INFO] root=${rootPath}`);
  console.log(`[INFO] mode=${apply ? 'apply' : 'dry-run'}${force ? ' (force enabled)' : ''}`);

  for (const entry of entries) {
    const sourcePath = path.join(rootPath, 'vaults', String(entry.vaultId), String(entry.id));
    const targetPath = path.join(entry.directory, entry.item);

    if (!fs.existsSync(sourcePath)) {
      skippedMissing += 1;
      console.log(`[SKIP][${entry.id}] source missing: ${sourcePath}`);
      continue;
    }

    if (fs.existsSync(targetPath) && !force) {
      skippedTargetExists += 1;
      console.log(`[SKIP][${entry.id}] target exists: ${targetPath}`);
      continue;
    }

    const mkdirCommand = `mkdir -p ${shellQuote(path.dirname(targetPath))}`;
    const moveCommand = `mv ${shellQuote(sourcePath)} ${shellQuote(targetPath)}`;

    listed += 1;
    console.log(`[PLAN][${entry.id}] ${moveCommand}`);

    if (!apply) {
      continue;
    }

    try {
      execSync(mkdirCommand, { stdio: 'inherit' });
      if (force && fs.existsSync(targetPath)) {
        const removeCommand = `rm -rf ${shellQuote(targetPath)}`;
        execSync(removeCommand, { stdio: 'inherit' });
      }
      execSync(moveCommand, { stdio: 'inherit' });
      restored += 1;
    } catch (error) {
      failed += 1;
      console.error(`[FAIL][${entry.id}] ${error.message}`);
    }
  }

  console.log(
    `[INFO] listed=${listed}, restored=${restored}, skipped_missing=${skippedMissing}, skipped_target_exists=${skippedTargetExists}, failed=${failed}`,
  );

  if (apply && failed > 0) {
    process.exitCode = 1;
  }
}

main();
