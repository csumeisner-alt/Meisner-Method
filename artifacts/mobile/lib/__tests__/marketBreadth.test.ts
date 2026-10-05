import assert from 'node:assert/strict';
import test from 'node:test';
import { getMarketBreadthInsight, type MarketBreadthQuote } from '../marketBreadth.ts';

function quote(returnPercent: number | null, priceTimestamp = 1_000): MarketBreadthQuote {
  return {
    assetType: 'stock',
    price: 100,
    priceTimestamp,
    returnPercent,
  };
}

test('market insight turns green when at least 55 percent of fresh stocks are positive', () => {
  const quotes = [
    ...Array.from({ length: 55 }, () => quote(1)),
    ...Array.from({ length: 45 }, () => quote(0)),
  ];

  assert.deepEqual(getMarketBreadthInsight(quotes, 1_000), {
    tone: 'HOT',
    greenPercent: 55,
    redPercent: 0,
    greenCount: 55,
    redCount: 0,
    quoted: 100,
  });
});

test('market insight turns orange-red when at least 55 percent of fresh stocks are negative', () => {
  const quotes = [
    ...Array.from({ length: 55 }, () => quote(-1)),
    ...Array.from({ length: 45 }, () => quote(0)),
  ];

  assert.deepEqual(getMarketBreadthInsight(quotes, 1_000), {
    tone: 'COLD',
    greenPercent: 0,
    redPercent: 55,
    greenCount: 0,
    redCount: 55,
    quoted: 100,
  });
});

test('market insight excludes stale, unavailable, and neutral-band quotes from directional counts', () => {
  const staleTimestamp = 1_000 - 121 * 60 * 60;
  const quotes = [
    ...Array.from({ length: 54 }, () => quote(1)),
    ...Array.from({ length: 46 }, () => quote(-1)),
    quote(2, staleTimestamp),
    quote(null),
  ];

  assert.deepEqual(getMarketBreadthInsight(quotes, 1_000), {
    tone: 'NEUTRAL',
    greenPercent: 54,
    redPercent: 46,
    greenCount: 54,
    redCount: 46,
    quoted: 100,
  });
});

test('market insight shows the count and rounded percentage for a partial quote sample', () => {
  const quotes = [
    ...Array.from({ length: 56 }, () => quote(1)),
    ...Array.from({ length: 38 }, () => quote(0)),
  ];

  assert.deepEqual(getMarketBreadthInsight(quotes, 1_000), {
    tone: 'HOT',
    greenPercent: 60,
    redPercent: 0,
    greenCount: 56,
    redCount: 0,
    quoted: 94,
  });
});

test('market insight has no percentage when no fresh quote can be counted', () => {
  assert.deepEqual(getMarketBreadthInsight([], 1_000), {
    tone: 'NEUTRAL',
    greenPercent: null,
    redPercent: null,
    greenCount: 0,
    redCount: 0,
    quoted: 0,
  });
});