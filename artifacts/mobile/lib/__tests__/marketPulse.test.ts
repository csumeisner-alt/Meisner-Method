import assert from 'node:assert/strict';
import test from 'node:test';
import { formatMarketPulseDetail, getMarketPulseInsight } from '../marketPulse.ts';

test('market pulse is hot when the total-market index is up for the session', () => {
  assert.deepEqual(getMarketPulseInsight({
    changePercent: 0.75,
    priceTimestamp: 1_000,
  }), {
    tone: 'HOT',
    changePercent: 0.75,
    priceTimestamp: 1_000,
  });
});

test('market pulse is cold when the total-market index is down for the session', () => {
  assert.deepEqual(getMarketPulseInsight({
    changePercent: -0.75,
    priceTimestamp: 1_000,
  }), {
    tone: 'COLD',
    changePercent: -0.75,
    priceTimestamp: 1_000,
  });
});

test('market pulse is neutral when its daily move is exactly zero or missing', () => {
  assert.equal(getMarketPulseInsight({
    changePercent: 0,
    priceTimestamp: 1_000,
  }).tone, 'NEUTRAL');
  assert.deepEqual(getMarketPulseInsight(undefined), {
    tone: 'NEUTRAL',
    changePercent: null,
    priceTimestamp: null,
  });
});

test('market pulse detail shows only the signed percentage and quote time, never the index price', () => {
  const quoteTime = new Date('2026-10-06T15:30:00.000Z');
  const insight = getMarketPulseInsight({
    changePercent: 1.25,
    priceTimestamp: Math.floor(quoteTime.getTime() / 1000),
  });

  const todayDetail = formatMarketPulseDetail(insight, quoteTime.getTime());
  assert.ok(todayDetail);
  assert.match(todayDetail, /^\+1\.25% TODAY · /);
  assert.match(formatMarketPulseDetail({
    ...insight,
    priceTimestamp: Math.floor((quoteTime.getTime() - 24 * 60 * 60 * 1000) / 1000),
  }, quoteTime.getTime()) ?? '', /^\+1\.25% LAST SESSION · /);
});
