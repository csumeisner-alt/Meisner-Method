import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildPaperPortfolioPreloadSummaries,
  computePaperPortfolioPreloadMetrics,
  createPaperPortfolioPreloadCache,
  parsePaperPortfolioPreloadCache,
  parsePaperQuoteCache,
  preloadPaperPortfolioQuotes,
  publishPaperPortfolioPreload,
  getPaperPortfolioPreloadState,
  mergePaperPreloadQuotes,
} from '../paperPortfolioPreload.ts';
import { loadOrCreatePaperCache, PAPER_CACHE_KEY } from '../paperCache.ts';
import { INITIAL_BALANCE, type LiveQuote } from '../paperMath.ts';

const day = '2026-11-18T15:00:00.000Z';

function account(id: string, cash: number) {
  return { id, name: id, cash, createdAt: day };
}

function position(id: string, accountId: string, symbol: string, shares: number) {
  return {
    id,
    accountId,
    symbol,
    companyName: symbol,
    shares,
    avgCost: 100,
    openedAt: day,
    dividendYield: 0,
    sector: 'Technology',
  };
}

const quote = (price: number, fetchedAtMs = 1_800_000_000_000): LiveQuote => ({
  price,
  change: 1,
  pct: 1,
  priceTimestamp: 1_800_000_000,
  fetchedAtMs,
});

test('startup summaries isolate the three permanent portfolios and omit trade history', () => {
  const cache = {
    accounts: [
      account('portfolio-1', 500),
      account('portfolio-2', 600),
      account('portfolio-3', 700),
      account('paper-event:event-1', 900),
    ],
    positions: [
      position('position-1', 'portfolio-1', 'AAA', 2),
      position('position-2', 'portfolio-2', 'BBB', 3),
      position('position-3', 'portfolio-3', 'CCC', 4),
      position('event-position', 'paper-event:event-1', 'EVT', 20),
    ],
    transactions: [
      { id: 'sell-1', accountId: 'portfolio-1', action: 'SELL', realizedPnL: 25, fee: 5 },
      { id: 'sell-2', accountId: 'portfolio-2', action: 'BUY_TO_COVER', realizedPnL: -5, fee: 1 },
      { id: 'event-sell', accountId: 'paper-event:event-1', action: 'SELL', realizedPnL: 500, fee: 0 },
    ],
    orders: [],
    lots: [],
    activeId: 'portfolio-1',
  } as unknown as Parameters<typeof buildPaperPortfolioPreloadSummaries>[0];

  const summaries = buildPaperPortfolioPreloadSummaries(cache);
  const quotes = { AAA: quote(120), BBB: quote(120), CCC: quote(120) };

  assert.deepEqual(summaries.map((summary) => summary.account.id), [
    'portfolio-1',
    'portfolio-2',
    'portfolio-3',
  ]);
  assert.deepEqual(summaries.map((summary) => summary.positions.map((item) => item.accountId)), [
    ['portfolio-1'],
    ['portfolio-2'],
    ['portfolio-3'],
  ]);
  assert.deepEqual(summaries.map((summary) => summary.realizedPnL), [20, -6, 0]);
  assert.deepEqual(summaries.map((summary) => summary.performance.trades), [1, 1, 0]);
  assert.equal(
    JSON.stringify(createPaperPortfolioPreloadCache(summaries)).includes('sell-1'),
    false,
    'the startup cache stores derived metrics, not transaction history',
  );

  const metrics = summaries.map((summary) => computePaperPortfolioPreloadMetrics(summary, quotes));
  assert.deepEqual(metrics.map((item) => item.buyingPower), [500, 600, 700]);
  assert.deepEqual(metrics.map((item) => item.marketValue), [240, 360, 480]);
  assert.deepEqual(metrics.map((item) => item.unrealizedPnL), [40, 60, 80]);
  assert.deepEqual(metrics.map((item) => item.equity), [740, 960, 1180]);
  assert.deepEqual(metrics.map((item) => item.totalReturn), [
    740 - INITIAL_BALANCE,
    960 - INITIAL_BALANCE,
    1180 - INITIAL_BALANCE,
  ]);
});

test('preloading fetches unique position quotes in parallel and retains cache on failures', async () => {
  const summaries = buildPaperPortfolioPreloadSummaries({
    accounts: [account('one', 100), account('two', 200), account('three', 300)],
    positions: [
      position('one-a', 'one', 'AAA', 1),
      position('one-b', 'one', 'SHARED', 1),
      position('two-a', 'two', 'BBB', 1),
      position('three-a', 'three', 'SHARED', 2),
    ],
    transactions: [],
  } as Parameters<typeof buildPaperPortfolioPreloadSummaries>[0]);
  const requested: string[] = [];
  let active = 0;
  let maxActive = 0;
  const cached = { BBB: quote(80, 1_800_000_000_001) };

  const quotes = await preloadPaperPortfolioQuotes(summaries, cached, async (symbol) => {
    requested.push(symbol);
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    if (symbol === 'BBB') throw new Error('temporarily unavailable');
    return quote(symbol === 'AAA' ? 110 : 120, 1_800_000_000_002);
  });

  assert.deepEqual([...requested].sort(), ['AAA', 'BBB', 'SHARED']);
  assert.ok(maxActive > 1, 'independent quotes should be requested concurrently');
  assert.equal(quotes.AAA.price, 110);
  assert.equal(quotes.SHARED.price, 120);
  assert.equal(quotes.BBB.price, 80, 'a failed refresh must keep its last valid quote');

  publishPaperPortfolioPreload(summaries, quotes);
  const state = getPaperPortfolioPreloadState();
  assert.equal(state.portfolios.length, 3);
  for (const id of ['one', 'two', 'three']) {
    const selected = state.portfolios.find((portfolio) => portfolio.account.id === id);
    assert.ok(selected, `${id} should be ready for immediate selection`);
    assert.equal(selected.positions.every((item) => item.accountId === id), true);
  }
  assert.equal(state.portfolios.find((portfolio) => portfolio.account.id === 'three')?.equity, 540);
});

