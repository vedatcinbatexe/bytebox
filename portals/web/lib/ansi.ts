// Turn program output with ANSI color codes (e.g. "\x1b[31mred\x1b[0m") into colored pieces

export interface AnsiSegment {
  text: string;
  color: string | null; // a CSS color, null = default
  bold: boolean;
}

// Standard colors use the theme's colors where there is one
const COLORS: Record<number, string> = {
  30: 'var(--muted)', // black: invisible on dark themes, so use a gray
  31: 'var(--danger)',
  32: 'var(--success)',
  33: 'var(--warning)',
  34: 'var(--info)',
  35: '#c678dd', // magenta
  36: '#2bb3c0', // cyan
  37: 'var(--fg)', // white
};

// Any escape sequence: CSI (ESC [ ... letter) or a single ESC + character
const ESCAPE = /\x1b\[([0-9;?]*)([A-Za-z])|\x1b[^[]/g;

export function parseAnsi(input: string): AnsiSegment[] {
  const segments: AnsiSegment[] = [];
  let color: string | null = null;
  let bold = false;
  let last = 0;

  function push(text: string) {
    if (!text) return;
    const previous = segments[segments.length - 1];
    if (previous && previous.color === color && previous.bold === bold) previous.text += text;
    else segments.push({ text, color, bold });
  }

  for (const match of input.matchAll(ESCAPE)) {
    push(input.slice(last, match.index));
    last = match.index + match[0].length;
    if (match[2] !== 'm') continue; // cursor moves, clear screen, …: drop them

    const codes = match[1] === '' ? [0] : match[1].split(';').map(Number);
    for (const code of codes) {
      if (code === 0) {
        color = null;
        bold = false;
      } else if (code === 1) bold = true;
      else if (code === 22) bold = false;
      else if (code === 39) color = null;
      else if (COLORS[code]) color = COLORS[code];
      else if (code >= 90 && code <= 97) color = COLORS[code - 60]; // bright colors
    }
  }
  push(input.slice(last));
  return segments;
}

// The output without any escape codes (for copying and downloading)
export function stripAnsi(input: string): string {
  return input.replace(ESCAPE, '');
}
