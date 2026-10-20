// Short tips for common problems, shown under the output of a run
import type { Run } from './runs';

interface Rule {
  // Matched against stderr + stdout
  pattern: RegExp;
  hint: (match: RegExpMatchArray, stdin: string) => string | null;
}

const RULES: Rule[] = [
  {
    // Python input(), Java Scanner, C++/Go/Rust reading past the end
    pattern: /EOFError|EOF when reading a line|NoSuchElementException|unexpected end of file/,
    hint: (_, stdin) =>
      stdin.trim() === ''
        ? 'Your program asked for input, but Input (stdin) is empty. Type the input in the box above and run again.'
        : 'Your program asked for more input lines than Input (stdin) has. Add more lines there.',
  },
  {
    pattern: /ModuleNotFoundError: No module named '([\w.]+)'/,
    hint: (match) =>
      `"${match[1]}" isn't available: runs have no internet, so only Python's standard library can be used. If it's your own file, check its name and folder.`,
  },
  {
    pattern: /Cannot find module '([^'.][^']*)'/,
    hint: (match) =>
      `"${match[1]}" isn't available: runs have no internet, so npm packages can't be installed. Node's built-in modules (fs, path, …) work.`,
  },
  {
    pattern: /RecursionError|StackOverflowError|Maximum call stack size exceeded|stack overflow/,
    hint: () => 'A function keeps calling itself without stopping. Check that your recursion has a base case.',
  },
  {
    pattern: /IndentationError|TabError/,
    hint: () => 'Python is strict about indentation: use the same number of spaces in a block and don’t mix tabs and spaces.',
  },
  {
    pattern: /class (\w+) is public, should be declared in a file named (\w+\.java)/,
    hint: (match) => `In Java a public class must live in a file with its name: rename the file to ${match[2]}.`,
  },
  {
    pattern: /declared and not used: (\w+)|"(\w+)" imported and not used/,
    hint: () => 'Go doesn’t allow unused variables or imports. Use them, remove them, or assign to _.',
  },
  {
    pattern: /Temporary failure in name resolution|getaddrinfo|ENOTFOUND|Network is unreachable|UnknownHostException/,
    hint: () => 'Runs are offline (no network) for safety, so web requests can’t work here.',
  },
];

export function hintFor(run: Run, stdin: string): string | null {
  if (run.status === 'TIMED_OUT') {
    return 'The program ran too long. Look for a loop that never ends, or a program waiting for input it never gets.';
  }
  if (run.status === 'MEMORY_EXCEEDED') {
    return 'The program used too much memory. Look for lists that grow forever or very large data.';
  }
  const output = `${run.stderr}\n${run.stdout}`;
  for (const rule of RULES) {
    const match = output.match(rule.pattern);
    if (match) return rule.hint(match, stdin);
  }
  return null;
}
