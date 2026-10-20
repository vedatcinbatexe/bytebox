// Find "file:line" references to project files in program output, so they can be links.
// Real examples: File "/tmp/project/main.py", line 2 · /tmp/project/lib/u.js:2:8 ·
// file:///tmp/project/main.ts:2 · Main.java:3: error · main.cpp:2:11 · ./main.go:3:3 · --> main.rs:2:18

export interface Location {
  path: string;
  line: number;
  column: number; // 1 when the output doesn't say
}

export type OutputPiece = { text: string; location?: Location };

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Splits the text into plain pieces and pieces that point at a project file
export function splitLocations(text: string, paths: string[]): OutputPiece[] {
  if (paths.length === 0) return [{ text }];
  // Longest first, so "lib/main.py" wins over "main.py"
  const names = [...paths].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|');
  const pattern = new RegExp(
    `(?<![\\w./-])(?:file://)?(?:/tmp/project/|\\./)?(${names})(?:", line (\\d+)|:(\\d+)(?::(\\d+))?)`,
    'g',
  );

  const pieces: OutputPiece[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) pieces.push({ text: text.slice(last, match.index) });
    const line = Number(match[2] ?? match[3]);
    pieces.push({ text: match[0], location: { path: match[1], line, column: Number(match[4] ?? 1) } });
    last = match.index + match[0].length;
  }
  if (last < text.length) pieces.push({ text: text.slice(last) });
  return pieces;
}

// Every location in the output, in order
export function findLocations(text: string, paths: string[]): Location[] {
  return splitLocations(text, paths).flatMap((piece) => (piece.location ? [piece.location] : []));
}
