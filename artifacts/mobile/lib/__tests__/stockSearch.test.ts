import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveStockSearchSymbol } from '../stockSearch.ts';

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

test('ambiguous ticker prefixes wait for a user to choose a company suggestion', () => {
  assert.equal(
    resolveStockSearchSymbol('AAP', [apple], null, true),
    null,
  );
});