test('quote and summary caches reject malformed values but keep valid recent prices', () => {
  const quotes = parsePaperQuoteCache(JSON.stringify({
    AAA: quote(125),
    BAD: { price: 0, change: 0, pct: 0 },
    INVALID: null,
  }));
  assert.deepEqual(Object.keys(quotes), ['AAA']);
  assert.equal(quotes.AAA.price, 125);

  const summary = parsePaperPortfolioPreloadCache(JSON.stringify(
    createPaperPortfolioPreloadCache(buildPaperPortfolioPreloadSummaries({
      accounts: [account('one', 100)],
      positions: [position('one-a', 'one', 'AAA', 1)],
      transactions: [],
    } as Parameters<typeof buildPaperPortfolioPreloadSummaries>[0])),
  ));
  assert.equal(summary?.portfolios.length, 1);
  assert.equal(parsePaperPortfolioPreloadCache('{broken'), null);
});

test('preload summaries reject account or Event Arena data from another account', () => {
  const valid = buildPaperPortfolioPreloadSummaries({
    accounts: [account('one', 100)],
    positions: [position('one-a', 'one', 'AAA', 1)],
    transactions: [],
  } as Parameters<typeof buildPaperPortfolioPreloadSummaries>[0]);
  const contaminated = createPaperPortfolioPreloadCache([{
    ...valid[0],
    positions: [
      ...valid[0].positions,
      position('wrong-account', 'two', 'BBB', 2),
    ],
  }]);
  const eventPortfolio = createPaperPortfolioPreloadCache([{
    ...valid[0],
    account: account('paper-event:event-1', 100),
  }]);

  assert.equal(parsePaperPortfolioPreloadCache(JSON.stringify(contaminated)), null);
  assert.equal(parsePaperPortfolioPreloadCache(JSON.stringify(eventPortfolio)), null);
});

test('slower quote responses cannot overwrite a newer cached observation', async () => {
  const newer = quote(150, 1_800_000_000_100);
  const older = quote(120, 1_800_000_000_050);
  const portfolios = buildPaperPortfolioPreloadSummaries({
    accounts: [account('one', 100)],
    positions: [position('one-a', 'one', 'AAA', 1)],
    transactions: [],
  } as Parameters<typeof buildPaperPortfolioPreloadSummaries>[0]);

  const quotes = await preloadPaperPortfolioQuotes(portfolios, { AAA: newer }, async () => older);
  assert.equal(quotes.AAA.price, 150);
  assert.equal(quotes.AAA.fetchedAtMs, newer.fetchedAtMs);
});

test('merging an unchanged cached quote preserves the published state reference', () => {
  publishPaperPortfolioPreload([], { AAA: quote(125) });
  const state = getPaperPortfolioPreloadState();
  const merged = mergePaperPreloadQuotes({ AAA: { ...state.quotes.AAA } });
  assert.equal(merged, state, 'unchanged quote values should not trigger dependent screen updates');
});

test('first-launch cache creation shares the same three unchanged starting accounts', async () => {
  const saved = new Map<string, string>();
  const storage = {
    async getItem(key: string) { return saved.get(key) ?? null; },
    async setItem(key: string, value: string) { saved.set(key, value); },
  };
  const [first, second] = await Promise.all([
    loadOrCreatePaperCache(storage),
    loadOrCreatePaperCache(storage),
  ]);

  assert.ok(first);
  assert.ok(second);
  assert.deepEqual(first.accounts.map((item) => item.id), second.accounts.map((item) => item.id));
  assert.deepEqual(first.accounts.map((item) => item.cash), [
    INITIAL_BALANCE,
    INITIAL_BALANCE,
    INITIAL_BALANCE,
  ]);
  assert.equal(saved.has(PAPER_CACHE_KEY), true);
  assert.deepEqual(first.positions, []);
  assert.deepEqual(first.transactions, []);
});

test('reopening the local cache restores the selected account and keeps ledgers separate', async () => {
  const original = {
    accounts: [account('one', 900), account('two', 700), account('three', 500)],
    positions: [
      position('one-position', 'one', 'AAA', 1),
      position('two-position', 'two', 'BBB', 2),
    ],
    transactions: [],
    orders: [],
    lots: [],
    activeId: 'two',
  };
  const saved = new Map<string, string>([[PAPER_CACHE_KEY, JSON.stringify(original)]]);
  const reopened = await loadOrCreatePaperCache({
    async getItem(key: string) { return saved.get(key) ?? null; },
    async setItem(key: string, value: string) { saved.set(key, value); },
  });

  assert.equal(reopened?.activeId, 'two');
  assert.equal(reopened?.accounts.find((item) => item.id === 'two')?.cash, 700);
  assert.deepEqual(
    reopened?.positions.filter((item) => item.accountId === reopened.activeId).map((item) => item.symbol),
    ['BBB'],
  );
  assert.deepEqual(reopened?.positions.filter((item) => item.accountId === 'one').map((item) => item.symbol), ['AAA']);
});
