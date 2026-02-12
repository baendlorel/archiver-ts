export interface FullscreenLayoutOptions {
  contentLines: string[];
  footerLines?: string[];
  rows?: number;
}

function resolveRows(rows?: number): number {
  if (typeof rows === 'number' && Number.isFinite(rows) && rows > 0) {
    return Math.floor(rows);
  }
  return 24;
}

export function layoutFullscreenLines(options: FullscreenLayoutOptions): string[] {
  const contentLines = options.contentLines.length > 0 ? options.contentLines : [''];
  const footerLines = options.footerLines ?? [];
  const rows = resolveRows(options.rows);
  const fillCount = Math.max(rows - contentLines.length - footerLines.length, 0);

  return [...contentLines, ...Array.from({ length: fillCount }, () => ''), ...footerLines];
}
