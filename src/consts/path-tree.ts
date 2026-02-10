import { homedir } from 'node:os';
import { join } from 'node:path';

const root = join(homedir(), '.archiver');
const core = join(root, 'core');

export const ArchiverTree = {
  directories: {
    root,
    core: join(root, 'core'),
    logs: join(root, 'logs'),
    vaults: join(root, 'vaults'),
  },
  files: {
    config: join(core, 'config.jsonc'),
    autoIncr: join(core, 'auto-incr.json'),
    list: join(core, 'list.json'),
    vaults: join(core, 'vaults.json'),
  },
};
