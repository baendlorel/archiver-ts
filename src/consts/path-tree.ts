import { homedir } from 'node:os';
import { join } from 'node:path';

const getRoot = () => {
  const prodHome = process.env.ARCHIVER_PATH ?? join(homedir(), '.archiver');
  return __IS_PROD__ ? prodHome : join(process.cwd(), '.archiver');
};

const root = getRoot();

export namespace Paths {
  export const Dir = {
    root,
    vaults: join(root, 'vaults'),
  };

  export const File = {
    config: join(root, 'config.jsonc'),
    autoIncr: join(root, 'auto-incr.jsonc'),
    list: join(root, 'list.jsonl'),
    vaults: join(root, 'vaults.jsonl'),
    log: join(root, 'log.jsonl'),
  };
}
