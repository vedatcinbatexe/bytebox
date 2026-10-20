import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPreviewDocument, htmlFiles } from './preview';

const files = {
  'index.html':
    '<html><head><link rel="stylesheet" href="css/site.css"></head><body><script src="./js/app.js"></script></body></html>',
  'css/site.css': 'body { color: red; }',
  'js/app.js': 'console.log("</script> inside a string");',
  'pages/about.html': '<link rel="stylesheet" href="../css/site.css"><p>About</p>',
};

test('inlines linked CSS and JS from the project', () => {
  const html = buildPreviewDocument(files, 'index.html');
  assert.match(html, /<style data-file="css\/site.css">\s*body \{ color: red; \}/);
  assert.match(html, /<script data-file="js\/app.js">/);
  assert.doesNotMatch(html, /src="\.\/js\/app.js"/);
});

test('escapes </script> inside inlined code', () => {
  const html = buildPreviewDocument(files, 'index.html');
  assert.match(html, /<\\\/script> inside a string/);
});

test('resolves paths relative to the HTML file', () => {
  const html = buildPreviewDocument(files, 'pages/about.html');
  assert.match(html, /body \{ color: red; \}/);
});

test('injects the console bridge and keeps external links', () => {
  const html = buildPreviewDocument(
    { 'index.html': '<head><link rel="stylesheet" href="https://cdn.example/x.css"></head>' },
    'index.html',
  );
  assert.match(html, /bytebox-preview/);
  assert.match(html, /href="https:\/\/cdn.example\/x.css"/);
});

test('lists HTML files with index.html first', () => {
  assert.deepEqual(htmlFiles(files), ['index.html', 'pages/about.html']);
});
