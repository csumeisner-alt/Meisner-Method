import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  compareEtfHoldingSnapshots,
  createEtfHoldingSnapshot,
  findReportedEtfHoldingsOverlap,
  formatReportedEtfHoldingsOverlapShare,
  formatEtfComparisonValue,
  formatEtfProfileAssets,
  formatHeatMapRegimeReturn,
  estimateEtfFeeDollars,
  isValidEtfTrackingHistory,
  isValidEtfExpenseRatio,
  parseEtfFeeInvestmentAmount,
  getHeatMapCryptoSupplyChartModel,
  getHeatMapCryptoSupplyDiscrepancy,
  getHeatMapCryptoSupplyChangeSummary,
  getHeatMapDetailStatRows,
  getHeatMapRangePosition,
  parseSavedEtfComparisonSymbols,
  parseSavedEtfHoldingSnapshots,
  parseHeatMapCryptoSupplyHistory,
  parseHeatMapDetailStats,
  shareEtfOverlapSummary,
  getReportedEtfSectorComparison,
  upsertSavedEtfHoldingSnapshot,
  getEtfFeeComparisonStatus,
} from '../heatMapDetail.ts';

const testDir = dirname(fileURLToPath(import.meta.url));
const analysisScreenSource = readFileSync(
  resolve(testDir, '../../app/analysis/[symbol].tsx'),
  'utf8',
);

test('ETF fee-dollar illustration uses a constant balance and rejects missing or invalid fees', () => {
  assert.equal(parseEtfFeeInvestmentAmount('10,000'), 10_000);
  assert.equal(parseEtfFeeInvestmentAmount('$5,000.50'), 5_000.5);
  assert.equal(parseEtfFeeInvestmentAmount('0'), null);
  assert.equal(parseEtfFeeInvestmentAmount('not an amount'), null);
  assert.equal(estimateEtfFeeDollars(10_000, 0.0003, 10), 30);
  assert.equal(estimateEtfFeeDollars(5_000, 0.0003, 5), 7.5);
  assert.equal(estimateEtfFeeDollars(10_000, 0, 10), 0);
  assert.equal(estimateEtfFeeDollars(10_000, null, 10), null);
  for (const invalidRatio of [-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(isValidEtfExpenseRatio(invalidRatio), false);
    assert.equal(estimateEtfFeeDollars(10_000, invalidRatio, 10), null);
  }
  assert.equal(estimateEtfFeeDollars(10_000, 0.0003, 0), null);
});

test('ETF fee comparison flags only valid positive differences', () => {
  assert.equal(getEtfFeeComparisonStatus(0.001, 0.0008, 0.0002), 'above-average');
  assert.equal(getEtfFeeComparisonStatus(0.0008, 0.0008, 0), 'not-above-average');
  assert.equal(getEtfFeeComparisonStatus(0.0005, 0.0008, -0.0003), 'not-above-average');
  for (const [fundExpenseRatio, categoryAverageExpenseRatio, difference] of [
    [null, 0.0008, null],
    [0.001, null, 0.0002],
    [0.001, Number.NaN, 0.0002],
    [0.001, -0.0001, 0.0002],
    [0.001, 1.01, 0.0002],
    ['0.001' as unknown as number, 0.0008, 0.0002],
    [0.001, 0.0008, Number.POSITIVE_INFINITY],
    [0.001, 0.0008, 0.0003],
  ]) {
    assert.equal(
      getEtfFeeComparisonStatus(fundExpenseRatio, categoryAverageExpenseRatio, difference),
      'unavailable',
    );
  }
});

test('ETF analysis labels valid above-average fees and suppresses unavailable comparisons', () => {
  assert.match(analysisScreenSource, /getEtfFeeComparisonStatus\(/);
  assert.match(analysisScreenSource, /This fund’s fee is above its category average\./);
  assert.match(analysisScreenSource, /status === 'above-average'/);
  assert.match(analysisScreenSource, /status === 'unavailable'[\s\S]*?return 'Unavailable'/);
});

test('ETF fee-dollar illustration has editable inputs, independent horizons, and clear assumptions', () => {
  assert.match(analysisScreenSource, /title="ETF FEE DOLLAR IMPACT"/);
  assert.match(analysisScreenSource, /testID="etf-fee-impact-amount"/);
  assert.match(analysisScreenSource, /testID=\{`etf-fee-impact-amount-\$\{amount\}`\}/);
  assert.match(analysisScreenSource, /testID=\{`etf-fee-impact-horizon-\$\{years\}`\}/);
  assert.match(analysisScreenSource, /Estimated fees over \$\{feeHoldingYears\} years/);
  assert.match(analysisScreenSource, /feeInvestmentAmount,\s*fund\.expenseRatio,\s*feeHoldingYears/);
  assert.match(analysisScreenSource, /assumes the balance stays equal to your starting amount/);
  assert.match(analysisScreenSource, /this estimate is separate from the return scenarios/);
});

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
      sectorWeights: [
        { sector: 'Technology', weight: 0.4045 },
        { sector: 'Healthcare', weight: 0.12 },
      ],
      sectorWeightsRetrievedAt: '2026-10-27T12:00:00Z',
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
  assert.deepEqual(stats?.etfProfile?.sectorWeights, [
    { sector: 'Technology', weight: 0.4045 },
    { sector: 'Healthcare', weight: 0.12 },
  ]);
  assert.equal(stats?.etfProfile?.sectorWeightsRetrievedAt, '2026-10-27T12:00:00Z');
  assert.equal(stats?.etfProfile?.marketRegime?.bestRegime, 'bull');
});

