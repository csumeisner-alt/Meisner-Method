import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const chartScreen = readFileSync(new URL('../app/heat-map-chart.tsx', import.meta.url), 'utf8');
const stocksRoute = readFileSync(new URL('../../api-server/src/routes/stocks.ts', import.meta.url), 'utf8');

test('primary and comparison history requests share the selected range URL builder', () => {
  assert.match(chartScreen, /apiFetch<History>\(buildChartHistoryUrl\(symbol, range\)\)/);
  assert.match(chartScreen, /apiFetch<History>\(buildChartHistoryUrl\(ticker, range\)\)/);
  assert.match(chartScreen, /CHART_HISTORY_RANGES\.map/);

  const periods = stocksRoute.match(/const VALID_PERIODS = \[([^\]]+)\]/)?.[1];
  const intervals = stocksRoute.match(/const VALID_INTERVALS = \[([^\]]+)\]/)?.[1];
  assert.ok(periods, 'the chart route should validate supported periods');
  assert.ok(intervals, 'the chart route should validate supported intervals');
  for (const period of ['5d', '1mo', '3mo', '6mo', '1y', '2y']) {
    assert.ok(periods.includes(`"${period}"`), `the chart route should accept ${period}`);
  }
  for (const interval of ['1h', '1d', '1wk']) {
    assert.ok(intervals.includes(`"${interval}"`), `the chart route should accept ${interval}`);
  }
});

test('unsupported primary symbols and unavailable comparisons have isolated, clear states', () => {
  assert.match(chartScreen, /No historical prices are available for \{symbol\}\./);
  assert.match(chartScreen, /No history available for \{item\.symbol\}\. Your main chart is unchanged\./);
  assert.match(chartScreen, /return \{ symbol: ticker, candles: \[\], loading: false, error: true \}/);
  assert.match(chartScreen, /if \(!cancelled\) setLoadError\(true\)/);
});
