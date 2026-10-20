// Test cases (input → expected output) stored in a normal project file, so they are
// saved, shared, forked, versioned and synced with the terminal like everything else.

export const TESTS_FILE = 'bytebox.tests.json';
export const MAX_TESTS = 20;

export interface TestCase {
  name: string;
  stdin: string;
  expected: string;
}

// Reads the tests file; ignores anything that isn't a list of test cases
export function parseTests(files: Record<string, string>): TestCase[] {
  try {
    const data = JSON.parse(files[TESTS_FILE] ?? '[]');
    if (!Array.isArray(data)) return [];
    return data.slice(0, MAX_TESTS).map((item, index) => ({
      name: typeof item?.name === 'string' ? item.name : `Test ${index + 1}`,
      stdin: typeof item?.stdin === 'string' ? item.stdin : '',
      expected: typeof item?.expected === 'string' ? item.expected : '',
    }));
  } catch {
    return [];
  }
}

export function serializeTests(tests: TestCase[]): string {
  return `${JSON.stringify(tests, null, 2)}\n`;
}

// Trailing spaces on each line and trailing blank lines don't count
function normalize(output: string): string {
  return output
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n+$/, '');
}

export function outputsMatch(expected: string, actual: string): boolean {
  return normalize(expected) === normalize(actual);
}
