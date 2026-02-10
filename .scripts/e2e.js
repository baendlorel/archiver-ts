import { execSync } from 'node:child_process';

execSync('vitest run tests/e2e', { stdio: 'inherit', env: { ...process.env, ARCHIVER_DIR_PARENT: process.cwd() } });
