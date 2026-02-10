import fs from 'node:fs/promises';
import type { Stats } from 'node:fs';
import path from 'node:path';

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export const pathAccessible = (targetPath: string): Promise<boolean> =>
  fs
    .access(targetPath)
    .then(() => true)
    .catch(() => false);

export const safeRealPath = (targetPath: string): Promise<string> =>
  fs.realpath(targetPath).catch(() => path.resolve(targetPath));

export const normalizePath = (input: string) => path.resolve(input);

export const isSamePath = (a: string, b: string) => path.normalize(a) === path.normalize(b);

export function isSubPath(parent: string, child: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function isParentOrSamePath(candidateParent: string, target: string): boolean {
  return isSamePath(candidateParent, target) || isSubPath(candidateParent, target);
}

export async function ensureFile(filePath: string): Promise<void> {
  const parent = path.dirname(filePath);
  await ensureDir(parent);
  const exists = await pathAccessible(filePath);
  if (!exists) {
    await fs.writeFile(filePath, '', 'utf8');
  }
}

export async function safeLstat(targetPath: string): Promise<Stats | undefined> {
  try {
    return await fs.lstat(targetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

export async function listDirectories(dirPath: string): Promise<string[]> {
  try {
    const items = await fs.readdir(dirPath, { withFileTypes: true });
    return items.filter((item) => item.isDirectory()).map((item) => item.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}
