import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { sendApiRequest } from '../src/apiRequest.ts';

// A tiny server that echoes what it got
const echo = createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    res.writeHead(req.url === '/missing' ? 404 : 201, { 'Content-Type': 'application/json', 'X-Test': 'yes' });
    res.end(JSON.stringify({ method: req.method, url: req.url, body, auth: req.headers.authorization ?? null }));
  });
});
let port = 0;
before(async () => {
  await new Promise<void>((resolve) => echo.listen(0, resolve));
  port = (echo.address() as AddressInfo).port;
});
after(() => echo.close());

test('sends method, path, headers and body, and returns the whole answer', async () => {
  const response = await sendApiRequest('127.0.0.1', port, {
    id: 7,
    method: 'post',
    path: '/api/todos?x=1',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer abc', 'Bad Name': 'skipped' },
    body: '{"title":"Hi"}',
  });
  assert.equal(response.id, 7);
  assert.equal(response.status, 201);
  assert.equal(response.headers['x-test'], 'yes');
  assert.deepEqual(JSON.parse(response.body), { method: 'POST', url: '/api/todos?x=1', body: '{"title":"Hi"}', auth: 'Bearer abc' });
  assert.ok(response.sizeBytes > 0);
});

test('bad input and unreachable servers come back as errors, not exceptions', async () => {
  assert.match((await sendApiRequest('127.0.0.1', port, { id: 1, method: 'TRACE', path: '/', headers: {}, body: '' })).error!, /Unsupported/);
  assert.match((await sendApiRequest('127.0.0.1', port, { id: 1, method: 'GET', path: 'no-slash', headers: {}, body: '' })).error!, /must start with/);
  const down = await sendApiRequest('127.0.0.1', 1, { id: 2, method: 'GET', path: '/', headers: {}, body: '' });
  assert.equal(down.status, 0);
  assert.ok(down.error);
  assert.equal((await sendApiRequest('127.0.0.1', port, { id: 3, method: 'GET', path: '/missing', headers: {}, body: '' })).status, 404);
});
