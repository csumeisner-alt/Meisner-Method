import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  formatPaperOrderFillTime,
  type PaperAccount,
  type PaperLot,
  type PaperOrder,
  type PaperPosition,
  type PaperTransaction,
} from '../paperMath.ts';
import { fillOrder } from '../paperEngine.ts';
import { runPaperAccountQuoteRefresh } from '../paperQuoteRefresh.ts';

const screenSource = readFileSync('app/(tabs)/paper.tsx', 'utf8');

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

test('active quote refreshes evaluate device-local pending orders after resume', () => {
  assert.match(
    screenSource,
    /runPaperAccountQuoteRefresh\(\s*accountId,\s*quoteRefreshPromisesRef\.current,\s*quoteRefreshEvaluateRequestedRef\.current,\s*evaluateOrders,/,
  );
  assert.match(screenSource, /fetchQuotes\(positionsRef\.current, activeIdRef\.current, true, forceRefresh\)/);
  assert.match(screenSource, /if \(resumed\) refresh\(true\)/);
});

test('overlapping scheduled and resume refreshes commit one consistent fill', async () => {
  const response = deferred<void>();
  const inFlight = new Map<string, Promise<void>>();
  const evaluateRequested = new Set<string>();
  let refreshCount = 0;
  let account: PaperAccount = {
    id: 'account-1',
    name: 'Test',
    cash: 1_000,
    createdAt: '2025-01-01T00:00:00.000Z',
  };
  let positions: PaperPosition[] = [];
  let lots: PaperLot[] = [];
  let transactions: PaperTransaction[] = [];
  let order: PaperOrder = {
    id: 'order-1',
    accountId: account.id,
    symbol: 'AAPL',
    companyName: 'Apple',
    orderType: 'limit',
    side: 'buy',
    shares: 5,
    limitPrice: 10,
    status: 'pending',
    placedAt: '2025-01-01T00:00:00.000Z',
  };

  const refresh = async () => {
    refreshCount += 1;
    await response.promise;
  };
  const evaluate = () => {
    if (order.status !== 'pending') return;
    const result = fillOrder({
      order,
      fillPrice: 10,
      executionQuotePrice: 10,
      filledAt: '2025-01-02T00:00:00.000Z',
      account,
      positions,
      lots,
      uid: () => 'generated-id',
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    account = result.updatedAccount;
    positions = result.updatedPositions;
    lots = result.updatedLots;
    transactions = [...transactions, result.newTransaction];
    order = { ...order, status: 'filled', filledPrice: 10, filledAt: '2025-01-02T00:00:00.000Z' };
  };

  const scheduled = runPaperAccountQuoteRefresh(
    account.id, inFlight, evaluateRequested, false, refresh, evaluate,
  );
  const resumed = runPaperAccountQuoteRefresh(
    account.id, inFlight, evaluateRequested, true, refresh, evaluate,
  );
  response.resolve();
  await Promise.all([scheduled, resumed]);

  assert.equal(refreshCount, 1);
  assert.equal(order.status, 'filled');
  assert.equal(account.cash, 950);
  assert.deepEqual(positions.map(({ symbol, shares }) => ({ symbol, shares })), [
    { symbol: 'AAPL', shares: 5 },
  ]);
  assert.equal(transactions.length, 1);
  assert.equal(transactions[0].total, 50);
  assert.equal(evaluateRequested.size, 0);
  assert.equal(inFlight.size, 0);
});

test('a failed overlapping refresh can retry and fill once after quotes recover', async () => {
  const inFlight = new Map<string, Promise<void>>();
  const evaluateRequested = new Set<string>();
  let attempts = 0;
  let successfulFills = 0;
  const refresh = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('quote service unavailable');
  };
  const evaluate = () => {
    successfulFills += 1;
  };
  const first = runPaperAccountQuoteRefresh('account-1', inFlight, evaluateRequested, true, refresh, evaluate);
  const overlapping = runPaperAccountQuoteRefresh('account-1', inFlight, evaluateRequested, true, refresh, evaluate);
  await assert.rejects(first, /quote service unavailable/);
  await assert.rejects(overlapping, /quote service unavailable/);

  await runPaperAccountQuoteRefresh('account-1', inFlight, evaluateRequested, true, refresh, evaluate);

  assert.equal(attempts, 2);
  assert.equal(successfulFills, 1);
  assert.equal(inFlight.size, 0);
  assert.equal(evaluateRequested.size, 0);
});

test('the pending-order UI explains device-only storage and app-closed behavior', () => {
  assert.match(screenSource, /testID="paper-device-only-order-notice"/);
  assert.match(screenSource, /saved only on this device\. Orders are not monitored while the app is closed/);
  assert.match(screenSource, /Market orders need a fresh regular-session quote/);
});

test('filled orders show the recorded app execution time without implying trigger-crossing time', () => {
  assert.match(screenSource, /const fillTime = o\.status === 'filled' \? formatPaperOrderFillTime\(o\.filledAt\) : null/);
  assert.match(screenSource, /testID=\{`paper-order-fill-time-\$\{o\.id\}`\}/);
  assert.match(screenSource, /EXECUTED \{fillTime\}/);
  assert.match(screenSource, /App execution time; this does not indicate when a market price first crossed your order level/);
  assert.match(screenSource, /\{o\.status\.toUpperCase\(\)\}/);
  assert.match(screenSource, /@ \$\{o\.filledPrice\.toFixed\(2\)\}/);
});

test('paper order fill time formatting handles valid and missing timestamps', () => {
  assert.equal(
    formatPaperOrderFillTime('2026-11-21T15:30:00.000Z')?.includes('2026'),
    true,
  );
  assert.equal(formatPaperOrderFillTime(undefined), null);
  assert.equal(formatPaperOrderFillTime('not-a-timestamp'), null);
});