test('ETF profile asset reports reject zero, negative, and non-finite values', () => {
  for (const totalAssets of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const stats = parseHeatMapDetailStats({ etfProfile: { totalAssets } });

    assert.equal(stats?.etfProfile?.totalAssets, null);
    assert.equal(
      getHeatMapDetailStatRows('etf', stats, null, false)
        .find(({ label }) => label === 'Fund size (AUM)')?.value,
      'Not reported',
    );
    assert.equal(formatEtfProfileAssets(totalAssets), 'Unavailable');
    assert.equal(formatEtfComparisonValue(totalAssets, 'assets'), 'Unavailable');
  }

  const validAssets = 809_216_114_688;
  const stats = parseHeatMapDetailStats({ etfProfile: { totalAssets: validAssets } });
  assert.equal(stats?.etfProfile?.totalAssets, validAssets);
  assert.equal(
    getHeatMapDetailStatRows('etf', stats, null, false)
      .find(({ label }) => label === 'Fund size (AUM)')?.value,
    '$809.22B',
  );
  assert.equal(formatEtfProfileAssets(validAssets), '$809.22B');
  assert.equal(formatEtfComparisonValue(validAssets, 'assets'), '$809.22B');
  assert.match(analysisScreenSource, /formatEtfProfileAssets\(fund\.totalAssets\)/);
});

