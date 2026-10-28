import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findReportedEtfHoldingsOverlap,
  formatHeatMapRegimeReturn,
  getHeatMapCryptoSupplyChartModel,
  getHeatMapCryptoSupplyDiscrepancy,
  getHeatMapCryptoSupplyChangeSummary,
  getHeatMapDetailStatRows,
  getHeatMapRangePosition,
  parseSavedEtfComparisonSymbols,
  parseHeatMapCryptoSupplyHistory,
  parseHeatMapDetailStats,
} from '../heatMapDetail.ts';

test('crypto supply history accepts only dated provider observations and leaves gaps empty', () => {
  const history = parseHeatMapCryptoSupplyHistory({
    symbol: 'BTC-USD',
    provider: 'Coin Metrics',
    metric: 'SplyCur',
    rangeDays: 365,
    interval: 'daily',
    startDate: '2026-10-06',
    endDate: '2026-10-08',
    points: [
      { date: '2026-10-08', supply: 200.5 },
      { date: '2026-10-06', supply: 200 },
      { date: '2026-10-07', supply: Number.NaN },
      { date: '2026-10-08', supply: 201 },
      { date: '2026-10-09', supply: -1 },
      { date: 'not-a-date', supply: 202 },
    ],
  });

  assert.deepEqual(history, {
    symbol: 'BTC-USD',
    provider: 'Coin Metrics',
    metric: 'SplyCur',
    rangeDays: 365,
    interval: 'daily',
    startDate: '2026-10-06',
    endDate: '2026-10-08',
    points: [
      { date: '2026-10-06', supply: 200 },
      { date: '2026-10-08', supply: 201 },
    ],
  });
  assert.equal(parseHeatMapCryptoSupplyHistory({
    provider: 'CoinGecko',
    metric: 'SplyCur',
    rangeDays: 365,
    interval: 'daily',
    symbol: 'BTC-USD',
    points: [],
  }), null);
  assert.equal(parseHeatMapCryptoSupplyHistory({
    symbol: 'BTC-USD',
    provider: 'Coin Metrics',
    metric: 'SplyCur',
    rangeDays: 30,
    interval: 'daily',
    points: [{ date: '2026-10-08', supply: 200 }],
  })?.rangeDays, 30);
  assert.equal(parseHeatMapCryptoSupplyHistory({
    symbol: 'BTC-USD',
    provider: 'Coin Metrics',
    metric: 'SplyCur',
    rangeDays: 90,
    interval: 'daily',
    points: Array.from({ length: 92 }, (_, index) => ({
      date: `2026-07-${String((index % 31) + 1).padStart(2, '0')}`,
      supply: index + 1,
    })),
  }), null);
});

test('crypto supply chart breaks its line across missing provider dates', () => {
  const model = getHeatMapCryptoSupplyChartModel([
    { date: '2026-10-06', supply: 200 },
    { date: '2026-10-07', supply: 201 },
    { date: '2026-10-10', supply: 204 },
  ]);

  assert.ok(model);
  assert.equal(model.minSupply, 200);
  assert.equal(model.maxSupply, 204);
  assert.equal(model.points.length, 3);
  assert.equal(model.segments.length, 2);
  assert.match(model.segments[0]!, /^M.*L/);
  assert.match(model.segments[1]!, /^M/);
  assert.equal(getHeatMapCryptoSupplyChartModel([
    { date: '2026-10-06', supply: 200 },
  ]), null);
});

test('crypto supply change compares the first and last actual observations', () => {
  assert.deepEqual(getHeatMapCryptoSupplyChangeSummary([
    { date: '2026-10-08', supply: 210 },
    { date: '2026-10-01', supply: 200 },
    { date: '2026-10-04', supply: 205 },
  ]), {
    startDate: '2026-10-01',
    endDate: '2026-10-08',
    startSupply: 200,
    endSupply: 210,
    absoluteChange: 10,
    percentChange: 5,
  });
  assert.equal(getHeatMapCryptoSupplyChangeSummary([
    { date: '2026-10-01', supply: 200 },
  ]), null);
});

test('crypto supply change rejects invalid observations and does not treat duplicate dates as a period', () => {
  assert.equal(getHeatMapCryptoSupplyChangeSummary([
    { date: '2026-10-01', supply: 200 },
    { date: '2026-10-01', supply: 201 },
    { date: '2026-10-02', supply: Number.NaN },
    { date: 'not-a-date', supply: 202 },
  ]), null);
});

