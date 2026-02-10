import { execSync } from 'node:child_process';

execSync('npx rimraf dist', { stdio: 'inherit' });
execSync('rollup -c', { stdio: 'inherit' });
if (process.argv.includes('--arv')) {
  execSync('node ./dist/index.js', { stdio: 'inherit' });
}
