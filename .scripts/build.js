import { execSync } from 'node:child_process';

execSync('pnpm vite build', { stdio: 'inherit' });
if (process.argv.includes('--arv')) {
  execSync('node ./dist/index.js', { stdio: 'inherit' });
}
