import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getBuyOrderDetails,
  getStockSearchFeedback,
  resolveStockSearchSymbol,
} from '../stockSearch.ts';

const apple = { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ' };

test('company names require a selected suggestion instead of being sent as ticker symbols', () => {
  assert.equal(resolveStockSearchSymbol('Apple', [apple], null, true), null);
  assert.equal(resolveStockSearchSymbol('APPLE', [apple], null, true), null);
  assert.equal(resolveStockSearchSymbol('Apple', [apple], apple, false), 'AAPL');
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