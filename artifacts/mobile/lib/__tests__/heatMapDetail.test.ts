import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getHeatMapDetailStatRows,
  getHeatMapRangePosition,
  parseHeatMapDetailStats,
} from '../heatMapDetail.ts';

test('heat-map detail stats accept finite provider numbers and ignore invalid values', () => {
  assert.deepEqual(parseHeatMapDetailStats({
    previousClose: 99,
    open: 100,
    dayLow: 98,
    dayHigh: 103,
    fiftyTwoWeekLow: 70,
    fiftyTwoWeekHigh: 120,
    volume: 1_200_000,
    averageVolume3Month: 900_000,
    marketCap: 15_000_000_000,
    beta: 1.2,
    earningsTimestamp: 1_800_000_000,
    targetMeanPrice: 110,
    trailingEps: 4.5,
    totalRevenue: 2_000_000_000,
    circulatingSupply: 19_800_000,
    maxSupply: 21_000_000,
    volume24Hr: 18_400_000_000,
  }), {
    previousClose: 99,
    open: 100,
    dayLow: 98,
    dayHigh: 103,
    fiftyTwoWeekLow: 70,
    fiftyTwoWeekHigh: 120,
    volume: 1_200_000,
    averageVolume: 900_000,
    marketCap: 15_000_000_000,
    beta: 1.2,
    earningsTimestamp: 1_800_000_000,
    targetMeanPrice: 110,
    trailingEps: 4.5,
    totalRevenue: 2_000_000_000,
    circulatingSupply: 19_800_000,
    maxSupply: 21_000_000,
    volume24Hr: 18_400_000_000,
  });
});

test('heat-map detail stats reject non-object payloads and non-finite provider values', () => {
  assert.equal(parseHeatMapDetailStats(null), null);
  assert.equal(parseHeatMapDetailStats([]), null);
  assert.deepEqual(parseHeatMapDetailStats({
    dayLow: Number.NaN,
    dayHigh: Number.POSITIVE_INFINITY,
    volume: '1200',
  }), {
    previousClose: null,
    open: null,
    dayLow: null,
    dayHigh: null,
    fiftyTwoWeekLow: null,
    fiftyTwoWeekHigh: null,
    volume: null,
    averageVolume: null,
    marketCap: null,
    beta: null,
    earningsTimestamp: null,
    targetMeanPrice: null,
    trailingEps: null,
    totalRevenue: null,
    circulatingSupply: null,
    maxSupply: null,
    volume24Hr: null,
  });
});

test('crypto detail rows show supply and 24-hour volume instead of stock-only metrics', () => {
  const stats = parseHeatMapDetailStats({
    circulatingSupply: 19_800_000,
    maxSupply: 21_000_000,
    volume24Hr: 18_400_000_000,
    marketCap: 1_200_000_000_000,
    beta: 1.2,
    earningsTimestamp: 1_800_000_000,
    trailingEps: 4.5,
  });

  assert.deepEqual(getHeatMapDetailStatRows('cryptocurrency', stats, null, false), [
    { label: 'Circulating Supply', value: '19.8M' },
    { label: 'Max Supply', value: '21M' },
    { label: '24h Volume', value: '$18.4B' },
    { label: 'Market Cap', value: '$1.2T' },
  ]);
});

test('crypto detail rows mark unsupported provider values unavailable and retain quote market cap', () => {
  const stats = parseHeatMapDetailStats({
    circulatingSupply: 1000,
    volume24Hr: 0,
  });

  assert.deepEqual(getHeatMapDetailStatRows('cryptocurrency', stats, 2_500_000, false), [
    { label: 'Circulating Supply', value: '1K' },
    { label: 'Max Supply', value: '—' },
    { label: '24h Volume', value: '$0' },
    { label: 'Market Cap', value: '$2.5M' },
  ]);
  assert.deepEqual(
    getHeatMapDetailStatRows('cryptocurrency', null, null, true),
    [
      { label: 'Circulating Supply', value: 'Loading…' },
      { label: 'Max Supply', value: 'Loading…' },
      { label: '24h Volume', value: 'Loading…' },
      { label: 'Market Cap', value: 'Loading…' },
    ],
  );
});

test('stock detail rows keep their stock-specific statistics', () => {
  const stats = parseHeatMapDetailStats({ beta: 1.234, earningsTimestamp: 1_800_000_000 });
  const rows = getHeatMapDetailStatRows('stock', stats, null, false);

  assert.deepEqual(rows.map(({ label }) => label), [
    'Previous Close',
    'Open',
    'Volume',
    'Avg. Volume (3M)',
    'Market Cap',
    'Beta',
    'Earnings Date',
    '1y Target Est.',
    'EPS (TTM)',
    'Revenue (TTM)',
  ]);
  assert.equal(rows.find(({ label }) => label === 'Beta')?.value, '1.23');
});

test('heat-map range marker is clamped and rejects unusable ranges', () => {
  assert.equal(getHeatMapRangePosition(25, 0, 100), 25);
  assert.equal(getHeatMapRangePosition(-5, 0, 100), 0);
  assert.equal(getHeatMapRangePosition(120, 0, 100), 100);
  assert.equal(getHeatMapRangePosition(20, 20, 20), null);
  assert.equal(getHeatMapRangePosition(20, null, 30), null);
});