test('crypto supply discrepancy uses one materiality cutoff across different issuance patterns', () => {
  const assets = [
    { symbol: 'BTC-USD', historical: 19_900_000, ordinaryMove: 19_910_000 },
    { symbol: 'ETH-USD', historical: 120_000_000, ordinaryMove: 120_300_000 },
    { symbol: 'SOL-USD', historical: 600_000_000, ordinaryMove: 603_000_000 },
  ];

  for (const asset of assets) {
    const history = [{ date: '2026-10-08', supply: asset.historical }];
    assert.equal(
      getHeatMapCryptoSupplyDiscrepancy(asset.ordinaryMove, history, '2026-10-09'),
      null,
      `${asset.symbol}: ordinary supply movement should not trigger a provider mismatch`,
    );

    // Exactly 5% remains below the strict "greater than" warning cutoff.
    assert.equal(
      getHeatMapCryptoSupplyDiscrepancy(asset.historical * 1.05, history, '2026-10-09'),
      null,
      `${asset.symbol}: a 5% difference should not trigger the warning`,
    );

    const reportedCurrent = asset.historical * 1.06;
    assert.deepEqual(
      getHeatMapCryptoSupplyDiscrepancy(reportedCurrent, history, '2026-10-09'),
      {
        currentSupply: reportedCurrent,
        historicalSupply: asset.historical,
        historicalDate: '2026-10-08',
        differencePercent: (Math.abs(reportedCurrent - asset.historical) / asset.historical) * 100,
      },
      `${asset.symbol}: material provider differences should preserve both reported values`,
    );
  }
});

test('crypto supply discrepancy ignores stale or unavailable history without changing current supply', () => {
  assert.equal(getHeatMapCryptoSupplyDiscrepancy(21_000_000, [], '2026-10-09'), null);
  assert.equal(
    getHeatMapCryptoSupplyDiscrepancy(
      21_000_000,
      [{ date: '2026-10-01', supply: 19_900_000 }],
      '2026-10-09',
    ),
    null,
  );
  assert.equal(
    getHeatMapCryptoSupplyDiscrepancy(null, [{ date: '2026-10-08', supply: 19_900_000 }], '2026-10-09'),
    null,
  );
});

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
    maxSupplySource: null,
    maxSupplyConflict: false,
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
    maxSupplySource: null,
    maxSupplyConflict: false,
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
    maxSupplySource: null,
    maxSupplyConflict: false,
    volume24Hr: null,
    etfProfile: null,
  });
});

test('crypto circulating supply rejects negative and non-finite values but preserves zero and positives', () => {
  for (const circulatingSupply of [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const stats = parseHeatMapDetailStats({ circulatingSupply });
    assert.equal(stats?.circulatingSupply, null);
    assert.equal(
      getHeatMapDetailStatRows('cryptocurrency', stats, null, false)
        .find(({ label }) => label === 'Circulating Supply')?.value,
      '—',
    );
  }

  for (const [circulatingSupply, expected] of [[0, '0'], [19_800_000, '19.8M']] as const) {
    const stats = parseHeatMapDetailStats({ circulatingSupply });
    assert.equal(stats?.circulatingSupply, circulatingSupply);
    assert.equal(
      getHeatMapDetailStatRows('cryptocurrency', stats, null, false)
        .find(({ label }) => label === 'Circulating Supply')?.value,
      expected,
    );
  }
});

test('crypto market cap and 24-hour volume reject negative and non-finite values', () => {
  for (const field of ['marketCap', 'volume24Hr'] as const) {
    for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const stats = parseHeatMapDetailStats({ [field]: value });
      assert.equal(stats?.[field], null);
      assert.equal(
        getHeatMapDetailStatRows('cryptocurrency', stats, null, false)
          .find(({ label }) => label === (field === 'marketCap' ? 'Market Cap' : '24h Volume'))?.value,
        '—',
      );
    }
  }
});

test('crypto market cap and 24-hour volume preserve zero and positive values', () => {
  for (const value of [0, 1_234_567]) {
    const stats = parseHeatMapDetailStats({ marketCap: value, volume24Hr: value });
    assert.equal(stats?.marketCap, value);
    assert.equal(stats?.volume24Hr, value);
    const rows = getHeatMapDetailStatRows('cryptocurrency', stats, null, false);
    assert.notEqual(rows.find(({ label }) => label === 'Market Cap')?.value, '—');
    assert.notEqual(rows.find(({ label }) => label === '24h Volume')?.value, '—');
    if (value === 0) {
      assert.equal(rows.find(({ label }) => label === 'Market Cap')?.value, '$0');
      assert.equal(rows.find(({ label }) => label === '24h Volume')?.value, '$0');
    }
  }
});

