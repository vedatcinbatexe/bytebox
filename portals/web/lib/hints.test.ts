import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hintFor } from './hints';
import type { Run } from './runs';

const run = (fields: Partial<Run>): Run => ({
  id: '1',
  entryFile: 'main.py',
  status: 'COMPLETED',
  exitCode: 1,
  stdout: '',
  stderr: '',
  truncated: false,
  timeMs: 10,
  ...fields,
});

test('input errors depend on whether stdin is empty', () => {
  const failed = run({ stderr: 'Traceback…\nEOFError: EOF when reading a line' });
  assert.match(hintFor(failed, '')!, /Input \(stdin\) is empty/);
  assert.match(hintFor(failed, 'Ada')!, /more input lines/);
});

test('known problems get a hint, other errors do not', () => {
  assert.match(hintFor(run({ stderr: "ModuleNotFoundError: No module named 'numpy'" }), '')!, /"numpy" isn't available/);
  assert.match(hintFor(run({ stderr: "Error: Cannot find module 'lodash'" }), '')!, /npm packages/);
  assert.equal(hintFor(run({ stderr: "Error: Cannot find module './util'" }), ''), null); // own file: no package hint
  assert.match(hintFor(run({ stderr: './main.go:3:3: declared and not used: x' }), '')!, /unused/);
  assert.match(hintFor(run({ status: 'TIMED_OUT', exitCode: null }), '')!, /ran too long/);
  assert.equal(hintFor(run({ stderr: 'ZeroDivisionError: division by zero' }), ''), null);
});
