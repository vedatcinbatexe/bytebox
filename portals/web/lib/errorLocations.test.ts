import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findLocations, splitLocations } from './errorLocations';

const at = (path: string, line: number, column = 1) => ({ path, line, column });

test('finds locations in real error output of every language', () => {
  const cases: [string, string[], ReturnType<typeof at>[]][] = [
    [
      'Traceback (most recent call last):\n  File "/tmp/project/main.py", line 2, in <module>\n  File "/tmp/project/lib/util.py", line 2, in f\nZeroDivisionError',
      ['main.py', 'lib/util.py'],
      [at('main.py', 2), at('lib/util.py', 2)],
    ],
    [
      "/tmp/project/lib/u.js:2\n    at exports.f (/tmp/project/lib/u.js:2:8)\n    at Module._compile (node:internal/modules/cjs/loader:1929:14)",
      ['main.js', 'lib/u.js'],
      [at('lib/u.js', 2), at('lib/u.js', 2, 8)],
    ],
    ['file:///tmp/project/main.ts:2\n    at Object.<anonymous> (file:///tmp/project/main.ts:2:7)', ['main.ts'], [at('main.ts', 2), at('main.ts', 2, 7)]],
    ['Main.java:3: error: incompatible types\n\tat Main.main(Main.java:4)', ['Main.java'], [at('Main.java', 3), at('Main.java', 4)]],
    ["main.cpp: In function 'int main()':\nmain.cpp:2:11: error: expected", ['main.cpp'], [at('main.cpp', 2, 11)]],
    ['# command-line-arguments\n./main.go:3:3: declared and not used: x', ['main.go'], [at('main.go', 3, 3)]],
    ['error[E0308]: mismatched types\n --> main.rs:2:18', ['main.rs'], [at('main.rs', 2, 18)]],
  ];
  for (const [output, paths, expected] of cases) assert.deepEqual(findLocations(output, paths), expected, output);
});

test('only project files count, and the text is kept whole', () => {
  const output = 'see notmain.py:3 and other.py:4 and main.py:5!';
  const pieces = splitLocations(output, ['main.py']);
  assert.equal(pieces.map((piece) => piece.text).join(''), output);
  assert.deepEqual(
    pieces.filter((piece) => piece.location).map((piece) => piece.location),
    [at('main.py', 5)],
  );
});
