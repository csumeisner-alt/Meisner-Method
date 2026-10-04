import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createLatestRequestGuard,
  getBuyOrderDetails,
  getStockSearchQueryFromKey,
  getStockSearchFeedback,
  isStockSearchCurrent,
  isStockSearchSelectionCurrent,
  resolveStockSearchSymbol,
} from '../stockSearch.ts';

const apple = { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ' };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

test('company names require a selected suggestion instead of being sent as ticker symbols', () => {
  assert.equal(resolveStockSearchSymbol('Apple', [apple], null, true), null);
  assert.equal(resolveStockSearchSymbol('APPLE', [apple], null, true), null);
  assert.equal(resolveStockSearchSymbol('Apple', [apple], apple, false), 'AAPL');
});

test('a delayed lookup cannot replace company details from a newer lookup', async () => {
  const guard = createLatestRequestGuard();
  const appleInfo = {
    companyName: 'Apple Inc.',
    currentPrice: 225.5,
    dividendYield: 0.004,
    dividendRate: 0.96,
    expenseRatio: 0,
    sector: 'Technology',
  };
  const microsoftInfo = {
    companyName: 'Microsoft Corporation',
    currentPrice: 510.25,
    dividendYield: 0.006,
    dividendRate: 3.08,
    expenseRatio: 0,
    sector: 'Technology',
  };
  let stockInfo: typeof appleInfo | null = null;

  const firstResponse = deferred<typeof appleInfo>();
  const firstRequestId = guard.begin();
  const firstRequest = firstResponse.promise.then(result => {
    if (guard.isCurrent(firstRequestId)) stockInfo = result;
  });

  // Closing the modal invalidates its outstanding lookup before another opens.
  guard.invalidate();
  const secondResponse = deferred<typeof microsoftInfo>();
  const secondRequestId = guard.begin();
  const secondRequest = secondResponse.promise.then(result => {
    if (guard.isCurrent(secondRequestId)) stockInfo = result;
  });

  secondResponse.resolve(microsoftInfo);
  await secondRequest;
  firstResponse.resolve(appleInfo);
  await firstRequest;

  assert.deepEqual(getBuyOrderDetails('MSFT', stockInfo), {
    symbol: 'MSFT',
    companyName: 'Microsoft Corporation',
    currentPrice: 510.25,
    stockInfo: microsoftInfo,
  });
});

test('a late company-search response stays tied to its query and cannot be selected', async () => {
  const cache = new Map<string, { query: string; results: typeof apple[] }>();
  const makeSearch = (query: string) => {
    let resolve!: (results: typeof apple[]) => void;
    const request = new Promise<typeof apple[]>(res => {
      resolve = res;
    }).then(results => {
      cache.set(query, { query, results });
    });
    return { resolve: (results: typeof apple[]) => resolve(results), request };
  };
  const olderSearch = makeSearch('Apple');
  const newerSearch = makeSearch('Microsoft');

  newerSearch.resolve([{ symbol: 'MSFT', name: 'Microsoft Corporation', exchange: 'NASDAQ' }]);
  await newerSearch.request;
  olderSearch.resolve([apple]);
  await olderSearch.request;

  const currentResult = cache.get('Microsoft');
  const lateOlderResult = cache.get('Apple');
  assert.ok(currentResult);
  assert.ok(lateOlderResult);
  assert.deepEqual(currentResult.results.map(result => result.symbol), ['MSFT']);
  assert.equal(
    isStockSearchCurrent({
      input: 'Microsoft',
      settledQuery: 'Microsoft',
      resultQuery: lateOlderResult.query,
      isPlaceholderData: false,
    }),
    false,
  );
  assert.equal(
    isStockSearchCurrent({
      input: 'Microsoft',
      settledQuery: 'Microsoft',
      resultQuery: currentResult.query,
      isPlaceholderData: false,
    }),
    true,
  );

  const lateApple = lateOlderResult.results[0]!;
  const latestMicrosoft = currentResult.results[0]!;
  const selected: typeof apple[] = [];
  const selectResult = (stock: typeof apple, selectionQuery: string) => {
    if (isStockSearchSelectionCurrent({
      input: 'Microsoft',
      settledQuery: 'Microsoft',
      resultQuery: 'Microsoft',
      selectionQuery,
      isPlaceholderData: false,
    })) {
      selected.push(stock);
    }
  };

  selectResult(lateApple, lateOlderResult.query);
  assert.equal(selected.length, 0);
  selectResult(latestMicrosoft, currentResult.query);
  assert.deepEqual(selected.map(stock => stock.symbol), ['MSFT']);
});

test('company search query identity is read from the active query key', () => {
  assert.equal(getStockSearchQueryFromKey(['/api/stocks/search', { q: 'Microsoft' }]), 'Microsoft');
  assert.equal(getStockSearchQueryFromKey(['/api/stocks/search', { q: 42 }]), null);
  assert.equal(getStockSearchQueryFromKey(['/api/stocks/search']), null);
  assert.equal(
    isStockSearchCurrent({
      input: 'Microsoft',
      settledQuery: 'Microsoft',
      resultQuery: 'Microsoft',
      isPlaceholderData: true,
    }),
    false,
  );
});

test('ticker entry resolves case-insensitively when a matching suggestion exists', () => {
  assert.equal(resolveStockSearchSymbol('aapl', [apple], null, false), 'AAPL');
  assert.equal(resolveStockSearchSymbol('AAPL', [apple], null, false), 'AAPL');
});

test('raw uppercase tickers remain available when search returns no matches or fails', () => {
  assert.equal(resolveStockSearchSymbol('AAPL', [], null, true), 'AAPL');
  assert.equal(resolveStockSearchSymbol('aapl', [], null, true), null);
  assert.equal(resolveStockSearchSymbol('Apple', [], null, true), null);
  assert.equal(resolveStockSearchSymbol('F', [], null, true), 'F');
});

test('a selected company carries its canonical ticker and stock information into the order sheet', () => {
  const selectedSymbol = resolveStockSearchSymbol('Apple', [apple], apple, false);
  assert.equal(selectedSymbol, 'AAPL');

  const appleInfo = {
    companyName: 'Apple Inc.',
    currentPrice: 225.5,
    dividendYield: 0.004,
    dividendRate: 0.96,
    expenseRatio: 0,
    sector: 'Technology',
  };
  assert.deepEqual(getBuyOrderDetails(selectedSymbol ?? '', appleInfo), {
    symbol: 'AAPL',
    companyName: 'Apple Inc.',
    currentPrice: 225.5,
    stockInfo: appleInfo,
  });
});

test('company search gives clear loading, no-match, and service-error feedback', () => {
  assert.deepEqual(
    getStockSearchFeedback({
      isFetching: true,
      isError: false,
      isSuccess: false,
      suggestionCount: 0,
    }),
    { kind: 'loading', message: 'Searching companies…' },
  );
  assert.deepEqual(
    getStockSearchFeedback({
      isFetching: false,
      isError: false,
      isSuccess: true,
      suggestionCount: 0,
    }),
    { kind: 'empty', message: 'No matching companies. Enter a ticker symbol if you know it.' },
  );
  assert.deepEqual(
    getStockSearchFeedback({
      isFetching: false,
      isError: true,
      isSuccess: false,
      suggestionCount: 0,
    }),
    {
      kind: 'error',
      message: 'Company search is unavailable. Enter a ticker symbol to look it up directly.',
    },
  );
});

test('an uppercase ticker remains usable after company search fails', () => {
  assert.equal(resolveStockSearchSymbol('AAPL', [], null, true), 'AAPL');
  assert.equal(resolveStockSearchSymbol('Apple', [], null, true), null);
});

test('ambiguous ticker prefixes wait for a user to choose a company suggestion', () => {
  assert.equal(
    resolveStockSearchSymbol('AAP', [apple], null, true),
    null,
  );
});