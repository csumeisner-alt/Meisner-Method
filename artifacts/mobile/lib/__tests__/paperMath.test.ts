/**
 * Deterministic tests for the paper-trading fee, sell-settlement, value-history
 * and win-rate math. Run with: pnpm --filter @workspace/mobile test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_BALANCE,
  buildValueHistory,
  createAccountValueSnapshot,
  computeRealizedPnL,
  computePaperEquity,
  computeSellResult,
  computeSellWinRate,
  fundFee,
  getCoveredAccountValueHistory,
  isWinningSell,
  mergeAccountValueHistory,
  normalizeDividendYield,
  parseAccountValueSnapshots,
  upsertAccountValueSnapshot,
  sellNetPnL,
  type PaperAccount,
  type PaperPosition,
  type PaperTransaction,
} from '../paperMath.ts';

const EPS = 1e-9;
const approx = (a: number, b: number, msg?: string) =>
  assert.ok(Math.abs(a - b) < EPS, msg ?? `expected ${a} ≈ ${b}`);

const DAY0 = '2025-01-01T00:00:00.000Z';
const DAY365 = '2026-01-01T00:00:00.000Z'; // exactly 365 days after DAY0 (2025 is not a leap year)

test('normalizeDividendYield: provider percent-like values become decimal fractions', () => {
  approx(normalizeDividendYield(0.43, 1, 230.36), 0.0043);
  approx(normalizeDividendYield(0.34, 1.08, 319.97), 0.0034);
});

test('normalizeDividendYield: provider decimal values remain decimal fractions', () => {
  approx(normalizeDividendYield(0.0073, 3.64, 499.7), 0.0073);
  approx(normalizeDividendYield(0.43), 0.0043);
});

function pos(overrides: Partial<PaperPosition> = {}): PaperPosition {
  return {
    id: 'p1',
    accountId: 'a1',
    symbol: 'VOO',
    companyName: 'Vanguard S&P 500',
    shares: 5,
    avgCost: 100,
    openedAt: DAY0,
    dividendYield: 0,
    expenseRatio: 0.01, // 1% annual
    sector: 'ETF',
    ...overrides,
  };
}

function sellTx(overrides: Partial<PaperTransaction> = {}): PaperTransaction {
  return {
    id: 't1',
    accountId: 'a1',
    symbol: 'VOO',
    companyName: 'Vanguard S&P 500',
    action: 'SELL',
    shares: 1,
    price: 100,
    total: 100,
    date: DAY365,
    realizedPnL: 0,
    fee: 0,
    ...overrides,
  };
}

// ── fundFee ───────────────────────────────────────────────────────────────────
test('fundFee: full-year hold accrues the whole expense ratio', () => {
  // value 200, 1% expense ratio, held exactly one year → 200 * 0.01 * 1 = 2
  approx(fundFee(200, 0.01, DAY0, DAY365), 2);
});

test('fundFee: zero/missing expense ratio charges nothing', () => {
  approx(fundFee(200, 0, DAY0, DAY365), 0);
  approx(fundFee(200, undefined, DAY0, DAY365), 0);
});

test('fundFee: same-day close charges nothing (days = 0)', () => {
  approx(fundFee(200, 0.01, DAY0, DAY0), 0);
});

// ── computeSellResult (confirmSell math) ───────────────────────────────────────
test('computeSellResult: partial close — net = gross − fee, cash reduced by fee', () => {
  // Hold 5 @100, sell 2 @120 after one full year, 1% expense ratio.
  const r = computeSellResult({ position: pos(), shares: 2, price: 120, soldAt: DAY365 });
  approx(r.total, 240, 'gross proceeds = 2 × 120');
  approx(r.realizedPnL, 40, 'gross P&L = 2 × (120 − 100)');
  approx(r.fee, 2, 'fee = (2 × 100) × 0.01 × 1');
  // (1) net = gross − fee
  approx(r.net, r.realizedPnL - r.fee);
  approx(r.net, 38);
  // (2) cash credited is proceeds net of the fee (i.e. reduced by the fee)
  approx(r.cashDelta, r.total - r.fee);
  approx(r.cashDelta, 238);
});

test('computeSellResult: zero expense ratio → net equals gross, cash = full proceeds', () => {
  const r = computeSellResult({ position: pos({ expenseRatio: 0 }), shares: 2, price: 120, soldAt: DAY365 });
  approx(r.fee, 0);
  approx(r.net, r.realizedPnL);
  approx(r.cashDelta, r.total);
});

test('computeSellResult: same-day sell → no fee even for a fund', () => {
  const r = computeSellResult({ position: pos(), shares: 2, price: 120, soldAt: DAY0 });
  approx(r.fee, 0);
  approx(r.net, r.realizedPnL);
});

// ── buildValueHistory ──────────────────────────────────────────────────────────
test('buildValueHistory: reconstructed final equity matches live equity (fee included)', () => {
  const account: PaperAccount = { id: 'a1', name: 'Strat', cash: INITIAL_BALANCE, createdAt: DAY0 };

  // Buy 5 @100 → cash 99,500; hold 5 shares.
  const buy: PaperTransaction = {
    id: 'b1', accountId: 'a1', symbol: 'VOO', companyName: 'Vanguard S&P 500',
    action: 'BUY', shares: 5, price: 100, total: 500, date: DAY0,
  };
  // Sell 2 @120 after one year, fee $2 (net of fee credited to cash).
  const sr = computeSellResult({ position: pos(), shares: 2, price: 120, soldAt: DAY365 });
  const sell: PaperTransaction = {
    id: 's1', accountId: 'a1', symbol: 'VOO', companyName: 'Vanguard S&P 500',
    action: 'SELL', shares: 2, price: 120, total: sr.total, date: DAY365,
    realizedPnL: sr.realizedPnL, fee: sr.fee,
  };

  // Live cash after both trades: 100,000 − 500 + (240 − 2) = 99,738
  const liveCash = INITIAL_BALANCE - buy.total + sr.cashDelta;
  approx(liveCash, 99_738);

  // Remaining 3 shares, current quote 120.
  const remaining: PaperPosition = pos({ shares: 3 });
  const quotes = { VOO: { price: 120, change: 0, pct: 0 } };

  const history = buildValueHistory(
    account, [buy, sell], liveCash, [remaining], quotes, '2026-06-01T00:00:00.000Z',
  );

  // Independently computed live equity.
  const liveEquity = liveCash + remaining.shares * quotes.VOO.price; // 99,738 + 360 = 100,098
  approx(liveEquity, 100_098);

  const last = history[history.length - 1];
  approx(last.value, liveEquity, 'final reconstructed point equals live equity');

  // The sell point (before the live point) should also match live equity here,
  // proving the fee was debited from the reconstructed cash flow.
  const sellPoint = history[history.length - 2];
  approx(sellPoint.value, liveEquity);
});

test('buildValueHistory: ignoring the fee would overstate equity', () => {
  // Same scenario, but assert that a fee-blind reconstruction differs by the fee.
  const account: PaperAccount = { id: 'a1', name: 'Strat', cash: INITIAL_BALANCE, createdAt: DAY0 };
  const buy: PaperTransaction = {
    id: 'b1', accountId: 'a1', symbol: 'VOO', companyName: 'Vanguard S&P 500',
    action: 'BUY', shares: 5, price: 100, total: 500, date: DAY0,
  };
  const withFee = buildValueHistory(
    account,
    [buy, sellTx({ id: 's1', shares: 2, price: 120, total: 240, realizedPnL: 40, fee: 2 })],
    0, [], {}, DAY365,
  );
  const noFee = buildValueHistory(
    account,
    [buy, sellTx({ id: 's1', shares: 2, price: 120, total: 240, realizedPnL: 40, fee: 0 })],
    0, [], {}, DAY365,
  );
  // The sell-point equity differs by exactly the $2 fee.
  const withFeeSell = withFee[withFee.length - 2].value;
  const noFeeSell = noFee[noFee.length - 2].value;
  approx(noFeeSell - withFeeSell, 2);
});

test('account value snapshots use live quotes and never estimate missing position prices', () => {
  const account: PaperAccount = {
    id: 'a1',
    name: 'Strategy',
    cash: 500,
    unsettledCash: 25,
    createdAt: DAY0,
  };
  const positions = [pos({ accountId: 'a1', shares: 2 }), pos({ id: 'p2', accountId: 'a2' })];
  const snapshot = createAccountValueSnapshot(
    'a1',
    [account],
    positions,
    { VOO: { price: 120, change: 0, pct: 0 } },
    DAY365,
  );
  assert.deepEqual(snapshot, { accountId: 'a1', date: DAY365, value: 765 });
  assert.equal(createAccountValueSnapshot('a1', [account], positions, {}, DAY365), null);
  assert.equal(createAccountValueSnapshot('a2', [account], positions, {}, DAY365), null);
});

test('snapshot parsing and hourly upserts keep account histories separate', () => {
  const initial = parseAccountValueSnapshots([
    { accountId: 'a1', date: DAY0, value: 100 },
    { accountId: 'a2', date: DAY0, value: 200 },
    { accountId: 'a1', date: 'invalid', value: 300 },
    { accountId: 'a1', date: DAY0, value: Number.NaN },
  ]);
  assert.equal(initial.length, 2);

  const tooSoon = upsertAccountValueSnapshot(
    initial,
    { accountId: 'a1', date: '2025-01-01T00:05:00.000Z', value: 110 },
    60 * 60_000,
  );
  assert.equal(tooSoon, initial, 'frequent polling does not move the saved sample time');
  const nextHourly = upsertAccountValueSnapshot(
    initial,
    { accountId: 'a1', date: '2025-01-01T01:00:00.000Z', value: 120 },
    60 * 60_000,
  );
  assert.equal(nextHourly.length, 3);
  assert.deepEqual(nextHourly.find((point) => point.accountId === 'a1' && point.date !== DAY0), {
    accountId: 'a1',
    date: '2025-01-01T01:00:00.000Z',
    value: 120,
  });
  assert.equal(nextHourly.find((point) => point.accountId === 'a2')?.value, 200);
});

test('dated account ranges require snapshot coverage and retain a pre-window chart anchor', () => {
  const nowMs = new Date(DAY365).getTime();
  const day = 86_400_000;
  const snapshots = [
    { accountId: 'other', date: new Date(nowMs - day).toISOString(), value: 10 },
    { accountId: 'a1', date: new Date(nowMs - day - 1_000).toISOString(), value: 100 },
    { accountId: 'a1', date: new Date(nowMs - 12 * 60 * 60_000).toISOString(), value: 110 },
    { accountId: 'a1', date: new Date(nowMs - 60 * 60_000).toISOString(), value: 120 },
  ];
  const covered = getCoveredAccountValueHistory(snapshots, 'a1', day, nowMs, 2 * 60 * 60_000);
  assert.deepEqual(covered.map((point) => point.value), [100, 110, 120]);
  assert.deepEqual(
    getCoveredAccountValueHistory(snapshots, 'a2', day, nowMs, 2 * 60 * 60_000),
    [],
  );
  assert.deepEqual(
    getCoveredAccountValueHistory(snapshots.slice(2), 'a1', day, nowMs, 2 * 60 * 60_000),
    [],
    'a newer account without a snapshot at the requested start must not show the range',
  );
  assert.deepEqual(
    getCoveredAccountValueHistory(snapshots, 'a1', day, nowMs + 3 * 60 * 60_000, 2 * 60 * 60_000),
    [],
    'stale samples do not qualify as current range coverage',
  );
});

test('ALL account history keeps legacy transaction points alongside saved snapshots', () => {
  const legacy = [{ date: DAY0, value: INITIAL_BALANCE }];
  const merged = mergeAccountValueHistory(
    legacy,
    [
      { accountId: 'a1', date: '2025-06-01T00:00:00.000Z', value: 101_000 },
      { accountId: 'a2', date: '2025-07-01T00:00:00.000Z', value: 99_000 },
    ],
    'a1',
  );
  assert.deepEqual(merged.map((point) => point.value), [INITIAL_BALANCE, 101_000]);
});

// ── Win rate ───────────────────────────────────────────────────────────────────
test('computeSellWinRate: counts each sell and uses the $0.01 net threshold', () => {
  const txns: PaperTransaction[] = [
    // A buy must never be counted toward the win rate.
    { id: 'b', accountId: 'a1', symbol: 'X', companyName: 'X', action: 'BUY', shares: 1, price: 10, total: 10, date: DAY0 },
    sellTx({ id: 's1', realizedPnL: 40, fee: 2 }),      // net 38 → win
    sellTx({ id: 's2', realizedPnL: 0.01, fee: 0 }),    // net 0.01 → win (threshold)
    sellTx({ id: 's3', realizedPnL: 0.02, fee: 0.015 }),// net 0.005 → loss (below threshold)
    sellTx({ id: 's4', realizedPnL: -5, fee: 0 }),      // net -5 → loss
  ];
  const wr = computeSellWinRate(txns);
  assert.equal(wr.total, 4, 'denominator counts every SELL, not buys');
  assert.equal(wr.wins, 2);
  assert.equal(wr.losses, 2);
  approx(wr.rate as number, 50);
});

test('computeSellWinRate: no closing trades → rate is null', () => {
  const wr = computeSellWinRate([
    { id: 'b', accountId: 'a1', symbol: 'X', companyName: 'X', action: 'BUY', shares: 1, price: 10, total: 10, date: DAY0 },
  ]);
  assert.equal(wr.total, 0);
  assert.equal(wr.rate, null);
});

test('computeRealizedPnL: sums net (after-fee) P&L over SELLs only', () => {
  const txns: PaperTransaction[] = [
    { id: 'b', accountId: 'a1', symbol: 'X', companyName: 'X', action: 'BUY', shares: 1, price: 10, total: 10, date: DAY0 },
    sellTx({ id: 's1', realizedPnL: 40, fee: 2 }),  // net 38
    sellTx({ id: 's2', realizedPnL: -5, fee: 0 }),  // net -5
  ];
  approx(computeRealizedPnL(txns), 33); // buy excluded, 38 + (−5)
});

test('isWinningSell / sellNetPnL: threshold is inclusive at exactly $0.01', () => {
  approx(sellNetPnL({ realizedPnL: 5, fee: 1 }), 4);
  assert.equal(isWinningSell({ realizedPnL: 0.01, fee: 0 }), true);
  assert.equal(isWinningSell({ realizedPnL: 0.0099, fee: 0 }), false);
  // Fees can turn a gross win into a net loss.
  assert.equal(isWinningSell({ realizedPnL: 1, fee: 1 }), false);
});

test('paper equity treats legacy positions as long and short positions as liabilities', () => {
  const account: PaperAccount = {
    id: 'a1', name: 'Tiger', cash: 800, shortCollateral: 600, createdAt: DAY0,
  };
  const legacyLong = pos({ shares: 2, avgCost: 100 });
  const short = pos({
    id: 'short', symbol: 'XYZ', positionType: 'short', shares: 4, avgCost: 100,
  });
  assert.equal(computePaperEquity(account, [legacyLong, short], {
    VOO: { price: 120 }, XYZ: { price: 80 },
  }), 1_320);
  assert.equal(computePaperEquity({ ...account, shortCollateral: 0 }, [legacyLong], {
    VOO: { price: 120 },
  }), 1_040);
});

test('short transaction deltas reconstruct equity without reinterpreting legacy trades', () => {
  const account: PaperAccount = {
    id: 'a1', name: 'Tiger', cash: 800, shortCollateral: 600, createdAt: DAY0,
  };
  const shortOpen: PaperTransaction = {
    id: 'short-open', accountId: 'a1', symbol: 'XYZ', companyName: 'XYZ Corp',
    action: 'SHORT_SELL', shares: 4, price: 100, total: 400, date: DAY365,
    cashDelta: -200, shortCollateralDelta: 600,
  };
  const shortPosition = pos({
    id: 'short', symbol: 'XYZ', positionType: 'short', shares: 4, avgCost: 100,
  });
  const history = buildValueHistory(
    account, [shortOpen], account.cash, [shortPosition], { XYZ: { price: 80, change: 0, pct: 0 } }, DAY365,
  );
  approx(history.at(-1)!.value, 1_080);
  const snapshot = createAccountValueSnapshot(
    'a1', [account], [shortPosition], { XYZ: { price: 80, change: 0, pct: 0 } }, DAY365,
  );
  assert.equal(snapshot?.value, 1_080);
  assert.equal(createAccountValueSnapshot(
    'a1', [{ ...account, id: 'a2' }], [shortPosition], { XYZ: { price: 80, change: 0, pct: 0 } }, DAY365,
  ), null, 'positions from another account must not be valued in this account');
});
