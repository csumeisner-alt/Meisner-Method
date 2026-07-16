import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withTimeout, SSOTimeoutError } from '../withTimeout.ts';

test('rejects with SSOTimeoutError when the promise never settles', async () => {
  const never = new Promise<string>(() => {});
  await assert.rejects(withTimeout(never, 10), (err: unknown) => {
    assert.ok(err instanceof SSOTimeoutError);
    assert.equal((err as Error).name, 'SSOTimeoutError');
    assert.equal((err as Error).message, 'Sign-in timed out, please try again.');
    return true;
  });
});

test('resolves with the value when the promise settles before the timeout', async () => {
  const result = await withTimeout(Promise.resolve('ok'), 1000);
  assert.equal(result, 'ok');
});

test('resolves with a delayed value that still beats the timeout', async () => {
  const delayed = new Promise<number>((resolve) => setTimeout(() => resolve(42), 10));
  assert.equal(await withTimeout(delayed, 1000), 42);
});

test('propagates the original rejection when it happens before the timeout', async () => {
  const boom = new Error('original failure');
  await assert.rejects(withTimeout(Promise.reject(boom), 1000), (err: unknown) => {
    assert.equal(err, boom);
    assert.ok(!(err instanceof SSOTimeoutError));
    return true;
  });
});

test('resolution after the deadline still yields a timeout error', async () => {
  const slow = new Promise<string>((resolve) => setTimeout(() => resolve('late'), 50));
  await assert.rejects(withTimeout(slow, 5), SSOTimeoutError);
  await slow; // let the timer finish so the runner exits cleanly
});
