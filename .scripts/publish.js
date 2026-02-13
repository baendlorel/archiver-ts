import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

execSync('pnpm vite build', { stdio: 'inherit' });

const jsonPath = path.join(process.cwd(), 'package.json');
const content = readFileSync(jsonPath, 'utf-8');
const json = JSON.parse(content);
// bump version
json.version = json.version
  .split('.')
  .map((v) => parseInt(v))
  .map((v, i) => (i === 2 ? v + 1 : v))
  .join('.');
writeFileSync(jsonPath, JSON.stringify(json, null, 2));

execSync('npm publish --access public', { stdio: 'inherit' });
