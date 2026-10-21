// Splits JSON text into colored pieces for the API tester's response view
export type JsonToken = { text: string; kind: 'key' | 'string' | 'number' | 'literal' | 'plain' };

// A string followed by ":" is a key; true/false/null are literals
const TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/g;

export function highlightJson(text: string): JsonToken[] {
  const tokens: JsonToken[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    if (match.index > last) tokens.push({ text: text.slice(last, match.index), kind: 'plain' });
    if (match[1]) {
      tokens.push({ text: match[1], kind: match[2] ? 'key' : 'string' });
      if (match[2]) tokens.push({ text: match[2], kind: 'plain' });
    } else if (match[3]) {
      tokens.push({ text: match[3], kind: 'number' });
    } else {
      tokens.push({ text: match[4], kind: 'literal' });
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) tokens.push({ text: text.slice(last), kind: 'plain' });
  return tokens;
}