test('crypto detail does not show a negative market-cap fallback', () => {
  const rows = getHeatMapDetailStatRows('cryptocurrency', null, -1, false);
  assert.equal(rows.find(({ label }) => label === 'Market Cap')?.value, '—');
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

test('crypto detail explains when circulating supply exceeds a reported fixed cap without showing a share', () => {
  const stats = parseHeatMapDetailStats({
    circulatingSupply: 22_000_000,
    maxSupply: 21_000_000,
    maxSupplyStatus: 'capped',
  });
  const rows = getHeatMapDetailStatRows('cryptocurrency', stats, null, false);

  assert.deepEqual(
    rows.find(({ label }) => label === 'Circulating Supply'),
    {
      label: 'Circulating Supply',
      value: '22M',
      detail: 'Reported circulating supply exceeds the fixed maximum; circulating share is omitted.',
    },
  );
  assert.equal(rows.some(({ label }) => label === 'Circulating share'), false);
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
  assert.equal(
    getHeatMapDetailStatRows('cryptocurrency', stats, null, false)
      .find(({ label }) => label === 'Circulating Supply')?.detail,
    undefined,
  );
});

test('crypto detail omits circulating share when supply exceeds a reported cap', () => {
  const stats = parseHeatMapDetailStats({
    circulatingSupply: 21_000_001,
    maxSupply: 21_000_000,
    maxSupplyStatus: 'capped',
  });

  assert.equal(
    getHeatMapDetailStatRows('cryptocurrency', stats, null, false)
      .some(({ label }) => label === 'Circulating share'),
    false,
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

  const rows = getHeatMapDetailStatRows('cryptocurrency', stats, null, false);
  assert.equal(rows.find(({ label }) => label === 'Max Supply')?.value, 'No fixed cap');
  assert.equal(rows.find(({ label }) => label === 'Circulating Supply')?.detail, undefined);
});

test('crypto detail displays the confirmed maximum-supply source', () => {
  const stats = parseHeatMapDetailStats({
    circulatingSupply: 19_800_000,
    maxSupply: 21_000_000,
    maxSupplyStatus: 'capped',
    maxSupplySource: 'CoinPaprika',
  });
  const rows = getHeatMapDetailStatRows('cryptocurrency', stats, null, false);

  assert.deepEqual(
    rows.find(({ label }) => label === 'Max Supply'),
    {
      label: 'Max Supply',
      value: '21M',
      detail: 'Source: CoinPaprika',
    },
  );
});

test('crypto detail flags conflicting reports and omits a disputed circulating share', () => {
  const stats = parseHeatMapDetailStats({
    circulatingSupply: 19_800_000,
    maxSupply: 21_000_000,
    maxSupplyStatus: 'capped',
    maxSupplySource: 'Yahoo Finance',
    maxSupplyConflict: true,
  });
  const rows = getHeatMapDetailStatRows('cryptocurrency', stats, null, false);

  assert.deepEqual(
    rows.find(({ label }) => label === 'Max Supply'),
    {
      label: 'Max Supply',
      value: '21M',
      detail: 'Sources disagree; showing Yahoo Finance.',
    },
  );
  assert.equal(rows.some(({ label }) => label === 'Circulating share'), false);
  assert.equal(rows.find(({ label }) => label === 'Circulating Supply')?.detail, undefined);
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

  const unreportedLargerSupply = parseHeatMapDetailStats({
    circulatingSupply: 22_000_000,
    maxSupply: 21_000_000,
    maxSupplyStatus: 'unreported',
  });
  assert.equal(
    getHeatMapDetailStatRows('cryptocurrency', unreportedLargerSupply, null, false)
      .find(({ label }) => label === 'Circulating Supply')?.detail,
    undefined,
  );
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
  assert.equal(stats?.etfProfile?.topHoldingsReportedCount, 1);
  assert.equal(stats?.etfProfile?.topHoldingsRetrievedAt, null);
  assert.equal(stats?.etfProfile?.marketRegime?.bestRegime, 'bull');
});

test('ETF holding overlap compares reported positions and preserves each disclosed weight', () => {
  assert.deepEqual(findReportedEtfHoldingsOverlap([
    { symbol: 'SPY', topHoldings: [{ symbol: 'NVDA', name: 'NVIDIA', weight: 0.08 }] },
    { symbol: 'QQQ', topHoldings: [
      { symbol: 'NVDA', name: 'NVIDIA', weight: 0.07 },
      { symbol: 'AAPL', name: 'Apple', weight: 0.06 },
    ] },
    { symbol: 'IWM', topHoldings: [{ symbol: 'AAPL', name: 'Apple', weight: 0.01 }] },
  ]), [
    { symbol: 'NVDA', positions: [
      { fundSymbol: 'SPY', name: 'NVIDIA', weight: 0.08 },
      { fundSymbol: 'QQQ', name: 'NVIDIA', weight: 0.07 },
    ] },
    { symbol: 'AAPL', positions: [
      { fundSymbol: 'QQQ', name: 'Apple', weight: 0.06 },
      { fundSymbol: 'IWM', name: 'Apple', weight: 0.01 },
    ] },
  ]);
});

test('saved ETF comparisons normalize, deduplicate, cap, and reject malformed storage', () => {
  assert.deepEqual(
    parseSavedEtfComparisonSymbols('["qqq","SPY","qqq","bad ticker","IWM","DIA"]'),
    ['QQQ', 'SPY', 'IWM'],
  );
  assert.deepEqual(parseSavedEtfComparisonSymbols('not json'), []);
  assert.deepEqual(parseSavedEtfComparisonSymbols('{"symbol":"QQQ"}'), []);
  assert.deepEqual(parseSavedEtfComparisonSymbols(null), []);
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
