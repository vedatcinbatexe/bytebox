import assert from 'node:assert/strict';
import { test } from 'node:test';
import { route, withoutSessionCookie } from '../src/proxy.ts';

const id = 'a'.repeat(24);

test('requests are routed by the preview path, or by the page they come from', () => {
  assert.deepEqual(route(`/preview/${id}/api/todos?done=1`, undefined), { id, path: '/api/todos?done=1' });
  assert.deepEqual(route(`/preview/${id}`, undefined), { id, path: '/' });
  assert.deepEqual(route('/api/todos', `http://localhost:4300/preview/${id}/index.html`), { id, path: '/api/todos' });
  assert.equal(route('/api/todos', 'http://localhost:3000/p/abc'), null);
  assert.equal(route('/preview/not-an-id/', undefined), null);
});

test('the Bytebox session cookie is removed, other cookies are kept', () => {
  assert.equal(withoutSessionCookie('bytebox_session=secret; theme=dark'), 'theme=dark');
  assert.equal(withoutSessionCookie('bytebox_session=secret'), undefined);
  assert.equal(withoutSessionCookie(undefined), undefined);
});
