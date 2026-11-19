import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPaperQuoteRequestCache } from '../paperQuoteRefresh.ts';
import type { LiveQuote } from '../paperMath.ts';
import { didNetworkReconnect, isNetworkOffline } from '../networkConnectivity.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const quote = (price: number): LiveQuote => ({
  price,
  change: 0,
  pct: 0,
  priceTimestamp: 1_800_000_000,
  fetchedAtMs: 1_800_000_000_000,
});

test('overlapping quote refreshes for the same ticker share one request', async () => {
  const response = deferred<LiveQuote>();
  const requested: string[] = [];
  const fetchQuote = (symbol: string) => {
    requested.push(symbol);
    return response.promise;
  };
  const requestQuote = createPaperQuoteRequestCache(fetchQuote, 5_000, () => 1_800_000_000_000);

  const first = requestQuote('aapl');
  const second = requestQuote('AAPL');
  response.resolve(quote(200));

  assert.deepEqual(await Promise.all([first, second]), [quote(200), quote(200)]);
  assert.deepEqual(requested, ['AAPL']);
});

test('recent quote reuse prevents duplicate navigation refreshes but forced refresh fetches again', async () => {
  let now = 10_000;
  let requests = 0;
  const requestQuote = createPaperQuoteRequestCache(async () => quote(++requests), 5_000, () => now);

  assert.equal((await requestQuote('MSFT')).price, 1);
  assert.equal((await requestQuote('MSFT')).price, 1);
  assert.equal((await requestQuote('MSFT', true)).price, 2);
  now += 5_001;
  assert.equal((await requestQuote('MSFT')).price, 3);
  assert.equal(requests, 3);
});

test('a failed forced refresh keeps the last good quote available until retry', async () => {
  let now = 10_000;
  let requests = 0;
  const requestQuote = createPaperQuoteRequestCache(async () => {
    requests += 1;
    if (requests === 2) throw new Error('network unavailable');
    return quote(requests === 1 ? 300 : 350);
  }, 5_000, () => now);

  assert.equal((await requestQuote('NVDA')).price, 300);
  await assert.rejects(requestQuote('NVDA', true), /network unavailable/);
  assert.equal((await requestQuote('NVDA')).price, 300);
  now += 5_001;
  assert.equal((await requestQuote('NVDA')).price, 350);
  assert.equal(requests, 3);
});

test('network recovery is detected and does not treat an unknown state as confirmed offline', () => {
  assert.equal(isNetworkOffline({ isConnected: false }), true);
  assert.equal(isNetworkOffline({ isConnected: true, isInternetReachable: false }), true);
  assert.equal(isNetworkOffline({ isConnected: true }), false);
  assert.equal(isNetworkOffline({}), false);
  assert.equal(didNetworkReconnect(true, false), true);
  assert.equal(didNetworkReconnect(false, false), false);
  assert.equal(didNetworkReconnect(null, false), false);
});
