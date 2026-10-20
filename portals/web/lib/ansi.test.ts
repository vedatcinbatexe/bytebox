import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseAnsi, stripAnsi } from './ansi';

test('plain text is one segment', () => {
  assert.deepEqual(parseAnsi('hello\n'), [{ text: 'hello\n', color: null, bold: false }]);
});

test('colors, bold, bright colors and reset', () => {
  const segments = parseAnsi('\x1b[31mred\x1b[0m plain \x1b[1;92mok\x1b[22m!\x1b[39m end');
  assert.deepEqual(segments, [
    { text: 'red', color: 'var(--danger)', bold: false },
    { text: ' plain ', color: null, bold: false },
    { text: 'ok', color: 'var(--success)', bold: true },
    { text: '!', color: 'var(--success)', bold: false },
    { text: ' end', color: null, bold: false },
  ]);
});

test('other escape codes are dropped', () => {
  assert.deepEqual(parseAnsi('\x1b[2J\x1b[Hdone\x1b[K'), [{ text: 'done', color: null, bold: false }]);
  assert.equal(stripAnsi('\x1b[1;34mblue\x1b[m text'), 'blue text');
});
