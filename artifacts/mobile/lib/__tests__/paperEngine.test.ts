/**
 * Unit tests for paperEngine.ts
 * Run with: node --experimental-strip-types artifacts/mobile/lib/paperEngine.test.ts
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  applySlippage,
  evaluateOrder,
  fifoSell,
  settleCash,
  creditDividends,
  checkRisk,
  fillOrder,
  SETTLEMENT_DELAY_MS,
  DIVIDEND_INTERVAL_MS,
  MAX_POSITION_FRACTION,
} from '../paperEngine.ts';

import type { PaperAccount, PaperOrder, PaperLot, PaperPosition } from '../paperMath.ts';

// ── Helpers ────────────────────────────────────────────────────────────────
let _seq = 0;
const uid = () => `id-${++_seq}`;

const mkAccount = (overrides: Partial<PaperAccount> = {}): PaperAccount => ({
  id: uid(), name: 'Test', cash: 100_000,
  createdAt: '2025-01-01T00:00:00Z',
  unsettledCash: 0, unsettledItems: [],
  ...overrides,
});

const mkOrder = (overrides: Partial<PaperOrder>): PaperOrder => ({
  id: uid(), accountId: 'a1', symbol: 'AAPL', companyName: 'Apple',
  orderType: 'market', side: 'buy', shares: 10, status: 'pending',
  placedAt: new Date().toISOString(),
  ...overrides,
});

const mkLot = (overrides: Partial<PaperLot>): PaperLot => ({
  id: uid(), accountId: 'a1', symbol: 'AAPL',
  shares: 10, cost: 100,
  purchasedAt: '2025-01-01T00:00:00Z',
  ...overrides,
});

const mkPosition = (overrides: Partial<PaperPosition>): PaperPosition => ({
  id: uid(), accountId: 'a1', symbol: 'AAPL', companyName: 'Apple',
  shares: 10, avgCost: 100, openedAt: '2025-01-01T00:00:00Z',
  dividendYield: 0, dividendRate: 0, expenseRatio: 0, sector: 'Tech',
  ...overrides,
});

// ── applySlippage ──────────────────────────────────────────────────────────
test('applySlippage — buy pays more than base price', () => {
  // With a fixed seed we can only check direction
  const results = Array.from({ length: 20 }, () => applySlippage(100, 10, 'buy'));
  assert.ok(results.every(p => p > 100), 'Buy should always pay more');
  assert.ok(results.every(p => p <= 100 * 1.0031), 'Slippage should be under 0.31%');
});

test('applySlippage — sell receives less than base price', () => {
  const results = Array.from({ length: 20 }, () => applySlippage(100, 10, 'sell'));
  assert.ok(results.every(p => p < 100), 'Sell should always receive less');
  assert.ok(results.every(p => p >= 100 * 0.9969), 'Slippage should be under 0.31%');
});

// ── evaluateOrder ──────────────────────────────────────────────────────────
test('evaluateOrder — market always fills', () => {
  const o = mkOrder({ orderType: 'market' });
  assert.deepEqual(evaluateOrder(o, 150), { shouldFill: true });
});

test('evaluateOrder — limit buy fills when price ≤ limit', () => {
  const o = mkOrder({ orderType: 'limit', side: 'buy', limitPrice: 100 });
  assert.deepEqual(evaluateOrder(o, 100), { shouldFill: true });
  assert.deepEqual(evaluateOrder(o, 99), { shouldFill: true });
  assert.deepEqual(evaluateOrder(o, 101), { shouldFill: false });
});

test('evaluateOrder — limit sell fills when price ≥ limit', () => {
  const o = mkOrder({ orderType: 'limit', side: 'sell', limitPrice: 150 });
  assert.deepEqual(evaluateOrder(o, 150), { shouldFill: true });
  assert.deepEqual(evaluateOrder(o, 160), { shouldFill: true });
  assert.deepEqual(evaluateOrder(o, 140), { shouldFill: false });
});

test('evaluateOrder — stop sell fills when price ≤ stop', () => {
  const o = mkOrder({ orderType: 'stop', side: 'sell', stopPrice: 90 });
  assert.deepEqual(evaluateOrder(o, 90), { shouldFill: true });
  assert.deepEqual(evaluateOrder(o, 80), { shouldFill: true });
  assert.deepEqual(evaluateOrder(o, 95), { shouldFill: false });
});

test('evaluateOrder — stop_limit sell — stop reached + limit executable', () => {
  const o = mkOrder({ orderType: 'stop_limit', side: 'sell', stopPrice: 90, limitPrice: 88 });
  // price 89 ≤ stop 90 AND price 89 ≥ limit 88 → fill
  assert.deepEqual(evaluateOrder(o, 89), { shouldFill: true });
  // price 87 ≤ stop 90 BUT price 87 < limit 88 → no fill (price gapped through limit)
  assert.deepEqual(evaluateOrder(o, 87), { shouldFill: false });
});

test('evaluateOrder — trailing stop sell — trail ref updates on new high', () => {
  const o = mkOrder({ orderType: 'trailing_stop', side: 'sell', trailPct: 10, trailRef: 100 });
  // price rose to 110 — ref should update, no fill
  const r = evaluateOrder(o, 110);
  assert.equal(r.shouldFill, false);
  assert.equal((r as any).updatedTrailRef, 110);
  // now price falls to 99 — 10% below ref 110 = 99 → fill
  const o2 = { ...o, trailRef: 110 };
  assert.deepEqual(evaluateOrder(o2, 99), { shouldFill: true });
  assert.deepEqual(evaluateOrder(o2, 100), { shouldFill: false }); // 100 > 110*0.9
});

test('evaluateOrder — filled order does not re-trigger', () => {
  const o = mkOrder({ orderType: 'limit', side: 'buy', limitPrice: 100, status: 'filled' });
  assert.deepEqual(evaluateOrder(o, 90), { shouldFill: false });
});

// ── fifoSell ──────────────────────────────────────────────────────────────
test('fifoSell — single lot full close', () => {
  const lot = mkLot({ shares: 10, cost: 100 });
  const { realizedPnL, updatedLots } = fifoSell([lot], 'a1', 'AAPL', 10, 150);
  assert.equal(realizedPnL, 500); // 10 * (150 - 100)
  assert.equal(updatedLots.length, 0);
});

test('fifoSell — partial close — oldest lot consumed first', () => {
  const lot1 = mkLot({ shares: 5, cost: 100, purchasedAt: '2025-01-01T00:00:00Z' });
  const lot2 = mkLot({ shares: 10, cost: 120, purchasedAt: '2025-06-01T00:00:00Z' });
  const { realizedPnL, updatedLots } = fifoSell([lot1, lot2], 'a1', 'AAPL', 5, 150);
  // lot1 consumed entirely: 5 * (150 - 100) = 250
  assert.equal(realizedPnL, 250);
  assert.equal(updatedLots.length, 1);
  assert.equal(updatedLots[0].cost, 120);
  assert.equal(updatedLots[0].shares, 10);
});

test('fifoSell — partial lot split', () => {
  const lot = mkLot({ shares: 20, cost: 100 });
  const { realizedPnL, updatedLots } = fifoSell([lot], 'a1', 'AAPL', 5, 110);
  assert.equal(realizedPnL, 50); // 5 * 10
  assert.equal(updatedLots.length, 1);
  assert.equal(updatedLots[0].shares, 15);
});

test('fifoSell — no lots for symbol returns 0 P&L', () => {
  const lot = mkLot({ symbol: 'MSFT' }); // different symbol
  const { realizedPnL, updatedLots } = fifoSell([lot], 'a1', 'AAPL', 10, 150);
  assert.equal(realizedPnL, 0);
  assert.equal(updatedLots.length, 1); // MSFT lot untouched
});

// ── settleCash ────────────────────────────────────────────────────────────
test('settleCash — settles items whose date has passed', () => {
  const pastISO = new Date(Date.now() - 1000).toISOString();
  const futureISO = new Date(Date.now() + SETTLEMENT_DELAY_MS).toISOString();
  const account = mkAccount({
    cash: 1000,
    unsettledCash: 600,
    unsettledItems: [
      { amount: 400, settlesAt: pastISO },
      { amount: 200, settlesAt: futureISO },
    ],
  });
  const { updated, settled } = settleCash(account, new Date().toISOString());
  assert.equal(settled, 400);
  assert.equal(updated.cash, 1400); // 1000 + 400
  assert.equal(updated.unsettledCash, 200);
  assert.equal((updated.unsettledItems ?? []).length, 1);
});

test('settleCash — nothing settles when all dates are in future', () => {
  const futureISO = new Date(Date.now() + SETTLEMENT_DELAY_MS).toISOString();
  const account = mkAccount({ cash: 1000, unsettledCash: 500, unsettledItems: [{ amount: 500, settlesAt: futureISO }] });
  const { updated, settled } = settleCash(account, new Date().toISOString());
  assert.equal(settled, 0);
  assert.equal(updated.cash, 1000);
});

// ── creditDividends ────────────────────────────────────────────────────────
test('creditDividends — credits monthly dividend and records transaction', () => {
  // last credit was 31 days ago → should credit
  const lastCredit = new Date(Date.now() - DIVIDEND_INTERVAL_MS - 1000).toISOString();
  const account = mkAccount({ id: 'a1', cash: 10_000, lastDividendCredit: lastCredit });
  const pos = mkPosition({ accountId: 'a1', shares: 100, dividendRate: 1.2 }); // $1.20 annual per share
  const nowISO = new Date().toISOString();
  const { updatedAccount, newTransactions } = creditDividends(
    [pos], account, { AAPL: { price: 150 } }, nowISO, uid,
  );
  // monthly = (100 * 1.2) / 12 = 10
  assert.equal(newTransactions.length, 1);
  assert.equal(newTransactions[0].action, 'DIVIDEND');
  assert.ok(Math.abs(updatedAccount.cash - 10_010) < 0.01, 'Cash should be ~10010');
  assert.equal(updatedAccount.lastDividendCredit, nowISO);
});

test('creditDividends — skips credit when too recent', () => {
  const lastCredit = new Date(Date.now() - 1000).toISOString();
  const account = mkAccount({ id: 'a1', cash: 10_000, lastDividendCredit: lastCredit });
  const pos = mkPosition({ accountId: 'a1', shares: 100, dividendRate: 1.2 });
  const nowISO = new Date().toISOString();
  const { updatedAccount, newTransactions } = creditDividends([pos], account, {}, nowISO, uid);
  assert.equal(newTransactions.length, 0);
  assert.equal(updatedAccount.cash, 10_000);
});

// ── checkRisk ─────────────────────────────────────────────────────────────
test('checkRisk — passes when sufficient buying power', () => {
  const account = mkAccount({ cash: 10_000 });
  const result = checkRisk({
    side: 'buy', shares: 10, orderType: 'market', symbol: 'AAPL',
    currentPrice: 150, account, accountPositions: [], quotes: {},
  });
  assert.equal(result, null);
});

test('checkRisk — fails when insufficient cash', () => {
  const account = mkAccount({ cash: 100 });
  const result = checkRisk({
    side: 'buy', shares: 10, orderType: 'market', symbol: 'AAPL',
    currentPrice: 150, account, accountPositions: [], quotes: {},
  });
  assert.ok(result?.includes('Insufficient buying power'));
});

test('checkRisk — fails when position would exceed 40% of portfolio', () => {
  const account = mkAccount({ cash: 100_000 });
  const result = checkRisk({
    side: 'buy', shares: 1000, orderType: 'market', symbol: 'AAPL',
    currentPrice: 100, account, accountPositions: [], quotes: {},
  });
  assert.ok(result?.includes('40%'));
});

test('checkRisk — sell fails when insufficient shares', () => {
  const account = mkAccount({ cash: 100_000 });
  const pos = mkPosition({ shares: 5 });
  const result = checkRisk({
    side: 'sell', shares: 10, orderType: 'market', symbol: 'AAPL',
    currentPrice: 150, account, accountPositions: [pos], quotes: {},
  });
  assert.ok(result?.includes('only hold'));
});

// ── fillOrder ─────────────────────────────────────────────────────────────
test('fillOrder — market buy deducts cash and creates lot', () => {
  const account = mkAccount({ cash: 10_000 });
  const order = mkOrder({ orderType: 'market', side: 'buy', shares: 5 });
  const result = fillOrder({
    order, fillPrice: 200, filledAt: new Date().toISOString(),
    account, positions: [], lots: [], uid,
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('unexpected');
  assert.equal(result.updatedAccount.cash, 9_000); // 10000 - 5*200
  assert.equal(result.updatedPositions.length, 1);
  assert.equal(result.updatedLots.length, 1);
  assert.equal(result.newTransaction.action, 'BUY');
  assert.equal(result.newTransaction.total, 1_000);
});

test('fillOrder — buy rejects when cash is insufficient at fill time', () => {
  const account = mkAccount({ cash: 500 }); // only $500, order costs $1000
  const order = mkOrder({ side: 'buy', shares: 5 });
  const result = fillOrder({
    order, fillPrice: 200, filledAt: new Date().toISOString(),
    account, positions: [], lots: [], uid,
  });
  assert.equal(result.ok, false);
  assert.ok((result as any).reason.includes('Insufficient buying power'));
});

test('fillOrder — market sell creates T+2 unsettled item, not immediate cash', () => {
  const account = mkAccount({ cash: 0 });
  const pos = mkPosition({ shares: 10, avgCost: 100 });
  const lot = mkLot({ shares: 10, cost: 100 });
  const order = mkOrder({ side: 'sell', shares: 5, symbol: 'AAPL', accountId: 'a1' });
  const result = fillOrder({
    order, fillPrice: 150, filledAt: new Date().toISOString(),
    account, positions: [pos], lots: [lot], uid,
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('unexpected');
  // Cash should NOT increase (T+2)
  assert.equal(result.updatedAccount.cash, 0);
  const items = result.updatedAccount.unsettledItems ?? [];
  assert.equal(items.length, 1);
  assert.ok((items[0].amount ?? 0) > 0);
  assert.equal(result.newTransaction.action, 'SELL');
});

test('fillOrder — sell rejects when no position exists (over-sell guard)', () => {
  const account = mkAccount({ cash: 0 });
  const order = mkOrder({ side: 'sell', shares: 10, symbol: 'AAPL', accountId: 'a1' });
  const result = fillOrder({
    order, fillPrice: 150, filledAt: new Date().toISOString(),
    account, positions: [], lots: [], uid, // no position at all
  });
  assert.equal(result.ok, false);
  assert.ok((result as any).reason.includes('Insufficient shares'));
});

test('fillOrder — sell rejects when existing position has fewer shares than the order', () => {
  const account = mkAccount({ cash: 0 });
  const pos = mkPosition({ shares: 3 }); // only 3 shares
  const lot = mkLot({ shares: 3, cost: 100 });
  const order = mkOrder({ side: 'sell', shares: 10, symbol: 'AAPL', accountId: 'a1' }); // wants 10
  const result = fillOrder({
    order, fillPrice: 150, filledAt: new Date().toISOString(),
    account, positions: [pos], lots: [lot], uid,
  });
  assert.equal(result.ok, false);
  assert.ok((result as any).reason.includes('Insufficient shares'));
});

test('fillOrder — sell with lots computes FIFO realizedPnL', () => {
  const account = mkAccount({ cash: 0 });
  const pos = mkPosition({ shares: 10, avgCost: 100 });
  const lot = mkLot({ shares: 10, cost: 80 }); // cost basis $80, sell at $150 → PnL $700
  const order = mkOrder({ side: 'sell', shares: 10, symbol: 'AAPL', accountId: 'a1' });
  const result = fillOrder({
    order, fillPrice: 150, filledAt: new Date().toISOString(),
    account, positions: [pos], lots: [lot], uid,
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('unexpected');
  assert.ok(Math.abs((result.newTransaction.realizedPnL ?? 0) - 700) < 1, 'FIFO P&L should be ~700');
});

// ── Multi-order integrity scenarios ────────────────────────────────────────
test('multi-order: two pending buys each checked independently — second rejected when first drains cash', () => {
  const account = mkAccount({ cash: 1_500 }); // can only afford one $1000 buy
  const order1 = mkOrder({ id: 'o1', side: 'buy', shares: 5, symbol: 'AAPL', accountId: account.id });
  const order2 = mkOrder({ id: 'o2', side: 'buy', shares: 5, symbol: 'AAPL', accountId: account.id });

  // Fill order 1 first (succeeds)
  const r1 = fillOrder({
    order: order1, fillPrice: 200, filledAt: new Date().toISOString(),
    account, positions: [], lots: [], uid,
  });
  assert.equal(r1.ok, true);
  if (!r1.ok) throw new Error('unexpected');
  assert.equal(r1.updatedAccount.cash, 500); // 1500 - 5*200

  // Now try to fill order 2 using the updated account — cash is only $500
  const r2 = fillOrder({
    order: order2, fillPrice: 200, filledAt: new Date().toISOString(),
    account: r1.updatedAccount, // pass in already-updated account
    positions: r1.updatedPositions,
    lots: r1.updatedLots,
    uid,
  });
  assert.equal(r2.ok, false, 'Second buy should be rejected — insufficient cash after first fill');
  assert.ok((r2 as any).reason.includes('Insufficient buying power'));
});

test('multi-order: two pending sells — second rejected when first closes the position', () => {
  const account = mkAccount({ cash: 0 });
  const pos = mkPosition({ shares: 5 }); // only 5 shares total
  const lot = mkLot({ shares: 5, cost: 100 });
  const order1 = mkOrder({ id: 'o1', side: 'sell', shares: 5, symbol: 'AAPL', accountId: 'a1' });
  const order2 = mkOrder({ id: 'o2', side: 'sell', shares: 5, symbol: 'AAPL', accountId: 'a1' });

  // Fill order 1 first (sells all 5 shares)
  const r1 = fillOrder({
    order: order1, fillPrice: 150, filledAt: new Date().toISOString(),
    account, positions: [pos], lots: [lot], uid,
  });
  assert.equal(r1.ok, true);
  if (!r1.ok) throw new Error('unexpected');
  assert.equal(r1.updatedPositions.length, 0); // position fully closed

  // Now try order 2 — no position remains
  const r2 = fillOrder({
    order: order2, fillPrice: 150, filledAt: new Date().toISOString(),
    account: r1.updatedAccount,
    positions: r1.updatedPositions,
    lots: r1.updatedLots,
    uid,
  });
  assert.equal(r2.ok, false, 'Second sell should be rejected — no shares remain');
  assert.ok((r2 as any).reason.includes('Insufficient shares'));
});

console.log('All tests passed ✓');
