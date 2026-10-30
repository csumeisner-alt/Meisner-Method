import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  fetchPortfolioQuotes,
  startPortfolioTradesLoad,
  type PortfolioTradeLoadEvent,
} from '../portfolioLoading.ts';
import type { Quote, Trade } from '../portfolioMath.ts';

const cachedTrade: Trade = {
  id: 'cache-1',
  symbol: 'VOO',
  type: 'buy',
  shares: 2,
  pricePerShare: 400,
  date: '2026-01-01T00:00:00.000Z',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test('cached trades appear before the server and remain available offline', async () => {
  const server = deferred<Trade[]>();
  const events: PortfolioTradeLoadEvent[] = [];
  let resolveServerError!: () => void;
  const serverError = new Promise<void>((resolve) => {
    resolveServerError = resolve;
  });

  startPortfolioTradesLoad(
    async () => [cachedTrade],
    () => server.promise,
    (event) => {
      events.push(event);
      if (event.source === 'server-error') resolveServerError();
    },
  );

  await Promise.resolve();
  assert.deepEqual(events, [{ source: 'cache', trades: [cachedTrade] }]);

  server.reject(new Error('offline'));
  await serverError;
  assert.deepEqual(events[1], { source: 'server-error' });
});

test('a late cache read cannot overwrite newer server trades', async () => {
  const cache = deferred<Trade[]>();
  const latest: Trade = { ...cachedTrade, id: 'server-1', shares: 5 };
  const events: PortfolioTradeLoadEvent[] = [];

  startPortfolioTradesLoad(
    () => cache.promise,
    async () => [latest],
    (event) => events.push(event),
  );

  await Promise.resolve();
  assert.deepEqual(events, [{ source: 'server', trades: [latest] }]);

  cache.resolve([cachedTrade]);
  await Promise.resolve();
  assert.equal(events.length, 1);
});

test('portfolio quotes use one deduplicated batch and apply successful symbols only', async () => {
  const requests: string[][] = [];
  const updates: Array<[string, Quote]> = [];
  await fetchPortfolioQuotes(
    ['VOO', 'AAPL', 'VOO'],
    async (symbols) => {
      requests.push(symbols);
      return {
        quotes: [
          { symbol: 'VOO', currentPrice: 500, priceChange: 1, priceChangePercent: 0.2 },
        ],
        unavailableSymbols: ['AAPL'],
      };
    },
    (symbol, quote) => updates.push([symbol, quote]),
  );

  assert.deepEqual(requests, [['VOO', 'AAPL']]);
  const voo: Quote = { currentPrice: 500, priceChange: 1, priceChangePercent: 0.2 };
  assert.deepEqual(updates, [['VOO', voo]]);
});

test('Portfolio screen wires cache-first trades and batched quote updates', () => {
  const screen = readFileSync('app/portfolio.tsx', 'utf8');
  assert.match(screen, /startPortfolioTradesLoad\(/);
  assert.match(screen, /event\.source === 'cache' && event\.trades\.length === 0/);
  assert.match(screen, /fetchPortfolioQuotes\(/);
  assert.match(screen, /apiFetch<PortfolioQuoteBatch>\('\/api\/stocks\/quotes'/);
  assert.match(screen, /setQuotes\(previous => \(\{ \.\.\.previous, \[symbol\]: quote \}\)\)/);
});
