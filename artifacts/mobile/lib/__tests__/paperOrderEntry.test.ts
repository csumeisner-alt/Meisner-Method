import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  calculateSharesForBuyingPower,
  formatProviderMarketSession,
  formatProviderPriceSource,
  getMarketOrderQuoteError,
  getAvailableSellShares,
  getOrderEstimatePrice,
  getOrderQuoteState,
  getPennyQuoteStatus,
  isPennyStockMayhemEligible,
} from '../paperOrderEntry.ts';

test('buying-power shortcuts round fractional shares down to an affordable amount', () => {
  const shares = calculateSharesForBuyingPower(1_000, 33.33);
  assert.ok(shares > 0);
  assert.ok(shares * 33.33 <= 1_000);
  assert.equal(calculateSharesForBuyingPower(1_000, 33.33, 0.5) * 33.33 <= 500, true);
  assert.equal(calculateSharesForBuyingPower(1_000, 0), 0);
});

test('order estimates use the selected type inputs and worst stop-limit trigger', () => {
  assert.equal(getOrderEstimatePrice({ orderType: 'limit', currentPrice: 100, limitPrice: 95 }), 95);
  assert.equal(getOrderEstimatePrice({ orderType: 'stop', currentPrice: 100, stopPrice: 105 }), 105);
  assert.equal(getOrderEstimatePrice({ orderType: 'stop_limit', currentPrice: 100, stopPrice: 105, limitPrice: 103 }), 105);
  assert.equal(getOrderEstimatePrice({ orderType: 'trailing_stop', currentPrice: 100, trailPct: 5 }), 105);
});

test('quote status distinguishes provider-backed freshness from missing or stale data', () => {
  const now = 1_800_000_000_000;
  const fresh = {
    price: 100,
    change: 1,
    pct: 1,
    priceTimestamp: now / 1000 - 60,
    fetchedAtMs: now - 1_000,
  };
  assert.equal(getOrderQuoteState(fresh, now), 'fresh');
  assert.equal(getOrderQuoteState({ ...fresh, priceTimestamp: now / 1000 - 60 * 60 }, now), 'stale');
  assert.equal(getOrderQuoteState({ ...fresh, priceTimestamp: null }, now), 'stale');
  assert.equal(getOrderQuoteState(undefined, now), 'unavailable');
});

test('Penny Stock Mayhem search eligibility requires verified classification, a current quote, and under $20', () => {
  const now = 1_800_000_000_000;
  const current = {
    price: 19.99,
    change: 1,
    pct: 1,
    priceTimestamp: now / 1000 - 60,
    fetchedAtMs: now - 1_000,
    marketSession: 'REGULAR',
  };
  assert.equal(getPennyQuoteStatus(current, now), 'current');
  assert.equal(isPennyStockMayhemEligible('stock', current, now), true);
  assert.equal(isPennyStockMayhemEligible('etf', current, now), true);
  assert.equal(isPennyStockMayhemEligible('unknown', current, now), false);
  assert.equal(isPennyStockMayhemEligible('stock', { ...current, price: 20 }, now), false);
  assert.equal(isPennyStockMayhemEligible('stock', { ...current, price: 20.01 }, now), false);
  assert.equal(getPennyQuoteStatus({ ...current, priceSource: 'previous_close' }, now), 'delayed');
  assert.equal(getPennyQuoteStatus({ ...current, marketSession: 'CLOSED' }, now), 'delayed');
  assert.equal(getPennyQuoteStatus({ ...current, priceTimestamp: now / 1000 - 3_600 }, now), 'stale');
  assert.equal(getPennyQuoteStatus(undefined, now), 'unavailable');
});

test('market order quote guard accepts valid fresh and stale references, but not missing or changed prices', () => {
  const now = 1_800_000_000_000;
  const fresh = {
    price: 100,
    change: 1,
    pct: 1,
    priceTimestamp: now / 1000 - 60,
    fetchedAtMs: now - 1_000,
  };
  const stale = { ...fresh, priceTimestamp: now / 1000 - 60 * 60 };
  assert.equal(getOrderQuoteState(fresh, now), 'fresh');
  assert.equal(getOrderQuoteState(stale, now), 'stale');

  for (const quote of [fresh, stale]) {
    assert.equal(getMarketOrderQuoteError(quote, 100), null);
    assert.equal(getOrderEstimatePrice({ orderType: 'market', currentPrice: quote.price }), 100);
  }

  assert.match(getMarketOrderQuoteError(undefined, 100) ?? '', /quote is unavailable/);
  for (const price of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.match(getMarketOrderQuoteError({ price }, 100) ?? '', /quote is unavailable/);
  }
  assert.match(getMarketOrderQuoteError({ price: 101 }, 100) ?? '', /changed after review/);
  assert.match(getMarketOrderQuoteError({ price: 100 }, Number.NaN) ?? '', /reviewed provider price/);
});

test('provider sessions display only recognized states', () => {
  assert.equal(formatProviderMarketSession('PRE'), 'Pre-market');
  assert.equal(formatProviderMarketSession('REGULAR'), 'Regular session');
  assert.equal(formatProviderMarketSession('unknown'), null);
});

test('price-source labels distinguish previous close and closed-market quotes', () => {
  assert.equal(formatProviderPriceSource('previous_close'), 'Previous close');
  assert.equal(formatProviderPriceSource('yahoo-chart-previous-close'), 'Previous close');
  assert.equal(formatProviderPriceSource('premarket'), 'Pre-market price');
  assert.equal(formatProviderPriceSource('after_hours'), 'After-hours price');
  assert.equal(formatProviderPriceSource('unknown'), null);
});

test('sell quantity shortcuts respect the selected account and pending share reservations', () => {
  const position = {
    id: 'p1',
    accountId: 'a1',
    symbol: 'AAPL',
    companyName: 'Apple',
    shares: 4,
    avgCost: 100,
    openedAt: '2025-01-01T00:00:00Z',
    dividendYield: 0,
    sector: 'Technology',
  };
  const pendingSell = {
    id: 'o1',
    accountId: 'a1',
    symbol: 'AAPL',
    companyName: 'Apple',
    orderType: 'limit' as const,
    side: 'sell' as const,
    shares: 1.5,
    limitPrice: 110,
    status: 'pending' as const,
    placedAt: '2025-01-01T00:00:00Z',
  };
  assert.equal(getAvailableSellShares(position, [pendingSell], 'a1', 'AAPL'), 2.5);
  assert.equal(getAvailableSellShares(position, [pendingSell], 'a2', 'AAPL'), 0);
  assert.equal(getAvailableSellShares(position, [pendingSell], 'a1', 'AAPL', 'o1'), 4);
});
