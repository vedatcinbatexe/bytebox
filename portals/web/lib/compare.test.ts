import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareFiles } from './compare';

test('finds added, deleted, changed and unchanged files', () => {
  const before = { 'main.py': 'print(1)', 'old.py': 'x', 'same.py': 's' };
  const after = { 'main.py': 'print(2)', 'new.py': 'y', 'same.py': 's' };
  assert.deepEqual(compareFiles(before, after), [
    { path: 'main.py', change: 'changed' },
    { path: 'new.py', change: 'added' },
    { path: 'old.py', change: 'deleted' },
    { path: 'same.py', change: 'same' },
  ]);
});
