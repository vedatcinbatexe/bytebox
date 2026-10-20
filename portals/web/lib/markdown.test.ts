import assert from 'node:assert/strict';
import { test } from 'node:test';
import { markdownDocument } from './markdown';

const colors = { background: '#000000', text: '#ffffff', muted: '#888888', border: '#333333', code: '#111111', link: '#00ff00' };

test('renders Markdown with GitHub extras like tables', () => {
  const html = markdownDocument('# Title\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] done', colors);
  assert.match(html, /<h1[^>]*>Title<\/h1>/);
  assert.match(html, /<table>/);
  assert.match(html, /type="checkbox"/);
});

test('blocks scripts with a CSP and uses the theme colors', () => {
  const html = markdownDocument('<script>alert(1)</script>', colors);
  assert.match(html, /Content-Security-Policy" content="default-src 'none'/);
  assert.match(html, /background: #000000/);
});
