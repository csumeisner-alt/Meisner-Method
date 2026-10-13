import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildChartHistoryUrl,
  CHART_HISTORY_RANGES,
  formatHeatMapChartAxisDate,
  formatHeatMapChartFullDate,
  formatHeatMapChartWindow,
} from '../heatMapChart.ts';

const symbols = ['AAPL', 'SPY', 'GC=F', 'BTC-USD'];

test('stock, ETF, futures, and crypto symbols use every supported chart range', () => {
  assert.deepEqual(
    CHART_HISTORY_RANGES.map(({ label }) => label),
    ['1W', '1M', '3M', '6M', '1Y', '2Y', '3Y', '5Y', 'MAX'],
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

test('chart axis labels provide useful context at different history lengths', () => {
  assert.equal(formatHeatMapChartAxisDate('2026-10-12', 5), 'Mon 12');
  assert.equal(formatHeatMapChartAxisDate('2026-10-12', 45), 'Oct 12');
  assert.equal(formatHeatMapChartAxisDate('2026-10-12', 365), "Oct '26");
  assert.equal(formatHeatMapChartFullDate('2026-10-12'), 'Oct 12, 2026');
  assert.equal(formatHeatMapChartWindow('2026-07-10', '2026-10-12'), 'Jul 10 – Oct 12, 2026');
  assert.equal(formatHeatMapChartWindow('2025-12-15', '2026-01-20'), 'Dec 15, 2025 – Jan 20, 2026');
});
