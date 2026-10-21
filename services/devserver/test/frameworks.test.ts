import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectFramework, type Framework } from '../src/frameworks.ts';

function detect(files: Record<string, string>): Framework {
  const result = detectFramework(Object.entries(files).map(([path, content]) => ({ path, content })));
  if ('error' in result) assert.fail(result.error);
  return result;
}

test('Express: links the pre-installed packages and warns about others', () => {
  const node = detect({
    'package.json': JSON.stringify({ dependencies: { express: '^5.1.0', mongoose: '^8' } }),
    'server.js': "require('express')",
  });
  assert.equal(node.id, 'node');
  assert.equal(node.script, 'ln -sfn /opt/deps/node_modules node_modules && exec node server.js');
  assert.match(node.warnings[0], /"mongoose" isn’t installed/);

  const withStart = detect({ 'package.json': JSON.stringify({ scripts: { start: 'node src/app.js' } }), 'src/app.js': '' });
  assert.match(withStart.script, /exec node src\/app\.js$/);
});

test('Spring Boot: compiles with javac and runs the @SpringBootApplication class', () => {
  const spring = detect({
    'pom.xml': '<project/>',
    'src/main/java/com/example/demo/DemoApplication.java': 'package com.example.demo;\n@SpringBootApplication\npublic class DemoApplication {}',
    'src/main/java/com/example/demo/TodoController.java': 'package com.example.demo;',
    'src/main/resources/application.properties': '',
    'src/test/java/com/example/demo/DemoTests.java': 'package com.example.demo;',
  });
  assert.equal(spring.id, 'spring');
  assert.match(spring.script, /-parameters/);
  assert.match(spring.script, /DemoApplication\.java src\/main\/java\/com\/example\/demo\/TodoController\.java"? *&&/);
  assert.doesNotMatch(spring.script, /src\/test/);
  assert.match(spring.script, /"\/tmp\/classes:src\/main\/resources:\/opt\/spring\/lib\/\*" com\.example\.demo\.DemoApplication$/);
});

test('ASP.NET Core: dotnet run on the .csproj', () => {
  const dotnet = detect({ 'Api.csproj': '<Project Sdk="Microsoft.NET.Sdk.Web"></Project>', 'Program.cs': '' });
  assert.equal(dotnet.script, 'exec dotnet run --project Api.csproj');
  assert.deepEqual(dotnet.warnings, []);
});

test('other projects explain what is missing', () => {
  const error = (files: Record<string, string>) =>
    (detectFramework(Object.entries(files).map(([path, content]) => ({ path, content }))) as { error: string }).error;
  assert.match(error({ 'main.py': 'print(1)' }), /isn’t a server project/);
  assert.match(error({ 'pom.xml': '', 'Main.java': 'class Main {}' }), /@SpringBootApplication/);
  assert.match(error({ 'package.json': '{ broken' }), /not valid JSON/);
  // A React app has a package.json too, but no server
  assert.match(error({ 'package.json': JSON.stringify({ dependencies: { react: '18.3.1' } }) }), /isn’t a server/);
});
