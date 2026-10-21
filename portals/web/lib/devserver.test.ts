import assert from 'node:assert/strict';
import { test } from 'node:test';
import { serverFramework } from './devserver';
import { SERVER_TEMPLATES } from './serverTemplates';

test('server templates are recognized as servers, other projects are not', () => {
  assert.deepEqual(
    SERVER_TEMPLATES.map((template) => serverFramework(template.files)),
    ['Node.js', 'Spring Boot', 'ASP.NET Core'],
  );
  assert.equal(serverFramework({ 'main.py': 'print(1)' }), null);
  assert.equal(serverFramework({ 'package.json': JSON.stringify({ dependencies: { react: '18.3.1' } }) }), null);
  assert.equal(serverFramework({ 'package.json': '{ broken' }), null);
  assert.equal(serverFramework({ 'Main.java': 'class Main {}' }), null);
});
