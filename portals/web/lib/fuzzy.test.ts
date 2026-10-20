import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fuzzyFilter, fuzzyScore } from './fuzzy';

test('letters must appear in order', () => {
  assert.notEqual(fuzzyScore('fmt', 'Format the open file'), null);
  assert.equal(fuzzyScore('xyz', 'Format the open file'), null);
  assert.equal(fuzzyScore('tmf', 'Format'), null);
});

test('substrings rank above scattered matches', () => {
  const items = ['utils/greet.py', 'Run the open file', 'greet.js'];
  assert.deepEqual(fuzzyFilter(items, 'greet', (item) => item), ['greet.js', 'utils/greet.py']);
});

test('empty query keeps everything in order', () => {
  assert.deepEqual(fuzzyFilter(['b', 'a'], '', (item) => item), ['b', 'a']);
});