test('sector comparison leaves unreported sector weights unavailable instead of filling zero', () => {
  assert.deepEqual(getReportedEtfSectorComparison([
    {
      symbol: 'SPY',
      sectorWeights: [
        { sector: 'Technology', weight: 0.3 },
        { sector: 'Healthcare', weight: 0 },
      ],
    },
    { symbol: 'QQQ', sectorWeights: [{ sector: 'Technology', weight: 0.5 }] },
    { symbol: 'IWM', sectorWeights: [] },
  ]), [
    {
      sector: 'Healthcare',
      funds: [
        { symbol: 'SPY', weight: 0 },
        { symbol: 'QQQ', weight: null },
        { symbol: 'IWM', weight: null },
      ],
    },
    {
      sector: 'Technology',
      funds: [
        { symbol: 'SPY', weight: 0.3 },
        { symbol: 'QQQ', weight: 0.5 },
        { symbol: 'IWM', weight: null },
      ],
    },
  ]);
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

test('ETF holding overlap share includes selected funds, reported weights, snapshot times, and coverage limits', () => {
  const summary = formatReportedEtfHoldingsOverlapShare([
    { symbol: 'spy', topHoldingsRetrievedAt: '2026-10-27T16:00:00.000Z' },
    { symbol: 'QQQ', topHoldingsRetrievedAt: null },
  ], [
    {
      symbol: 'NVDA',
      positions: [
        { fundSymbol: 'SPY', name: 'NVIDIA', weight: 0.08 },
        { fundSymbol: 'QQQ', name: 'NVIDIA', weight: 0.07 },
      ],
    },
  ]);

  assert.equal(summary, [
    'ETF comparison summary',
    'Funds: SPY, QQQ',
    'Provider snapshot retrieval times (UTC):',
    '- SPY: 2026-10-27T16:00:00.000Z',
    '- QQQ: unavailable',
    'Provider sector and expense data (Yahoo Finance; retrieval times in UTC):',
    '- SPY: unavailable',
    '- QQQ: unavailable',
    'Common reported holdings:',
    '- NVIDIA (NVDA): SPY 8.00% · QQQ 7.00%',
    'Reported sector weights:',
    '- Unavailable for all selected funds.',
    'Expense ratios (annual operating cost):',
    '- SPY: unavailable',
    '- QQQ: unavailable',
    'Coverage note: Overlap includes only positions reported by the provider and does not represent complete ETF portfolios.',
    'Sector weights include only reported values; unavailable values are not zero.',
    'Expense ratios are provider-reported annual fund costs, not a guarantee of total investment cost.',
  ].join('\n'));
  assert.doesNotMatch(summary, /account|portfolio value|balance/i);
});

test('ETF comparison share includes selected sector weights, expense costs, and provider retrieval times', () => {
  const summary = formatReportedEtfHoldingsOverlapShare([
    {
      symbol: 'SPY',
      topHoldingsRetrievedAt: '2026-10-27T16:00:00Z',
      sectorWeightsRetrievedAt: '2026-10-27T16:00:00Z',
      sectorWeights: [
        { sector: 'Technology', weight: 0.4 },
        { sector: 'Healthcare', weight: 0 },
      ],
      expenseRatio: 0.0003,
    },
    {
      symbol: 'QQQ',
      topHoldingsRetrievedAt: '2026-10-27T16:05:00Z',
      sectorWeightsRetrievedAt: '2026-10-27T16:05:00Z',
      sectorWeights: [{ sector: 'Technology', weight: 0.5 }],
      expenseRatio: null,
    },
  ], []);

  assert.match(summary, /Provider sector and expense data \(Yahoo Finance; retrieval times in UTC\):\n- SPY: 2026-10-27T16:00:00\.000Z\n- QQQ: 2026-10-27T16:05:00\.000Z/);
  assert.match(summary, /Reported sector weights:\n- Healthcare: SPY 0\.00% · QQQ unavailable\n- Technology: SPY 40\.00% · QQQ 50\.00%/);
  assert.match(summary, /Expense ratios \(annual operating cost\):\n- SPY: 0\.03% \(\$3\.00\/year per \$10,000\)\n- QQQ: unavailable/);
  assert.match(summary, /Funds: SPY, QQQ/);
  assert.doesNotMatch(summary, /IWM|unselected/i);
});

test('ETF shared summary preserves zero peer fees and marks missing or malformed fees unavailable', () => {
  const summaryForFees = (
    categoryAverageExpenseRatio: number | null,
    difference: number | null,
  ) => formatReportedEtfHoldingsOverlapShare(
    [{ symbol: 'ZERO', topHoldingsRetrievedAt: null }],
    [],
    [{
      symbol: 'ZERO',
      analysis: {
        peerExpenseComparison: {
          category: 'Zero Fee',
          sampleSize: null,
          sampleContext: 'Sample size not reported',
          source: 'Provider',
          asOf: '2026-10-27T16:00:00Z',
          categoryAverageExpenseRatio,
          difference,
        },
      },
    }],
  );

  const zeroSummary = summaryForFees(0, 0);
  assert.match(zeroSummary, /Category fee baseline: Zero Fee · average 0\.00% · difference 0\.0 bps/);
  assert.doesNotMatch(zeroSummary, /Category fee baseline: Zero Fee · average Unavailable/);

  for (const [categoryAverageExpenseRatio, difference] of [
    [null, null],
    [Number.NaN, Number.POSITIVE_INFINITY],
    [-0.0001, 1.0001],
    ['0.01' as unknown as number, '0.001' as unknown as number],
  ]) {
    const summary = summaryForFees(categoryAverageExpenseRatio, difference);
    assert.match(summary, /Category fee baseline: Zero Fee · average Unavailable · difference Unavailable/);
  }
});

test('ETF comparison share labels missing and malformed sector or cost data unavailable', () => {
  const summary = formatReportedEtfHoldingsOverlapShare([
    {
      symbol: 'SPY',
      topHoldingsRetrievedAt: null,
      sectorWeightsRetrievedAt: null,
      sectorWeights: [],
      expenseRatio: null,
    },
    {
      symbol: 'BAD',
      topHoldingsRetrievedAt: null,
      sectorWeightsRetrievedAt: 'not-a-date',
      sectorWeights: [{ sector: 'Technology', weight: Number.NaN }],
      expenseRatio: 1.5,
    },
  ], []);

  assert.match(summary, /- SPY: unavailable\n- BAD: unavailable/);
  assert.match(summary, /Reported sector weights:\n- Unavailable for all selected funds\./);
  assert.match(summary, /Expense ratios \(annual operating cost\):\n- SPY: unavailable\n- BAD: unavailable/);
  assert.match(summary, /Sector weights include only reported values; unavailable values are not zero\./);
  assert.doesNotMatch(summary, /BAD: 0\.00%|SPY: 0\.00%/);
});

test('ETF comparison share includes selected risk and performance with source context', () => {
  const summary = formatReportedEtfHoldingsOverlapShare(
    [
      { symbol: 'SPY', topHoldingsRetrievedAt: null },
      { symbol: 'QQQ', topHoldingsRetrievedAt: null },
    ],
    [],
    [
      {
        symbol: 'SPY',
        analysis: {
          fundCategory: 'Large Blend',
          provider: 'Yahoo Finance',
          asOf: '2026-10-27T16:00:00Z',
          totalAssets: 700_000_000,
          beta3Year: 1.02,
          annualizedVolatility: 0.18,
          maxDrawdown: -0.24,
          riskAdjustedReturn: 0.62,
          annualizedReturn: 0.11,
          benchmark: {
            symbol: 'SPY',
            name: 'S&P 500',
            source: 'Yahoo Finance',
            asOf: '2026-10-27T15:00:00Z',
          },
          trackingComparison: {
            periodStart: '2021-01',
            periodEnd: '2025-12',
            monthlySamples: 60,
            fundAnnualizedReturn: 0.11,
            benchmarkAnnualizedReturn: 0.1,
            trackingDifference: 0.01,
            trackingError: 0.02,
            source: 'Yahoo Finance',
            asOf: '2026-10-27T15:00:00Z',
          },
          peerExpenseComparison: {
            category: 'Large Blend',
            sampleSize: null,
            sampleContext: 'Sample size not reported',
            source: 'Yahoo Finance',
            asOf: '2026-10-27T15:00:00Z',
            categoryAverageExpenseRatio: 0.0008,
            difference: -0.0005,
          },
          peerAssetSizeComparison: {
            category: 'Large Blend',
            sampleSize: null,
            sampleContext: 'Sample size not reported',
            source: 'Yahoo Finance',
            asOf: '2026-10-27T15:00:00Z',
            categoryAverageTotalAssets: 800_000_000,
          },
          marketRegime: {
            benchmarkSymbol: 'SPY',
            firstYear: 2006,
            lastYear: 2025,
            periods: {
              bull: { averageAnnualReturn: 0.14, years: 10 },
              bear: { averageAnnualReturn: -0.18, years: 3 },
              mixed: { averageAnnualReturn: 0.04, years: 7 },
            },
          },
        },
      },
      {
        symbol: 'QQQ',
        analysis: {
          fundCategory: null,
          provider: 'Yahoo Finance',
          asOf: '2026-10-27T16:05:00Z',
        },
      },
    ],
  );

  assert.match(summary, /SPY: assets under management \$700\.0M; 3-year beta 1\.02; 1-year annualized volatility 18\.00%; 1-year maximum drawdown -24\.00%; return \/ volatility ratio 0\.62; 1-year annualized return 11\.00%/);
  assert.match(summary, /QQQ: assets under management Unavailable; 3-year beta Unavailable; 1-year annualized volatility Unavailable; 1-year maximum drawdown Unavailable; return \/ volatility ratio Unavailable; 1-year annualized return Unavailable/);
  assert.match(summary, /Fund category: Large Blend · provider: Yahoo Finance · retrieved 2026-10-27T16:00:00\.000Z/);
  assert.match(summary, /Verified benchmark: S&P 500 \(SPY\) · Yahoo Finance/);
  assert.match(summary, /Benchmark tracking \(2021-01–2025-12, 60 monthly samples\)/);
  assert.match(summary, /Historical regime returns \(2006–2025, grouped by SPY\): bull: 14\.00% \(10 years\) · bear: -18\.00% \(3 years\) · mixed: 4\.00% \(7 years\)/);
  assert.match(summary, /Category fee baseline: Large Blend · average 0\.08% · difference -5\.0 bps · Sample size not reported/);
  assert.match(summary, /Category asset baseline: Large Blend · average \$800\.0M · Sample size not reported/);
  assert.match(summary, /risk-free proxy and is not a Sharpe ratio/);
  assert.doesNotMatch(summary, /IWM|unselected/i);
});

test('ETF comparison share keeps malformed or missing risk and performance unavailable', () => {
  const summary = formatReportedEtfHoldingsOverlapShare(
    [{ symbol: 'BAD', topHoldingsRetrievedAt: null }],
    [],
    [{
      symbol: 'BAD',
      analysis: {
        beta3Year: Number.NaN,
        annualizedVolatility: null,
        maxDrawdown: Number.POSITIVE_INFINITY,
        riskAdjustedReturn: null,
        annualizedReturn: null,
        trackingComparison: {
          periodStart: '2025-01',
          periodEnd: '2025-12',
          monthlySamples: 12,
          fundAnnualizedReturn: Number.NaN,
          benchmarkAnnualizedReturn: null,
          trackingDifference: null,
          trackingError: null,
          source: 'Yahoo Finance',
          asOf: 'invalid-date',
        },
        marketRegime: {
          benchmarkSymbol: 'SPY',
          firstYear: 2025,
          lastYear: 2025,
          periods: {
            bull: { averageAnnualReturn: null, years: 1 },
            bear: { averageAnnualReturn: Number.NaN, years: 1 },
            mixed: { averageAnnualReturn: null, years: 0 },
          },
        },
      },
    }],
  );

  assert.match(summary, /BAD: assets under management Unavailable; 3-year beta Unavailable; 1-year annualized volatility Unavailable; 1-year maximum drawdown Unavailable; return \/ volatility ratio Unavailable; 1-year annualized return Unavailable/);
  assert.match(summary, /fund return Unavailable; benchmark return Unavailable; tracking difference Unavailable; annualized tracking error Unavailable/);
  assert.match(summary, /bull: unavailable · bear: unavailable · mixed: unavailable/);
  assert.doesNotMatch(summary, /BAD: .*0\.00%|BAD: .*0\.00/);
});

test('ETF comparison share labels invalid or missing tracking-period metadata unavailable', () => {
  const makeSummary = (trackingComparison: NonNullable<
    import('../heatMapDetail.ts').EtfComparisonShareAnalysis['trackingComparison']
  >) => formatReportedEtfHoldingsOverlapShare(
    [{ symbol: 'BAD', topHoldingsRetrievedAt: null }],
    [],
    [{ symbol: 'BAD', analysis: { trackingComparison } }],
  );
  const validFields = {
    periodStart: '2025-01',
    periodEnd: '2025-12',
    monthlySamples: 12,
    fundAnnualizedReturn: 0.1,
    benchmarkAnnualizedReturn: 0.09,
    trackingDifference: 0.01,
    trackingError: 0.02,
    source: 'Yahoo Finance',
    asOf: '2026-10-27T15:00:00Z',
  };
  const invalidPeriods = [
    { ...validFields, periodStart: '2025-13' },
    { ...validFields, periodStart: '2026-01', periodEnd: '2025-12' },
    { ...validFields, monthlySamples: 0 },
    { ...validFields, monthlySamples: 1.5 },
    { ...validFields, monthlySamples: 13 },
  ];

  for (const trackingComparison of invalidPeriods) {
    const summary = makeSummary(trackingComparison);
    assert.match(
      summary,
      /Benchmark tracking: unavailable because the tracking period or monthly sample count is invalid or incomplete\./,
    );
    assert.doesNotMatch(summary, /2025-01|2025-12|monthly samples|fund return 10\.00%/);
  }

  const missingStart = { ...validFields, periodStart: undefined };
  const missingSampleCount = { ...validFields, monthlySamples: undefined };
  for (const trackingComparison of [missingStart, missingSampleCount]) {
    const summary = makeSummary(trackingComparison);
    assert.match(
      summary,
      /Benchmark tracking: unavailable because the tracking period or monthly sample count is invalid or incomplete\./,
    );
    assert.doesNotMatch(summary, /2025-01|2025-12|monthly samples|fund return 10\.00%/);
  }

  assert.match(
    makeSummary(validFields),
    /Benchmark tracking \(2025-01–2025-12, 12 monthly samples\): fund return 10\.00%/,
  );
});

test('ETF tracking history validation rejects missing, malformed, reversed, and impossible ranges', () => {
  assert.equal(isValidEtfTrackingHistory('2021-01', '2025-12', 60), true);
  assert.equal(isValidEtfTrackingHistory('2025-01', '2025-12', 1), true);
  const invalidRanges: [unknown, unknown, unknown][] = [
    [undefined, '2025-12', 12],
    ['2025-01', null, 12],
    ['2025-1', '2025-12', 12],
    ['2025-00', '2025-12', 12],
    ['2025-13', '2025-12', 12],
    ['0000-01', '2025-12', 12],
    ['2026-01', '2025-12', 12],
    ['2025-01', '2025-12', undefined],
    ['2025-01', '2025-12', 0],
    ['2025-01', '2025-12', -1],
    ['2025-01', '2025-12', 1.5],
    ['2025-01', '2025-12', 13],
    ['2025-01', '2025-12', Number.POSITIVE_INFINITY],
  ];
  for (const [start, end, samples] of invalidRanges) {
    assert.equal(isValidEtfTrackingHistory(start, end, samples), false);
  }
});

test('ETF fund detail and comparison views suppress invalid tracking history', () => {
  assert.match(
    analysisScreenSource,
    /\{fund\.benchmark && hasValidTrackingHistory\(fund\.trackingComparison\) && \(\s*<SectionCard\b[^>]*collapsible[^>]*title="BENCHMARK & TRACKING"/,
  );
  assert.match(
    analysisScreenSource,
    /\{hasValidTrackingHistory\(fund\.trackingComparison\) \? \([\s\S]*?Adjusted monthly returns,[\s\S]*?\) : \(/,
  );
  assert.match(
    analysisScreenSource,
    /Tracking history unavailable because its dates or monthly sample count are invalid or incomplete\./,
  );
  assert.match(
    analysisScreenSource,
    /if \(!hasValidTrackingHistory\(tracking\) \|\| !analysis\.benchmark\) return 'Unavailable';/,
  );
  assert.match(
    analysisScreenSource,
    /comparisonMetricRows\.filter\(\(row\) => \{[\s\S]*?comparisonMetricFunds\.some\(\(\{ analysis \}\) =>\s*analysis\.benchmark && hasValidTrackingHistory\(analysis\.trackingComparison\)/,
  );
  assert.match(
    analysisScreenSource,
    /\{comparison\.benchmark && hasValidTrackingHistory\(comparison\.trackingComparison\) \? \([\s\S]*?Tracking history:[\s\S]*?\) : null\}/,
  );
});

test('ETF comparison share preserves valid zero risk and performance metrics', () => {
  const summary = formatReportedEtfHoldingsOverlapShare(
    [{ symbol: 'ZERO', topHoldingsRetrievedAt: null }],
    [],
    [{
      symbol: 'ZERO',
      analysis: {
        totalAssets: 1,
        beta3Year: 0,
        annualizedVolatility: 0,
        maxDrawdown: 0,
        riskAdjustedReturn: 0,
        annualizedReturn: 0,
        trackingComparison: {
          periodStart: '2025-01',
          periodEnd: '2025-12',
          monthlySamples: 12,
          fundAnnualizedReturn: 0,
          benchmarkAnnualizedReturn: 0,
          trackingDifference: 0,
          trackingError: 0,
          source: 'Yahoo Finance',
          asOf: '2026-10-27T15:00:00Z',
        },
        marketRegime: {
          benchmarkSymbol: 'SPY',
          firstYear: 2023,
          lastYear: 2025,
          periods: {
            bull: { averageAnnualReturn: 0, years: 1 },
            bear: { averageAnnualReturn: 0, years: 1 },
            mixed: { averageAnnualReturn: 0, years: 1 },
          },
        },
      },
    }],
  );

  assert.match(
    summary,
    /ZERO: assets under management \$1; 3-year beta 0\.00; 1-year annualized volatility 0\.00%; 1-year maximum drawdown 0\.00%; return \/ volatility ratio 0\.00; 1-year annualized return 0\.00%/,
  );
  assert.match(
    summary,
    /fund return 0\.00%; benchmark return 0\.00%; tracking difference 0\.00%; annualized tracking error 0\.00%/,
  );
  assert.match(
    summary,
    /Historical regime returns \(2023–2025, grouped by SPY\): bull: 0\.00% \(1 year\) · bear: 0\.00% \(1 year\) · mixed: 0\.00% \(1 year\)/,
  );
  assert.doesNotMatch(summary, /ZERO: .*Unavailable/);
});

test('ETF holding overlap share states when selected funds have no common reported positions', () => {
  const summary = formatReportedEtfHoldingsOverlapShare([
    { symbol: 'SPY', topHoldingsRetrievedAt: '2026-10-27T16:00:00.000Z' },
    { symbol: 'QQQ', topHoldingsRetrievedAt: '2026-10-27T16:05:00.000Z' },
  ], []);

  assert.match(summary, /No shared positions among the reported holdings\./);
  assert.match(summary, /only positions reported by the provider/);
});

test('ETF overlap browser sharing sends only the selected comparison to Web Share', async () => {
  const selectedFunds = [
    { symbol: 'SPY', topHoldingsRetrievedAt: '2026-10-27T16:00:00Z' },
    { symbol: 'QQQ', topHoldingsRetrievedAt: '2026-10-27T16:05:00Z' },
  ];
  const message = formatReportedEtfHoldingsOverlapShare(selectedFunds, [
    {
      symbol: 'NVDA',
      positions: [
        { fundSymbol: 'SPY', name: 'NVIDIA', weight: 0.08 },
        { fundSymbol: 'QQQ', name: 'NVIDIA', weight: 0.07 },
      ],
    },
  ]);
  let shareData: { title: string; text: string } | undefined;

  const result = await shareEtfOverlapSummary({
    platform: 'web',
    message,
    webShare: async (data) => {
      shareData = data;
    },
  });

  assert.equal(result, 'shared');
  assert.deepEqual(shareData, { title: 'ETF comparison summary', text: message });
  assert.match(message, /Funds: SPY, QQQ/);
  assert.doesNotMatch(message, /IWM|unselected/i);
});

test('ETF overlap native sharing sends only the selected comparison to the share sheet', async () => {
  const message = formatReportedEtfHoldingsOverlapShare([
    { symbol: 'SPY', topHoldingsRetrievedAt: null },
    { symbol: 'QQQ', topHoldingsRetrievedAt: null },
  ], []);
  let shareData: { title: string; message: string } | undefined;

  const result = await shareEtfOverlapSummary({
    platform: 'native',
    message,
    nativeShare: async (data) => {
      shareData = data;
      return 'shared';
    },
  });

  assert.equal(result, 'shared');
  assert.deepEqual(shareData, { title: 'ETF comparison summary', message });
  assert.match(message, /Funds: SPY, QQQ/);
  assert.doesNotMatch(message, /IWM|unselected/i);
});

test('ETF overlap browser sharing copies when Web Share is unavailable or fails', async (t) => {
  const copied: string[] = [];
  const message = 'Selected comparison: SPY, QQQ';
  const clipboardWriteText = async (text: string) => {
    copied.push(text);
  };

  await t.test('uses clipboard when Web Share is unavailable', async () => {
    assert.equal(await shareEtfOverlapSummary({
      platform: 'web',
      message,
      clipboardWriteText,
    }), 'copied');
    assert.equal(copied.pop(), message);
  });

  await t.test('uses clipboard after a non-cancellation Web Share failure', async () => {
    assert.equal(await shareEtfOverlapSummary({
      platform: 'web',
      message,
      webShare: async () => {
        throw new Error('Web Share failed');
      },
      clipboardWriteText,
    }), 'copied');
    assert.equal(copied.pop(), message);
  });
});

test('ETF overlap browser sharing provides manual copy when browser APIs are blocked', async (t) => {
  await t.test('offers manual copy when neither browser option exists', async () => {
    assert.equal(await shareEtfOverlapSummary({
      platform: 'web',
      message: 'Selected comparison',
    }), 'manual-copy');
  });

  await t.test('offers manual copy when Web Share is rejected and clipboard is unavailable', async () => {
    assert.equal(await shareEtfOverlapSummary({
      platform: 'web',
      message: 'Selected comparison',
      webShare: async () => {
        throw new Error('Web Share blocked');
      },
    }), 'manual-copy');
  });

  await t.test('offers manual copy when clipboard rejects after Web Share is unavailable', async () => {
    assert.equal(await shareEtfOverlapSummary({
      platform: 'web',
      message: 'Selected comparison',
      clipboardWriteText: async () => {
        throw new Error('Clipboard blocked');
      },
    }), 'manual-copy');
  });

  await t.test('offers manual copy when both sharing and clipboard fail', async () => {
    assert.equal(await shareEtfOverlapSummary({
      platform: 'web',
      message: 'Selected comparison',
      webShare: async () => {
        throw new Error('Web Share failed');
      },
      clipboardWriteText: async () => {
        throw new Error('Clipboard failed');
      },
    }), 'manual-copy');
  });

  await t.test('does not turn a user-cancelled share into a clipboard copy', async () => {
    let copied = false;
    const error = new Error('Share dismissed');
    error.name = 'AbortError';
    assert.equal(await shareEtfOverlapSummary({
      platform: 'web',
      message: 'Selected comparison',
      webShare: async () => {
        throw error;
      },
      clipboardWriteText: async () => {
        copied = true;
      },
    }), 'cancelled');
    assert.equal(copied, false);
  });
});

test('ETF overlap native cancellation and errors never count as a successful share', async (t) => {
  await t.test('recognizes a dismissed native share sheet', async () => {
    assert.equal(await shareEtfOverlapSummary({
      platform: 'native',
      message: 'Selected comparison',
      nativeShare: async () => 'dismissed',
    }), 'cancelled');
  });

  await t.test('recognizes a native share cancellation error', async () => {
    const error = new Error('Share dismissed');
    error.name = 'AbortError';
    assert.equal(await shareEtfOverlapSummary({
      platform: 'native',
      message: 'Selected comparison',
      nativeShare: async () => {
        throw error;
      },
    }), 'cancelled');
  });

  await t.test('reports a native share failure', async () => {
    assert.equal(await shareEtfOverlapSummary({
      platform: 'native',
      message: 'Selected comparison',
      nativeShare: async () => {
        throw new Error('Native share failed');
      },
    }), 'failed');
  });
});

test('ETF analysis screen wires selected overlap content and suppresses feedback for cancel or share success', () => {
  assert.match(
    analysisScreenSource,
    /formatReportedEtfHoldingsOverlapShare\(\s*selectedFunds,\s*overlaps,\s*comparisonMetricFunds,?\s*\)/,
  );
  assert.match(analysisScreenSource, /expenseRatio: fund\.expenseRatio/);
  assert.match(analysisScreenSource, /apiFetch<\{[\s\S]*?etfAnalysis\?: EtfAnalysisPayload[\s\S]*?\}>\('\/api\/stocks\/analyze',[\s\S]*?method: 'POST'/);
  assert.match(
    analysisScreenSource,
    /shareEtfOverlapSummary\(\{[\s\S]*?message,\s*[\s\S]*?nativeShare:[\s\S]*?Share\.share\(data\)/,
  );
  assert.match(analysisScreenSource, /result === 'manual-copy'\) setManualCopySummary\(message\)/);
  assert.match(analysisScreenSource, /visible=\{manualCopySummary !== null\}[\s\S]*?selectable[\s\S]*?\{manualCopySummary\}/);
  assert.match(analysisScreenSource, /if \(result === 'copied'\)[\s\S]*?else if \(result === 'manual-copy'\)[\s\S]*?else if \(result === 'unavailable'\)[\s\S]*?else if \(result === 'failed'\)/);
  assert.doesNotMatch(
    analysisScreenSource,
    /result === 'shared'[\s\S]*?setShareStatus|result === 'cancelled'[\s\S]*?setShareStatus/,
  );
  assert.match(analysisScreenSource, /accessibilityLabel="Share ETF comparison summary"/);
});

test('ETF comparison metrics render unavailable values and retain source context', () => {
  assert.equal(formatEtfComparisonValue(null, 'percent'), 'Unavailable');
  assert.equal(formatEtfComparisonValue(Number.NaN, 'assets'), 'Unavailable');
  assert.equal(formatEtfComparisonValue(Number.POSITIVE_INFINITY, 'number'), 'Unavailable');
  assert.equal(formatEtfComparisonValue(0, 'percent'), '0.00%');
  assert.equal(formatEtfComparisonValue(0.0012, 'percent'), '0.12%');
  assert.equal(formatEtfComparisonValue(0.0025, 'basis-points'), '25.0 bps');
  assert.equal(formatEtfComparisonValue(2_500_000_000, 'assets'), '$2.50B');
  assert.match(analysisScreenSource, /title="ETF COST, RISK & PERFORMANCE"/);
  assert.match(analysisScreenSource, /Verified benchmark:/);
  assert.match(analysisScreenSource, /monthlySamples/);
  assert.match(analysisScreenSource, /sampleContext/);
  assert.match(analysisScreenSource, /each row shows its reported years/);
  assert.match(analysisScreenSource, /compare funds with similar strategies/);
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

test('ETF holding snapshots require dated retrievals and complete matching position coverage', () => {
  const holdings = [
    { symbol: 'NVDA', name: 'NVIDIA', weight: 0.08 },
    { symbol: 'AAPL', name: 'Apple', weight: 0.06 },
  ];
  assert.equal(createEtfHoldingSnapshot('SPY', 2, '2026-10-27T12:00:00', holdings), null);
  assert.equal(createEtfHoldingSnapshot('SPY', 3, '2026-10-27T12:00:00Z', holdings), null);
  assert.equal(createEtfHoldingSnapshot('SPY', 2, '2026-10-27T12:00:00Z', [
    ...holdings,
    holdings[0]!,
  ]), null);
  assert.deepEqual(createEtfHoldingSnapshot('spy', 2, '2026-10-27T12:00:00-04:00', holdings), {
    symbol: 'SPY',
    retrievedAt: '2026-10-27T16:00:00.000Z',
    reportedPositionCount: 2,
    holdings,
  });
});

test('saved ETF holding snapshots deduplicate retrievals and compare only matching coverage', () => {
  const previous = createEtfHoldingSnapshot('SPY', 2, '2026-10-26T12:00:00Z', [
    { symbol: 'NVDA', name: 'NVIDIA', weight: 0.08 },
    { symbol: 'AAPL', name: 'Apple', weight: 0.06 },
  ])!;
  const current = createEtfHoldingSnapshot('SPY', 2, '2026-10-27T12:00:00Z', [
    { symbol: 'NVDA', name: 'NVIDIA', weight: 0.09 },
    { symbol: 'MSFT', name: 'Microsoft', weight: 0.05 },
  ])!;
  const otherCoverage = createEtfHoldingSnapshot('SPY', 1, '2026-10-27T18:00:00Z', [
    { symbol: 'NVDA', name: 'NVIDIA', weight: 0.09 },
  ])!;
  const saved = upsertSavedEtfHoldingSnapshot([previous], current);
  assert.equal(upsertSavedEtfHoldingSnapshot(saved, current).length, 2);
  assert.equal(parseSavedEtfHoldingSnapshots(JSON.stringify([...saved, previous])).length, 2);
  assert.deepEqual(compareEtfHoldingSnapshots(current, [...saved, otherCoverage]), {
    previousRetrievedAt: previous.retrievedAt,
    currentRetrievedAt: current.retrievedAt,
    reportedPositionCount: 2,
    changes: [
      {
        symbol: 'AAPL',
        name: 'Apple',
        previousWeight: 0.06,
        currentWeight: null,
        change: 'removed',
      },
      {
        symbol: 'MSFT',
        name: 'Microsoft',
        previousWeight: null,
        currentWeight: 0.05,
        change: 'added',
      },
      {
        symbol: 'NVDA',
        name: 'NVIDIA',
        previousWeight: 0.08,
        currentWeight: 0.09,
        change: 'weight_changed',
      },
    ],
  });
  assert.equal(compareEtfHoldingSnapshots(otherCoverage, saved), null);
  assert.equal(parseSavedEtfHoldingSnapshots('not json').length, 0);
});

test('ETF holding snapshot retention keeps the newest records across tickers', () => {
  const symbols = ['AAA', 'BBB', 'CCC', 'DDD', 'ZZZ'];
  const snapshots = symbols.flatMap((symbol, symbolIndex) =>
    Array.from({ length: 24 }, (_, index) => createEtfHoldingSnapshot(
      symbol,
      1,
      new Date(Date.UTC(2026, 0, 1) + ((symbolIndex * 24 + index) * 86_400_000)).toISOString(),
      [{ symbol: 'NVDA', name: 'NVIDIA', weight: 0.08 }],
    )!));
  const retained = parseSavedEtfHoldingSnapshots(JSON.stringify(snapshots));

  assert.equal(retained.length, 96);
  assert.equal(retained.some(({ symbol }) => symbol === 'ZZZ'), true);
  assert.equal(retained.some(({ symbol }) => symbol === 'AAA'), false);
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
