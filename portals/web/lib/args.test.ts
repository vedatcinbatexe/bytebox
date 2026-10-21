import assert from 'node:assert/strict';
import { test } from 'node:test';
import { splitArgs } from './args';

test('splits on spaces and keeps quoted parts together', () => {
  assert.deepEqual(splitArgs('  --name "Ada Lovelace"  -v '), ['--name', 'Ada Lovelace', '-v']);
  assert.deepEqual(splitArgs(`a"b c"d 'x y'`), ['ab cd', 'x y']); // quotes can sit inside an argument
  assert.deepEqual(splitArgs(`'' x`), ['', 'x']); // an empty quoted argument still counts
  assert.deepEqual(splitArgs(''), []);
});
