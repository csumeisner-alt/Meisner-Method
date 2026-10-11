import test from 'node:test';
import assert from 'node:assert/strict';
import { detectHeatMapPriceLevels } from '../heatMapChart.ts';

test('detects repeated nearby swing lows and highs as chart levels', () => {
  const bars = [
    { l: 5, h: 6, c: 5.5 },
    { l: 4, h: 7, c: 5.8 },
    { l: 5, h: 6, c: 5.4 },
    { l: 4.05, h: 7.05, c: 5.7 },
    { l: 5, h: 6.5, c: 5.2 },
    { l: 4, h: 7.1, c: 5.1 },
    { l: 5, h: 6, c: 5.3 },
    { l: 4.4, h: 6, c: 4.8 },
    { l: 4.5, h: 6.2, c: 4.7 },
  ];

  const result = detectHeatMapPriceLevels(bars);
  assert.equal(result.support.length, 1);
  assert.ok(Math.abs(result.support[0]! - 4.0167) < 0.01);
  assert.equal(result.resistance.length, 1);
  assert.ok(Math.abs(result.resistance[0]! - 7.05) < 0.02);
});

test('does not invent levels without at least two nearby swing touches', () => {
  const bars = [
    { l: 9, h: 11, c: 10 },
    { l: 8, h: 12, c: 10 },
    { l: 9, h: 11, c: 10 },
    { l: 7, h: 13, c: 10 },
    { l: 9, h: 11, c: 10 },
  ];
  assert.deepEqual(detectHeatMapPriceLevels(bars), { support: [], resistance: [] });
});
