import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_TESTS, TESTS_FILE, outputsMatch, parseTests, serializeTests } from './tests';

test('round trip through the tests file', () => {
  const tests = [{ name: 'adds', stdin: '2 3', expected: '5\n' }];
  assert.deepEqual(parseTests({ [TESTS_FILE]: serializeTests(tests) }), tests);
});

test('missing, broken or odd files give no tests, and fields get defaults', () => {
  assert.deepEqual(parseTests({}), []);
  assert.deepEqual(parseTests({ [TESTS_FILE]: '{not json' }), []);
  assert.deepEqual(parseTests({ [TESTS_FILE]: '{"name": "x"}' }), []);
  assert.deepEqual(parseTests({ [TESTS_FILE]: '[{}]' }), [{ name: 'Test 1', stdin: '', expected: '' }]);
  const many = JSON.stringify(Array.from({ length: 30 }, () => ({})));
  assert.equal(parseTests({ [TESTS_FILE]: many }).length, MAX_TESTS);
});

test('outputs match ignoring trailing spaces and blank lines', () => {
  assert.equal(outputsMatch('5', '5\n'), true);
  assert.equal(outputsMatch('a\nb', 'a  \nb\n\n'), true);
  assert.equal(outputsMatch('a\r\nb', 'a\nb'), true);
  assert.equal(outputsMatch('5', '6'), false);
  assert.equal(outputsMatch(' 5', '5'), false); // leading spaces do count
});
