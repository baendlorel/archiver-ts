import fs from 'node:fs/promises';
import { applyEdits, modify, parse, printParseErrorCode, type ParseError } from 'jsonc-parser';

function ensureTrailingNewline(content: string): string {
  return content.endsWith('\n') ? content : `${content}\n`;
}

async function readFileIfExists(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

export function parseJsoncText<T>(content: string, filePath: string): T {
  const errors: ParseError[] = [];
  const parsed = parse(content, errors, { allowTrailingComma: true });

  if (errors.length > 0) {
    const lines = errors.map((item) => `${printParseErrorCode(item.error)}@${item.offset}`).join(', ');
    throw new Error(`Cannot parse JSONC file ${filePath}: ${lines}`);
  }

  return parsed as T;
}

function applyObjectEdits(source: string, value: object): string {
  let next = source;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const edits = modify(next, [key], item, {
      isArrayInsertion: false,
      formattingOptions: {
        insertSpaces: true,
        tabSize: 2,
        eol: '\n',
      },
    });
    next = applyEdits(next, edits);
  }
  return ensureTrailingNewline(next);
}

export async function readJsoncFile<T>(filePath: string, fallback: T): Promise<T> {
  const content = await readFileIfExists(filePath);
  if (!content || !content.trim()) {
    return fallback;
  }
  return parseJsoncText<T>(content, filePath);
}

export async function ensureJsoncFileWithTemplate(filePath: string, templateRaw: string): Promise<void> {
  const existing = await readFileIfExists(filePath);
  if (existing !== undefined) {
    return;
  }
  await fs.writeFile(filePath, ensureTrailingNewline(templateRaw), 'utf8');
}

export async function writeJsoncFileKeepingComments(
  filePath: string,
  value: object,
  templateRaw: string,
): Promise<void> {
  const existing = await readFileIfExists(filePath);
  const base = existing && existing.trim().length > 0 ? existing : templateRaw;
  parseJsoncText(base, filePath);
  const next = applyObjectEdits(base, value);
  await fs.writeFile(filePath, next, 'utf8');
}
