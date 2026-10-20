import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_MATCHES, searchProject } from './search';

const files = {
  'main.py': 'from utils import greet\nprint(greet("Ada"))\nGREET = 1',
  'utils.py': 'def greet(name):\n    return "hi " + name',
  'notes.txt': 'nothing here',
};

test('finds every match with line and column, files in order', () => {
  const { results, total } = searchProject(files, 'greet');
  assert.equal(total, 4);
  assert.deepEqual(results.map((file) => file.path), ['main.py', 'utils.py']);
  assert.deepEqual(results[0].matches.map((match) => [match.line, match.column]), [[1, 19], [2, 7], [3, 1]]);
});

test('case-sensitive search', () => {
  assert.equal(searchProject(files, 'GREET', true).total, 1);
  assert.equal(searchProject(files, 'GREET', false).total, 4);
});

test('empty query finds nothing and results are capped', () => {
  assert.equal(searchProject(files, '').total, 0);
  const many = { 'a.txt': 'x'.repeat(MAX_MATCHES + 50) };
  const { total, limited } = searchProject(many, 'x');
  assert.equal(total, MAX_MATCHES);
  assert.equal(limited, true);
});
