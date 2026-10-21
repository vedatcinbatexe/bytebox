import assert from 'node:assert/strict';
import { test } from 'node:test';
import { examplePath, findRoutes } from './routes';
import { SERVER_TEMPLATES } from './serverTemplates';

const routesOf = (id: string) =>
  findRoutes(SERVER_TEMPLATES.find((template) => template.id === id)!.files).map((route) => `${route.method} ${route.path}`);

test('finds the endpoints of each server template', () => {
  assert.deepEqual(routesOf('express'), ['GET /api/todos', 'POST /api/todos', 'PATCH /api/todos/:id']);
  assert.deepEqual(routesOf('spring-boot'), ['GET /api/todos', 'POST /api/todos', 'GET /api/todos/{id}']);
  assert.deepEqual(routesOf('aspnet-core'), ['GET /api/todos', 'GET /api/todos/{id:int}', 'POST /api/todos']);
});

test('other styles and example paths', () => {
  const routes = findRoutes({
    'index.js': "const app = require('express')();\napp.use('/users', require('./users'));\napp.delete('/items/:itemId', h);",
    'users.js': "const r = require('express').Router();\nr.get('/', h);\nr.put('/:id', h);\nmodule.exports = r;",
    'Ping.java': '@RestController\npublic class Ping {\n  @GetMapping\n  public String ping() { return "pong"; }\n}',
  });
  assert.deepEqual(
    routes.map((route) => `${route.method} ${route.path}`),
    ['DELETE /items/:itemId', 'GET /users', 'PUT /users/:id', 'GET /'],
  );
  assert.equal(examplePath('/api/todos/{id:int}'), '/api/todos/1');
  assert.equal(examplePath('/users/:id/posts/:postId'), '/users/1/posts/1');
});
