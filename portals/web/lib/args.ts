// Split command-line arguments like a shell does for simple cases:
// spaces separate arguments, "double" or 'single' quotes keep spaces inside one.
export function splitArgs(text: string): string[] {
  const args: string[] = [];
  let current = '';
  let inArg = false;
  let quote: string | null = null;

  for (const char of text) {
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
    } else if (char === '"' || char === "'") {
      quote = char;
      inArg = true;
    } else if (/\s/.test(char)) {
      if (inArg) args.push(current);
      current = '';
      inArg = false;
    } else {
      current += char;
      inArg = true;
    }
  }
  if (inArg) args.push(current);
  return args;
}
