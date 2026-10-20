import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canFormat, formatCode } from './format';

test('formats JavaScript', async () => {
  const messy = 'function add(a,b){return a+b}\nif(true){console.log("x")}else{console.log("y")}';
  assert.equal(
    await formatCode('app.js', messy),
    "function add(a, b) {\n  return a + b;\n}\nif (true) {\n  console.log('x');\n} else {\n  console.log('y');\n}\n",
  );
});

test('formats CSS, JSON and HTML with inline script', async () => {
  assert.equal(await formatCode('style.css', 'body{color:red;margin:0}'), 'body {\n  color: red;\n  margin: 0;\n}\n');
  assert.equal(await formatCode('data.json', '{"a":1,"b":[1,2]}'), '{ "a": 1, "b": [1, 2] }\n');
  const html = await formatCode('index.html', '<div><p>hi</p></div><script>let x=1</script>');
  assert.match(html, /<script>\n\s+let x = 1;\n\s*<\/script>/);
});

test('reports syntax errors and unsupported files', async () => {
  await assert.rejects(formatCode('broken.js', 'function ('), /Can’t format/);
  assert.equal(canFormat('main.py'), false);
  assert.equal(canFormat('README.md'), true);
});
