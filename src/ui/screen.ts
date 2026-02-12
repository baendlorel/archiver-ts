export interface FullscreenLayoutOptions {
  contentLines: string[];
  footerLines?: string[];
  rows?: number;
}

export interface FullscreenHintStatusLayoutOptions {
  contentLines: string[];
  hintLine?: string;
  statusLine?: string;
  rows?: number;
}

export interface TerminalSize {
  rows: number;
  columns: number;
}

function resolveSizeValue(value: number | undefined, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return fallback;
}

export function resolveTerminalSize(options: { rows?: number; columns?: number } = {}): TerminalSize {
  return {
    rows: resolveSizeValue(options.rows, 24),
    columns: resolveSizeValue(options.columns, 80),
  };
}

export function isTerminalSizeEnough(size: TerminalSize, minimum: TerminalSize): boolean {
  return size.rows >= minimum.rows && size.columns >= minimum.columns;
}

export function layoutFullscreenLines(options: FullscreenLayoutOptions): string[] {
  const contentLines = options.contentLines.length > 0 ? options.contentLines : [''];
  const footerLines = options.footerLines ?? [];
  const rows = resolveTerminalSize({ rows: options.rows }).rows;
  const fillCount = Math.max(rows - contentLines.length - footerLines.length, 0);

  return [...contentLines, ...Array.from({ length: fillCount }, () => ''), ...footerLines];
}

export function layoutFullscreenHintStatusLines(options: FullscreenHintStatusLayoutOptions): string[] {
  return layoutFullscreenLines({
    contentLines: options.contentLines,
    footerLines: [options.hintLine ?? '', options.statusLine ?? ''],
    rows: options.rows,
  });
}
