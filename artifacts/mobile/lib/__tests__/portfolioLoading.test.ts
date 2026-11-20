import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  fetchPortfolioQuotes,
  parsePortfolioQuoteCache,
  startPortfolioTradesLoad,
  updatePortfolioQuoteCache,
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
  const unavailable: string[][] = [];
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
    (symbols) => unavailable.push(symbols),
  );

  assert.deepEqual(requests, [['VOO', 'AAPL']]);
  const voo: Quote = { currentPrice: 500, priceChange: 1, priceChangePercent: 0.2 };
  assert.deepEqual(updates, [['VOO', voo]]);
  assert.deepEqual(unavailable, [['AAPL']]);
});

test('a failed-symbol retry requests only that symbol and ignores unrelated failures', async () => {
  const requests: string[][] = [];
  const unavailable: string[][] = [];

  await fetchPortfolioQuotes(
    ['AAPL'],
    async (symbols) => {
      requests.push(symbols);
      return {
        quotes: [],
        unavailableSymbols: ['AAPL', 'MSFT'],
      };
    },
    () => assert.fail('No quote should be published for an unavailable symbol'),
    (symbols) => unavailable.push(symbols),
  );

  assert.deepEqual(requests, [['AAPL']]);
  assert.deepEqual(unavailable, [['AAPL']]);
});

test('retrying one symbol preserves the already-refreshed quotes for other holdings', async () => {
  const requests: string[][] = [];
  const quotes: Record<string, Quote> = {
    AAPL: { currentPrice: 200, priceChange: 1, priceChangePercent: 0.5 },
    MSFT: { currentPrice: 400, priceChange: 2, priceChangePercent: 0.5 },
  };
  const latestApple: Quote = { currentPrice: 205, priceChange: 5, priceChangePercent: 2.5 };

  await fetchPortfolioQuotes(
    ['AAPL'],
    async (symbols) => {
      requests.push(symbols);
      return { quotes: [{ symbol: 'AAPL', ...latestApple }], unavailableSymbols: [] };
    },
    (symbol, quote) => { quotes[symbol] = quote; },
  );

  assert.deepEqual(requests, [['AAPL']]);
  assert.deepEqual(quotes, { AAPL: latestApple, MSFT: { currentPrice: 400, priceChange: 2, priceChangePercent: 0.5 } });
});

test('saved portfolio quotes keep valid values and timestamps while ignoring corrupt entries', () => {
  const cache = parsePortfolioQuoteCache(JSON.stringify({
    VOO: {
      quote: { currentPrice: 500, priceChange: 2, priceChangePercent: 0.4, expenseRatio: 0.0003 },
      updatedAt: '2026-10-30T14:00:00.000Z',
    },
    BAD_TIME: {
      quote: { currentPrice: 10, priceChange: 0, priceChangePercent: 0 },
      updatedAt: 'not a date',
    },
    BAD_QUOTE: {
      quote: { currentPrice: 'unknown', priceChange: 0, priceChangePercent: 0 },
      updatedAt: '2026-10-30T14:00:00.000Z',
    },
  }));

  assert.deepEqual(cache, {
    VOO: {
      quote: { currentPrice: 500, priceChange: 2, priceChangePercent: 0.4, expenseRatio: 0.0003 },
      updatedAt: '2026-10-30T14:00:00.000Z',
    },
  });
  assert.deepEqual(parsePortfolioQuoteCache('invalid JSON'), {});
  assert.deepEqual(parsePortfolioQuoteCache(null), {});
});

test('a successful quote refresh replaces only that symbol in the saved cache', () => {
  const priorQuote: Quote = { currentPrice: 500, priceChange: 1, priceChangePercent: 0.2 };
  const nextQuote: Quote = { currentPrice: 510, priceChange: 10, priceChangePercent: 2 };
  const prior = {
    VOO: { quote: priorQuote, updatedAt: '2026-10-29T14:00:00.000Z' },
    AAPL: { quote: { currentPrice: 200, priceChange: 1, priceChangePercent: 0.5 }, updatedAt: '2026-10-29T14:00:00.000Z' },
  };

  assert.deepEqual(
    updatePortfolioQuoteCache(prior, 'VOO', nextQuote, '2026-10-30T14:00:00.000Z'),
    {
      VOO: { quote: nextQuote, updatedAt: '2026-10-30T14:00:00.000Z' },
      AAPL: prior.AAPL,
    },
  );
});

test('Portfolio screen wires cache-first trades and batched quote updates', () => {
  const screen = readFileSync('app/(tabs)/portfolio.tsx', 'utf8');
  assert.match(screen, /startPortfolioTradesLoad\(/);
  assert.match(screen, /event\.source === 'cache' && event\.trades\.length === 0/);
  assert.match(screen, /fetchPortfolioQuotes\(/);
  assert.match(screen, /apiFetch<PortfolioQuoteBatch>\('\/api\/stocks\/quotes'/);
  assert.match(screen, /QUOTES_CACHE_KEY = '@stocksense\/portfolio_quotes_v1'/);
  assert.match(screen, /parsePortfolioQuoteCache\(/);
  assert.match(screen, /updatePortfolioQuoteCache\(/);
  assert.match(screen, /quoteCacheRef\.current = nextCache/);
  assert.doesNotMatch(screen, /quoteSourceNotice|Live quotes|Saved estimates \(not live\)/);
  assert.doesNotMatch(screen, /Showing saved trades\. Couldn’t refresh from your account\./);
  assert.match(screen, /refreshControl=\{<RefreshControl refreshing=\{refreshing\} onRefresh=\{onRefresh\}/);
  assert.match(screen, /Latest quote unavailable/);
  assert.match(screen, /fetchAllQuotes\(\[symbol\]\)/);
  assert.match(screen, /portfolio-quote-retry-\$\{position\.symbol\}/);
});

test('Portfolio keeps the unlocked Bank visible and explains weekday closure on tap', () => {
  const screen = readFileSync('app/(tabs)/portfolio.tsx', 'utf8');
  assert.match(screen, /BREW_BANK_ENABLED && brewBankUnlocked && \(\s*<Pressable/);
  assert.match(screen, /bankEntryStatus === 'weekday-closed'/);
  assert.match(screen, /setBankClosedInfoVisible\(true\)/);
  assert.match(screen, /testID="central-bank-closed-info"/);
  assert.match(screen, /open free on weekends\. For weekday access, buy a key in the Bank Shop for 5 Brew Tokens; each key grants 12 hours\./);
  assert.match(screen, /getNextBrewBankFreeOpening\(countdownNow\)/);
  assert.match(screen, /formatBrewBankFreeOpeningCountdown\(countdownNow\)/);
  assert.match(screen, /nextBankFreeOpening\.toLocaleString\(undefined/);
  assert.match(screen, /testID="central-bank-next-free-opening"/);
  assert.match(screen, /testID="central-bank-reminder-toggle"/);
  assert.match(screen, /scheduleBrewBankReminder\(getNextBrewBankFreeOpening\(Date\.now\(\)\)\)/);
  assert.match(screen, /cancelScheduledNotificationAsync\(bankReminder\.notificationId\)/);
  assert.match(screen, /isBrewBankReminderPending\(saved\.openingAt, now\)/);
  assert.match(screen, /setInterval\(\(\) => setCountdownNow\(Date\.now\(\)\), 1000\)/);
  assert.doesNotMatch(screen, /brewBankUnlocked && \(isWeekend \|\| bankKeys > 0 \|\| hasActiveBankAccess\)/);
});
