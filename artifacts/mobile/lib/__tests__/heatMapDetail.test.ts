import assert from 'node:assert/strict';
import test from 'node:test';
import { getHeatMapRangePosition, parseHeatMapDetailStats } from '../heatMapDetail.ts';

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
  });
});

test('heat-map range marker is clamped and rejects unusable ranges', () => {
  assert.equal(getHeatMapRangePosition(25, 0, 100), 25);
  assert.equal(getHeatMapRangePosition(-5, 0, 100), 0);
  assert.equal(getHeatMapRangePosition(120, 0, 100), 100);
  assert.equal(getHeatMapRangePosition(20, 20, 20), null);
  assert.equal(getHeatMapRangePosition(20, null, 30), null);
});
