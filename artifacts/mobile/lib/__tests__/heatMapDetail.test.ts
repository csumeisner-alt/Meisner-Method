import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatHeatMapRegimeReturn,
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
    maxSupplyStatus: 'capped',
    volume24Hr: 18_400_000_000,
    etfProfile: null,
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
    maxSupplyStatus: 'capped',
    volume24Hr: 18_400_000_000,
    etfProfile: null,
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
    maxSupplyStatus: 'unreported',
    volume24Hr: null,
    etfProfile: null,
  });
});

test('crypto detail rows show supply and 24-hour volume instead of stock-only metrics', () => {
  const stats = parseHeatMapDetailStats({
    circulatingSupply: 19_800_000,
    maxSupply: 21_000_000,
    maxSupplyStatus: 'capped',
    volume24Hr: 18_400_000_000,
    marketCap: 1_200_000_000_000,
    beta: 1.2,
    earningsTimestamp: 1_800_000_000,
    trailingEps: 4.5,
  });

  assert.deepEqual(getHeatMapDetailStatRows('cryptocurrency', stats, null, false), [
    { label: 'Circulating Supply', value: '19.8M' },
    { label: 'Max Supply', value: '21M' },
    { label: 'Circulating share', value: '94.29%' },
    { label: '24h Volume', value: '$18.4B' },
    { label: 'Market Cap', value: '$1.2T' },
  ]);
});

test('crypto detail shows 100% circulating when the full maximum supply is in circulation', () => {
  const stats = parseHeatMapDetailStats({
    circulatingSupply: 21_000_000,
    maxSupply: 21_000_000,
    maxSupplyStatus: 'capped',
  });

  assert.equal(
    getHeatMapDetailStatRows('cryptocurrency', stats, null, false)
      .find(({ label }) => label === 'Circulating share')?.value,
    '100%',
  );
});

