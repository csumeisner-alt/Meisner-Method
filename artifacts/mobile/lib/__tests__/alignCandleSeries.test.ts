import test from 'node:test';
import assert from 'node:assert/strict';
import { alignCandleSeriesOnSharedDates } from '../alignCandleSeries.ts';

const candle = (date: string, close: number) => ({ date, c: close });

test('aligns both candle series on matching reported dates', () => {
  const result = alignCandleSeriesOnSharedDates(
    [candle('2026-01-01', 10), candle('2026-01-02', 11), candle('2026-01-03', 12)],
    [candle('2026-01-01', 20), candle('2026-01-03', 22)],
  );

  assert.deepEqual(result.dates, ['2026-01-01', '2026-01-03']);
  assert.deepEqual(result.primary.map(({ date, c }) => [date, c]), [
    ['2026-01-01', 10],
    ['2026-01-03', 12],
  ]);
  assert.deepEqual(result.comparison.map(({ date, c }) => [date, c]), [
    ['2026-01-01', 20],
    ['2026-01-03', 22],
  ]);
});

test('preserves gaps instead of adding or interpolating candles', () => {
  const result = alignCandleSeriesOnSharedDates(
    [candle('2026-01-01', 10), candle('2026-01-03', 12)],
    [candle('2026-01-02', 21), candle('2026-01-03', 22)],
  );

  assert.deepEqual(result.dates, ['2026-01-03']);
  assert.deepEqual(result.primary, [candle('2026-01-03', 12)]);
  assert.deepEqual(result.comparison, [candle('2026-01-03', 22)]);
});

test('returns no shared observations when reported dates do not overlap', () => {
  const result = alignCandleSeriesOnSharedDates(
    [candle('2026-01-01', 10)],
    [candle('2026-01-02', 20)],
  );

  assert.deepEqual(result, { dates: [], primary: [], comparison: [] });
});
