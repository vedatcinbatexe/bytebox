import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SlidingWindowLimiter } from '../src/limits.js';

test('allows up to the limit per key within the window', () => {
  const limiter = new SlidingWindowLimiter(2, 1000);
  assert.equal(limiter.tryTake('alice', 0), true);
  assert.equal(limiter.tryTake('alice', 100), true);
  assert.equal(limiter.tryTake('alice', 200), false);
  assert.equal(limiter.tryTake('bob', 200), true); // other users are separate
});

test('old events fall out of the window', () => {
  const limiter = new SlidingWindowLimiter(1, 1000);
  assert.equal(limiter.tryTake('alice', 0), true);
  assert.equal(limiter.tryTake('alice', 999), false);
  assert.equal(limiter.tryTake('alice', 1001), true);
});
