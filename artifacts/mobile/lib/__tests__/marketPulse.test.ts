import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatMarketPulseDetail,
  getMarketPulseInsight,
  isMarketPulseStale,
  MARKET_PULSE_FRESHNESS_LIMIT_SECONDS,
} from '../marketPulse.ts';

test('market pulse is hot when the total-market index is up for the session', () => {
  assert.deepEqual(getMarketPulseInsight({
    changePercent: 0.75,
    priceTimestamp: 1_000,
  }), {
    tone: 'HOT',
    changePercent: 0.75,
    priceTimestamp: 1_000,
    marketOpen: null,
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
    marketOpen: null,
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
    marketOpen: null,
  });
});

test('market pulse pauses only after the freshness limit while the regular session is open', () => {
  const timestamp = 1_000;
  const pulse = getMarketPulseInsight({
    changePercent: 1.25,
    priceTimestamp: timestamp,
    marketOpen: true,
  });

  assert.equal(
    isMarketPulseStale(pulse, (timestamp + MARKET_PULSE_FRESHNESS_LIMIT_SECONDS) * 1000),
    false,
  );
  assert.equal(
    isMarketPulseStale(pulse, (timestamp + MARKET_PULSE_FRESHNESS_LIMIT_SECONDS + 1) * 1000),
    true,
  );
  assert.equal(
    isMarketPulseStale({ ...pulse, marketOpen: false }, (timestamp + 24 * 60 * 60) * 1000),
    false,
  );
});

test('market pulse applies freshness through an early close and keeps the last quote readable afterward', () => {
  const quoteTimestamp = Date.parse('2024-11-29T17:54:00.000Z') / 1000;
  const pulse = getMarketPulseInsight({
    changePercent: 1.25,
    priceTimestamp: quoteTimestamp,
    marketOpen: true,
  });

  // 12:59 p.m. Eastern is still before the scheduled 1 p.m. close.
  assert.equal(
    isMarketPulseStale(pulse, Date.parse('2024-11-29T17:59:00.000Z')),
    false,
  );
  assert.equal(
    isMarketPulseStale(pulse, Date.parse('2024-11-29T17:59:01.000Z')),
    true,
  );

  const afterClose = getMarketPulseInsight({
    changePercent: 1.25,
    priceTimestamp: quoteTimestamp,
    marketOpen: false,
  });
  const afterCloseNow = Date.parse('2024-11-29T18:05:00.000Z');
  assert.equal(isMarketPulseStale(afterClose, afterCloseNow), false);
  assert.match(
    formatMarketPulseDetail(afterClose, afterCloseNow) ?? '',
    /^\+1\.25% LAST SESSION · /,
  );
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
  assert.match(formatMarketPulseDetail({
    ...insight,
    marketOpen: false,
  }, quoteTime.getTime()) ?? '', /^\+1\.25% LAST SESSION · /);
});
