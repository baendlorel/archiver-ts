import { execSync } from 'node:child_process';

execSync('npx rimraf dist', { stdio: 'inherit' });
execSync('rollup -c', { stdio: 'inherit' });
execSync('npm publish --access public', { stdio: 'inherit' });
