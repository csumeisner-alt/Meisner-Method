import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const chartScreen = readFileSync(new URL('../app/heat-map-chart.tsx', import.meta.url), 'utf8');
const heatMapScreen = readFileSync(new URL('../app/heat-map.tsx', import.meta.url), 'utf8');
const analysisScreen = readFileSync(new URL('../app/analysis/[symbol].tsx', import.meta.url), 'utf8');
const chartHistoryLib = readFileSync(new URL('../lib/heatMapChart.ts', import.meta.url), 'utf8');
const stockChart = readFileSync(new URL('../components/StockChart.tsx', import.meta.url), 'utf8');
const stocksRoute = readFileSync(new URL('../../api-server/src/routes/stocks.ts', import.meta.url), 'utf8');

test('primary and comparison history requests share the selected range URL builder', () => {
  assert.match(chartScreen, /apiFetch<History>\(buildChartHistoryUrl\(symbol, range\)\)/);
  assert.match(chartScreen, /apiFetch<History>\(buildChartHistoryUrl\(ticker, range\)\)/);
  assert.match(chartScreen, /CHART_HISTORY_RANGES\.map/);

  const periods = stocksRoute.match(/const VALID_PERIODS = \[([^\]]+)\]/)?.[1];
  const intervals = stocksRoute.match(/const VALID_INTERVALS = \[([^\]]+)\]/)?.[1];
  assert.ok(periods, 'the chart route should validate supported periods');
  assert.ok(intervals, 'the chart route should validate supported intervals');
  for (const period of ['5d', '1mo', '3mo', '6mo', '1y', '2y', '3y', '5y', 'max']) {
    assert.ok(periods.includes(`"${period}"`), `the chart route should accept ${period}`);
  }
  for (const interval of ['1h', '1d', '1wk']) {
    assert.ok(intervals.includes(`"${interval}"`), `the chart route should accept ${interval}`);
  }
});

test('longer chart ranges are exposed and chart launch dismisses the instrument modal first', () => {
  for (const label of ['3Y', '5Y', 'MAX']) {
    assert.match(chartHistoryLib, new RegExp(`label: '${label}'`));
  }
  assert.match(chartScreen, /showMA50=\{false\}/);
  assert.match(chartScreen, /: comparisonSlices\.length > 0 \?/);
  assert.match(heatMapScreen, /setSelectedQuote\(null\);[\s\S]*?setTimeout\(\(\) => \{[\s\S]*?router\.push\(/);
});

test('chart and AI analysis back navigation restores the originating heat-map detail card', () => {
  assert.match(heatMapScreen, /detailReturnRef = useRef</);
  assert.match(heatMapScreen, /detailReturnRef\.current = \{\s*quote: selectedQuote,\s*unavailableCommodity: selectedUnavailableCommodity,/);
  assert.match(heatMapScreen, /const returnDetail = detailReturnRef\.current;[\s\S]*?detailReturnRef\.current = null;[\s\S]*?setSelectedQuote\(returnDetail\.quote\);[\s\S]*?setSelectedUnavailableCommodity\(returnDetail\.unavailableCommodity\);/);
  assert.match(chartScreen, /testID="heat-map-chart-back" onPress=\{\(\) => router\.back\(\)\}/);
  assert.match(analysisScreen, /onPress=\{\(\) => router\.back\(\)\}/);

  const detailModal = heatMapScreen.slice(heatMapScreen.indexOf('<HeatMapDetailModal'));
  assert.equal(
    (detailModal.match(/dismissDetailForNavigation\(\)/g) ?? []).length,
    4,
    'stock, ETF, commodity analysis and chart actions should preserve the selected detail card',
  );
});

test('comparison chart occupies the primary chart card instead of a second chart below', () => {
  assert.match(chartScreen, /comparisonSlices\.length > 0 \? \([\s\S]*?<ComparisonChart/);
  const compareForm = chartScreen.slice(chartScreen.indexOf('>Compare instruments'));
  assert.ok(compareForm.length > 0, 'the comparison controls should remain available');
  assert.doesNotMatch(compareForm, /<ComparisonChart/);
});

test('chart tap handling uses a React Native press target for drawing in web preview', () => {
  assert.match(stockChart, /testID="stock-chart-touch-target"[\s\S]*?onPress=\{handleTouch\}/);
  assert.match(stockChart, /getLocalPointerCoordinate\(e, 'x'\)/);
  assert.match(stockChart, /pageCoordinate.*-\s*origin/);
  assert.match(stockChart, /onChartPoint\?\.\(\{/);
  assert.doesNotMatch(stockChart, /<Svg[^>]*onPress=\{handleTouch\}/);
  assert.match(stockChart, /formatHeatMapChartWindow\(firstDate, lastDate\)/);
});

test('range selector stays horizontal, shows selected-range return, and exposes both chart styles', () => {
  assert.match(chartScreen, /testID="heat-map-chart-range-strip" horizontal/);
  assert.match(chartScreen, /rangeChange\.toFixed\(2\)/);
  assert.match(chartScreen, /testID="heat-map-chart-mode-line"/);
  assert.match(chartScreen, /testID="heat-map-chart-mode-candles"/);
  assert.match(chartScreen, /chartMode=\{chartMode\}/);
  assert.match(stockChart, /chartMode === 'candles' \? candles\.map/);
  assert.match(stockChart, /py\(candle\.h\)/);
  assert.match(stockChart, /py\(candle\.l\)/);
});

test('unsupported primary symbols and unavailable comparisons have isolated, clear states', () => {
  assert.match(chartScreen, /No historical prices are available for \{symbol\}\./);
  assert.match(chartScreen, /No history available for \{item\.symbol\}\. Your main chart is unchanged\./);
  assert.match(chartScreen, /return \{ symbol: ticker, candles: \[\], loading: false, error: true \}/);
  assert.match(chartScreen, /if \(!cancelled\) setLoadError\(true\)/);
});
