import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChartHistoryUrl, CHART_HISTORY_RANGES } from '../heatMapChart.ts';

const symbols = ['AAPL', 'SPY', 'GC=F', 'BTC-USD'];

test('stock, ETF, futures, and crypto symbols use every supported chart range', () => {
  assert.deepEqual(
    CHART_HISTORY_RANGES.map(({ label }) => label),
    ['1W', '1M', '3M', '6M', '1Y', '2Y'],
  );

  for (const range of CHART_HISTORY_RANGES) {
    for (const symbol of symbols) {
      assert.equal(
        buildChartHistoryUrl(symbol, range),
        `/api/stocks/chart/${encodeURIComponent(symbol)}?period=${range.period}&interval=${range.interval}`,
      );
    }
  }
});
