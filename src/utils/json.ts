import fs from 'node:fs/promises';

export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  const rendered = `${JSON.stringify(value, null, 2)}\n`;
  await fs.writeFile(filePath, rendered, 'utf8');
}

export async function readJsonLinesFile<T>(filePath: string): Promise<T[]> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    if (!content.trim()) {
      return [];
    }

    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    return lines.map((line, index) => {
      try {
        return JSON.parse(line) as T;
      } catch {
        throw new Error(`Invalid JSONL line ${index + 1} in ${filePath}`);
      }
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function writeJsonLinesFile(filePath: string, rows: unknown[]): Promise<void> {
  const content = rows.map((row) => JSON.stringify(row)).join('\n');
  await fs.writeFile(filePath, content.length > 0 ? `${content}\n` : '', 'utf8');
}

export async function appendJsonLine(filePath: string, row: unknown): Promise<void> {
  await fs.appendFile(filePath, `${JSON.stringify(row)}\n`, 'utf8');
}
