/**
 * Deterministic tests for the portfolio closed-trade, fund-fee and win-rate
 * math (computeClosedTrades + SummaryCard via computeTradeSummary).
 * Run with: pnpm --filter @workspace/mobile test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeClosedTrades,
  computeDividendTotal,
  computePositions,
  computeTradeSummary,
  type Quote,
  type Trade,
} from '../portfolioMath.ts';

const EPS = 1e-9;
const approx = (a: number, b: number, msg?: string) =>
  assert.ok(Math.abs(a - b) < EPS, msg ?? `expected ${a} ≈ ${b}`);

const DAY0 = '2025-01-01T00:00:00.000Z';
const DAY365 = '2026-01-01T00:00:00.000Z'; // exactly 365 days after DAY0

const buy = (o: Partial<Trade>): Trade =>
  ({ id: 'b', symbol: 'VOO', type: 'buy', shares: 10, pricePerShare: 100, date: DAY0, ...o });
const sell = (o: Partial<Trade>): Trade =>
  ({ id: 's', symbol: 'VOO', type: 'sell', shares: 4, pricePerShare: 120, date: DAY365, ...o });

const fundQuote: Record<string, Quote | null> = {
  VOO: { currentPrice: 120, priceChange: 0, priceChangePercent: 0, expenseRatio: 0.01 },
};

// ── computeClosedTrades ─────────────────────────────────────────────────────────
test('partial close with a fee: net = gross − fee, one closed trade counted', () => {
  const trades = [buy({ id: 'b1' }), sell({ id: 's1' })];
  const closed = computeClosedTrades(trades, fundQuote);
  assert.equal(closed.length, 1, 'a partial close counts as one closed trade');
  const c = closed[0];
  approx(c.gross, 80, 'gross = 4 × (120 − 100)');
  approx(c.fee, 4, 'fee = (4 × 100) × 0.01 × (365/365)');
  approx(c.net, c.gross - c.fee, 'net = gross − fee');
  approx(c.net, 76);
  assert.equal(c.isWin, true);
});

test('no prior buys: the sell is skipped entirely', () => {
  const trades = [sell({ id: 's1' })]; // sell with nothing bought before it
  const closed = computeClosedTrades(trades, fundQuote);
  assert.equal(closed.length, 0);
});

test('missing/zero expense ratio: no fee, net equals gross', () => {
  const noRatio: Record<string, Quote | null> = {
    VOO: { currentPrice: 120, priceChange: 0, priceChangePercent: 0 }, // expenseRatio absent
  };
  const trades = [buy({ id: 'b1' }), sell({ id: 's1' })];
  const closed = computeClosedTrades(trades, noRatio);
  approx(closed[0].fee, 0);
  approx(closed[0].net, closed[0].gross);

  const zeroRatio: Record<string, Quote | null> = {
    VOO: { currentPrice: 120, priceChange: 0, priceChangePercent: 0, expenseRatio: 0 },
  };
  const closed2 = computeClosedTrades(trades, zeroRatio);
  approx(closed2[0].fee, 0);
});

test('same-day sell: no fee even for a fund (days = 0)', () => {
  const trades = [buy({ id: 'b1', date: DAY0 }), sell({ id: 's1', date: DAY0 })];
  const closed = computeClosedTrades(trades, fundQuote);
  approx(closed[0].fee, 0);
  approx(closed[0].net, closed[0].gross);
});

test('win threshold: net ≥ $0.01 is a win, below is a loss', () => {
  const win = computeClosedTrades(
    [buy({ id: 'b1', shares: 1, pricePerShare: 100 }), sell({ id: 's1', shares: 1, pricePerShare: 100.01 })],
    {}, // no expense ratio → no fee
  );
  approx(win[0].net, 0.01);
  assert.equal(win[0].isWin, true);

  const loss = computeClosedTrades(
    [buy({ id: 'b1', shares: 1, pricePerShare: 100 }), sell({ id: 's1', shares: 1, pricePerShare: 100.005 })],
    {},
  );
  approx(loss[0].net, 0.005);
  assert.equal(loss[0].isWin, false);
});

test('each sell (partial close) counts once toward the win-rate denominator', () => {
  const trades: Trade[] = [
    buy({ id: 'b1', shares: 10, pricePerShare: 100, date: DAY0 }),
    sell({ id: 's1', shares: 3, pricePerShare: 120, date: DAY0 }), // same-day, no fee → win
    sell({ id: 's2', shares: 3, pricePerShare: 90, date: DAY0 }),  // loss
  ];
  const closed = computeClosedTrades(trades, fundQuote);
  assert.equal(closed.length, 2, 'both partial closes are counted');
  const summary = computeTradeSummary(closed);
  assert.equal(summary.totalClosed, 2);
  assert.equal(summary.wins, 1);
  assert.equal(summary.winRate, 50);
});

// ── computeTradeSummary (SummaryCard) ───────────────────────────────────────────
test('computeTradeSummary: aggregates net realized, fees and win rate', () => {
  const closed = computeClosedTrades([buy({ id: 'b1' }), sell({ id: 's1' })], fundQuote);
  const s = computeTradeSummary(closed);
  approx(s.totalReal, 76, 'net realized across closes');
  approx(s.totalFees, 4);
  assert.equal(s.wins, 1);
  assert.equal(s.totalClosed, 1);
  assert.equal(s.winRate, 100);
});

test('computeTradeSummary: no closed trades → winRate null, zeros elsewhere', () => {
  const s = computeTradeSummary([]);
  assert.equal(s.winRate, null);
  assert.equal(s.totalClosed, 0);
  approx(s.totalReal, 0);
  approx(s.totalFees, 0);
});

test('computeDividendTotal: sums received cash without affecting trade totals', () => {
  const trades: Trade[] = [
    buy({ id: 'b1', shares: 10 }),
    { id: 'd1', symbol: 'VOO', type: 'dividend', shares: 10, pricePerShare: 0.83, date: DAY365 },
    sell({ id: 's1', shares: 2 }),
  ];
  approx(computeDividendTotal(trades), 8.3);
  const positions = computePositions(trades, { VOO: fundQuote.VOO });
  assert.equal(positions[0].netShares, 8);
  assert.equal(positions[0].totalSellShares, 2);
  assert.equal(positions[0].trades.length, 2);
});
