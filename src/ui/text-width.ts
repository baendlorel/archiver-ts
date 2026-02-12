export function getCharDisplayWidth(char: string): number {
  const code = char.codePointAt(0);
  if (code === undefined) {
    return 0;
  }
  if (code <= 0x1f || (code >= 0x7f && code <= 0xa0)) {
    return 0;
  }

  // Treat CJK/full-width code points as width 2 in terminal alignment.
  if (
    code >= 0x1100 &&
    (code <= 0x115f ||
      code === 0x2329 ||
      code === 0x232a ||
      (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe10 && code <= 0xfe19) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x20000 && code <= 0x2fffd) ||
      (code >= 0x30000 && code <= 0x3fffd))
  ) {
    return 2;
  }

  return 1;
}

export function getDisplayWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    width += getCharDisplayWidth(char);
  }
  return width;
}

export function padDisplayWidth(text: string, targetWidth: number): string {
  const width = getDisplayWidth(text);
  const pad = Math.max(targetWidth - width, 0);
  return `${text}${' '.repeat(pad)}`;
}
