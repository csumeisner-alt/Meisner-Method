import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alignCandleSeriesOnSharedDates,
  alignCandleSeriesOnSharedDatesAcrossSeries,
} from '../alignCandleSeries.ts';

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

test('aligns three or more series only on dates reported by every fund', () => {
  const result = alignCandleSeriesOnSharedDatesAcrossSeries([
    [candle('2026-01-01', 10), candle('2026-01-02', 11), candle('2026-01-03', 12)],
    [candle('2026-01-01', 20), candle('2026-01-03', 22)],
    [candle('2026-01-02', 30), candle('2026-01-03', 33)],
  ]);

  assert.deepEqual(result.dates, ['2026-01-03']);
  assert.deepEqual(result.series.map((series) => series.map(({ date, c }) => [date, c])), [
    [['2026-01-03', 12]],
    [['2026-01-03', 22]],
    [['2026-01-03', 33]],
  ]);
});

test('does not return shared dates when a selected series has no reported observations', () => {
  assert.deepEqual(
    alignCandleSeriesOnSharedDatesAcrossSeries([
      [candle('2026-01-01', 10), candle('2026-01-02', 11)],
      [],
      [candle('2026-01-01', 30)],
    ]),
    { dates: [], series: [[], [], []] },
  );
});
