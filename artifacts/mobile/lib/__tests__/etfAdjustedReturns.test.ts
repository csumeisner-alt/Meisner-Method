import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addProviderAdjustedReturns,
  alignProviderAdjustedReturns,
  calculateRelativeReturnPercent,
} from '../etfAdjustedReturns.ts';
import type { ProviderAdjustedReturnSeries } from '../etfAdjustedReturns.ts';

const available = (values: ProviderAdjustedReturnSeries['values']): ProviderAdjustedReturnSeries => ({
  status: 'available',
  method: 'provider_adjusted_close',
  values,
  reason: null,
});

const unavailable: ProviderAdjustedReturnSeries = {
  status: 'unavailable',
  method: 'provider_adjusted_close',
  values: [],
  reason: 'Provider distribution history is missing.',
};

test('rebases provider adjusted returns to the first displayed date', () => {
  const result = addProviderAdjustedReturns(
    [{ date: '2026-01-01', c: 100 }, { date: '2026-01-02', c: 101 }],
    available([
      { date: '2026-01-01', returnPercent: 5 },
      { date: '2026-01-02', returnPercent: 10 },
    ]),
  );

  assert.deepEqual(result?.map(({ adjustedReturnPercent }) => adjustedReturnPercent), [0, 4.761904761904767]);
});

test('compares funds on the same reported dates and rebases both at the first shared date', () => {
  const result = alignProviderAdjustedReturns(
    [
      { date: '2026-01-01', c: 100 },
      { date: '2026-01-02', c: 101 },
      { date: '2026-01-03', c: 102 },
    ],
    [
      { date: '2026-01-02', c: 200 },
      { date: '2026-01-03', c: 210 },
    ],
    available([
      { date: '2026-01-01', returnPercent: 0 },
      { date: '2026-01-02', returnPercent: 10 },
      { date: '2026-01-03', returnPercent: 15 },
    ]),
    available([
      { date: '2026-01-02', returnPercent: 20 },
      { date: '2026-01-03', returnPercent: 32 },
    ]),
  );

  assert.equal(result.available, true);
  assert.deepEqual(result.dates, ['2026-01-02', '2026-01-03']);
  assert.deepEqual(result.primary.map(({ date }) => date), ['2026-01-02', '2026-01-03']);
  assert.deepEqual(result.comparison.map(({ date }) => date), ['2026-01-02', '2026-01-03']);
  assert.ok(Math.abs(result.primary[0]!.adjustedReturnPercent!) < 1e-12);
  assert.ok(Math.abs(result.primary[1]!.adjustedReturnPercent! - 4.54545454545) < 1e-9);
  assert.ok(Math.abs(result.comparison[0]!.adjustedReturnPercent!) < 1e-12);
  assert.ok(Math.abs(result.comparison[1]!.adjustedReturnPercent! - 10) < 1e-9);
});

test('does not estimate a series when adjustment or distribution coverage is unavailable', () => {
  const result = alignProviderAdjustedReturns(
    [{ date: '2026-01-01' }, { date: '2026-01-02' }],
    [{ date: '2026-01-01' }, { date: '2026-01-02' }],
    available([{ date: '2026-01-01', returnPercent: 0 }, { date: '2026-01-02', returnPercent: 4 }]),
    unavailable,
  );

  assert.equal(result.available, false);
  assert.deepEqual(result.primary, []);
  assert.deepEqual(result.comparison, []);
});

test('calculates compounded relative return rather than subtracting percentage points', () => {
  assert.equal(calculateRelativeReturnPercent(20, 10), 9.090909090909083);
  assert.equal(calculateRelativeReturnPercent(10, -100), null);
});