test('crypto detail rows distinguish unreported supply data and retain quote market cap', () => {
  const stats = parseHeatMapDetailStats({
    circulatingSupply: 1000,
    volume24Hr: 0,
  });

  assert.deepEqual(getHeatMapDetailStatRows('cryptocurrency', stats, 2_500_000, false), [
    { label: 'Circulating Supply', value: '1K' },
    { label: 'Max Supply', value: 'Not reported' },
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
  assert.equal(
    getHeatMapDetailStatRows('cryptocurrency', null, null, false)
      .find(({ label }) => label === 'Max Supply')?.value,
    'Unavailable',
  );
});

test('crypto detail labels explicitly uncapped supply without a numerical maximum', () => {
  const stats = parseHeatMapDetailStats({
    circulatingSupply: 122_000_000,
    maxSupply: 0,
    maxSupplyStatus: 'uncapped',
  });

  assert.equal(
    getHeatMapDetailStatRows('cryptocurrency', stats, null, false)
      .find(({ label }) => label === 'Max Supply')?.value,
    'No fixed cap',
  );
});

test('crypto detail does not infer uncapped supply from a missing status or zero alone', () => {
  for (const payload of [
    { maxSupply: 0 },
    { maxSupply: null, maxSupplyStatus: 'unreported' },
    { maxSupply: 21_000_000, maxSupplyStatus: 'unreported' },
  ]) {
    const stats = parseHeatMapDetailStats(payload);
    assert.equal(
      getHeatMapDetailStatRows('cryptocurrency', stats, null, false)
        .find(({ label }) => label === 'Max Supply')?.value,
      'Not reported',
    );
  }
});

test('crypto detail omits circulating share when the maximum supply is unavailable or unusable', () => {
  for (const maxSupply of [null, 0, -1]) {
    const stats = parseHeatMapDetailStats({ circulatingSupply: 1000, maxSupply });
    assert.equal(
      getHeatMapDetailStatRows('cryptocurrency', stats, null, false)
        .some(({ label }) => label === 'Circulating share'),
      false,
    );
  }

  const noCirculatingSupply = parseHeatMapDetailStats({ maxSupply: 21_000_000 });
  assert.equal(
    getHeatMapDetailStatRows('cryptocurrency', noCirculatingSupply, null, false)
      .some(({ label }) => label === 'Circulating share'),
    false,
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

test('commodity detail rows show trading context and omit company-only statistics', () => {
  const stats = parseHeatMapDetailStats({
    previousClose: 74.25,
    open: 75.5,
    volume: 1_200_000,
    averageVolume3Month: 900_000,
    marketCap: 15_000_000_000,
    beta: 1.2,
    earningsTimestamp: 1_800_000_000,
  });

  assert.deepEqual(getHeatMapDetailStatRows('commodity', stats, 15_000_000_000, false), [
    { label: 'Previous Close', value: '$74.25' },
    { label: 'Open', value: '$75.50' },
    { label: 'Volume', value: '1.2M' },
    { label: 'Avg. Volume (3M)', value: '900K' },
  ]);
  assert.deepEqual(
    getHeatMapDetailStatRows(
      'commodity',
      parseHeatMapDetailStats({ previousClose: 74.25, marketCap: 500_000_000 }),
      null,
      false,
    ),
    [{ label: 'Previous Close', value: '$74.25' }],
  );
  assert.deepEqual(
    getHeatMapDetailStatRows('commodity', null, null, true).map(({ value }) => value),
    ['Loading…', 'Loading…', 'Loading…', 'Loading…'],
  );
  assert.deepEqual(getHeatMapDetailStatRows('commodity', null, null, false), []);
});

test('ETF detail rows show investor-relevant fund facts instead of stock fundamentals', () => {
  const stats = parseHeatMapDetailStats({
    beta: 1.2,
    earningsTimestamp: 1_800_000_000,
    trailingEps: 4.5,
    etfProfile: {
      fundCategory: 'Large Blend',
      fundFamily: 'Example Funds',
      expenseRatio: 0.000945,
      totalAssets: 809_216_114_688,
      dividendYield: 0.0099,
      beta3Year: 1,
      largestSector: 'Technology',
      largestSectorWeight: 0.4045,
      topHoldings: [{ symbol: 'NVDA', name: 'NVIDIA Corp', weight: 0.0836 }],
      marketRegime: {
        bestRegime: 'bull',
        lookbackYears: 20,
        firstYear: 2006,
        lastYear: 2025,
        benchmarkSymbol: 'SPY',
        bullThreshold: 0.1,
        bearThreshold: -0.1,
        periods: {
          bull: { averageAnnualReturn: 0.15, years: 10 },
          bear: { averageAnnualReturn: -0.2, years: 2 },
          mixed: { averageAnnualReturn: 0.04, years: 8 },
        },
      },
    },
  });

  assert.deepEqual(getHeatMapDetailStatRows('etf', stats, null, false), [
    { label: 'Fund category', value: 'Large Blend' },
    { label: 'Fund family', value: 'Example Funds' },
    { label: 'Largest sector exposure', value: 'Technology · 40.45%' },
    { label: 'Expense ratio', value: '0.0945%' },
    { label: 'Annual cost per $10K', value: '$9.45' },
    { label: 'Fund size (AUM)', value: '$809.22B' },
    { label: 'Distribution yield', value: '0.99%' },
    { label: '3-year beta', value: '1.00' },
  ]);
  assert.equal(stats?.etfProfile?.topHoldings[0]?.name, 'NVIDIA Corp');
  assert.equal(stats?.etfProfile?.marketRegime?.bestRegime, 'bull');
});

test('ETF detail rows clearly distinguish loading from unavailable provider data', () => {
  assert.deepEqual(
    getHeatMapDetailStatRows('etf', null, null, true),
    [
      { label: 'Fund category', value: 'Loading…' },
      { label: 'Fund family', value: 'Loading…' },
      { label: 'Largest sector exposure', value: 'Loading…' },
      { label: 'Expense ratio', value: 'Loading…' },
      { label: 'Annual cost per $10K', value: 'Loading…' },
      { label: 'Fund size (AUM)', value: 'Loading…' },
      { label: 'Distribution yield', value: 'Loading…' },
      { label: '3-year beta', value: 'Loading…' },
    ],
  );

  const stats = parseHeatMapDetailStats({ etfProfile: {} });
  assert.deepEqual(
    getHeatMapDetailStatRows('etf', stats, null, false).every(({ value }) => value === 'Not reported'),
    true,
  );
});

test('ETF market-regime returns have explicit signs and unavailable values stay blank', () => {
  assert.equal(formatHeatMapRegimeReturn(0.125), '+12.5%');
  assert.equal(formatHeatMapRegimeReturn(-0.1), '-10%');
  assert.equal(formatHeatMapRegimeReturn(null), '—');
});

test('heat-map range marker is clamped and rejects unusable ranges', () => {
  assert.equal(getHeatMapRangePosition(25, 0, 100), 25);
  assert.equal(getHeatMapRangePosition(-5, 0, 100), 0);
  assert.equal(getHeatMapRangePosition(120, 0, 100), 100);
  assert.equal(getHeatMapRangePosition(20, 20, 20), null);
  assert.equal(getHeatMapRangePosition(20, null, 30), null);
});
