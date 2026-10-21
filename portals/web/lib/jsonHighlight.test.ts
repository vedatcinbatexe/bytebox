import assert from 'node:assert/strict';
import { test } from 'node:test';
import { highlightJson } from './jsonHighlight';

test('keys, strings, numbers and literals get their own kind, and the text stays the same', () => {
  const text = '{\n  "id": 2,\n  "title": "Say \\"hi\\"",\n  "done": false,\n  "score": -1.5e3,\n  "next": null\n}';
  const tokens = highlightJson(text);
  assert.equal(tokens.map((token) => token.text).join(''), text);
  const kinds = tokens.filter((token) => token.kind !== 'plain').map((token) => `${token.kind}:${token.text}`);
  assert.deepEqual(kinds, [
    'key:"id"', 'number:2', 'key:"title"', 'string:"Say \\"hi\\""', 'key:"done"', 'literal:false',
    'key:"score"', 'number:-1.5e3', 'key:"next"', 'literal:null',
  ]);
});
