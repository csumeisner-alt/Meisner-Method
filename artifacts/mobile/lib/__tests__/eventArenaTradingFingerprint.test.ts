import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeEventArenaTradingFingerprint,
  FINGERPRINT_DOMINANCE_SHARE_PERCENT,
  FINGERPRINT_HIGH_FREQUENCY_TRADES_PER_24H,
  FINGERPRINT_MEANINGFUL_DRAWDOWN_PERCENT,
  FINGERPRINT_MIN_PATTERN_TRADES,
  type EventArenaTradingFingerprintInput,
  type FingerprintTradeRecord,
} from '../eventArenaTradingFingerprint.ts';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const START = Date.UTC(2026, 0, 5, 9);
const END = START + 5 * DAY;

function trade(
  id: string,
  action: FingerprintTradeRecord['action'],
  hoursAfterStart: number,
  overrides: Partial<FingerprintTradeRecord> = {},
): FingerprintTradeRecord {
  const base: FingerprintTradeRecord = {
    id,
    participantId: 'participant-a',
    eventId: 'event-a',
    accountId: 'event-account-a',
    symbol: 'AAA',
    companyName: 'AAA Inc.',
    action,
    shares: 10,
    price: 100,
    total: 1_000,
    date: new Date(START + hoursAfterStart * HOUR).toISOString(),
  };
  return { ...base, ...overrides };
}

function input(
  transactions: FingerprintTradeRecord[],
  overrides: Partial<EventArenaTradingFingerprintInput> = {},
): EventArenaTradingFingerprintInput {
  return {
    participantId: 'participant-a',
    accountId: 'event-account-a',
    eventId: 'event-a',
    eventType: 'event-arena',
    eventStartAtMs: START,
    eventEndAtMs: END,
    startingEquity: 100_000,
    transactions,
    ...overrides,
  };
}

test('uses only filled trades for the exact participant, account, event, and event window', () => {
  const acceptedBuy = trade('buy-1', 'BUY', 1);
  const acceptedSell = trade('sell-1', 'SELL', 2, { realizedPnL: 25 });
  const unrelated = [
    trade('other-participant', 'SELL', 2, { participantId: 'participant-b', realizedPnL: 900 }),
    trade('other-account', 'SELL', 2, { accountId: 'regular-account', realizedPnL: 900 }),
    trade('other-event', 'SELL', 2, { eventId: 'event-b', realizedPnL: 900 }),
    trade('before-event', 'SELL', -1, { realizedPnL: 900 }),
    trade('after-event', 'SELL', 121, { realizedPnL: 900 }),
    trade('pending', 'SELL', 2, { executionStatus: 'pending', realizedPnL: 900 }),
    trade('cancelled', 'SELL', 2, { executionStatus: 'cancelled', realizedPnL: 900 }),
    trade('rejected', 'SELL', 2, { executionStatus: 'rejected', realizedPnL: 900 }),
    trade('unfilled', 'SELL', 2, { executionStatus: 'unfilled', realizedPnL: 900 }),
    trade('other-lightning', 'SELL', 2, {
      lightningRoundEventId: 'lightning-other',
      realizedPnL: 900,
    }),
    trade('dividend', 'DIVIDEND', 2, { realizedPnL: 900 }),
  ];

  const result = analyzeEventArenaTradingFingerprint(input([acceptedBuy, acceptedSell, ...unrelated]));
  assert.equal(result.eligibleFillCount, 2);
  assert.equal(result.completedTradeCount, 1);
  assert.equal(result.totalRealizedPnl, 25);
  assert.equal(result.biggestWinningTrade?.transactionId, 'sell-1');
});

test('uses net realized P&L after fees and reports biggest winner and loser', () => {
  const result = analyzeEventArenaTradingFingerprint(input([
    trade('buy-a', 'BUY', 0),
    trade('winner-a', 'SELL', 1, { realizedPnL: 110, fee: 10 }),
    trade('buy-b', 'BUY', 2, { symbol: 'BBB' }),
    trade('loser-b', 'SELL', 3, { symbol: 'BBB', realizedPnL: -45, fee: 5 }),
    trade('buy-c', 'BUY', 4, { symbol: 'CCC' }),
    trade('winner-c', 'SELL', 5, { symbol: 'CCC', realizedPnL: 30 }),
  ]));

  assert.equal(result.totalRealizedPnl, 80);
  assert.equal(result.biggestWinningTrade?.netRealizedPnl, 100);
  assert.equal(result.biggestLosingTrade?.netRealizedPnl, -50);
  assert.equal(result.biggestWinnerContributionPercent, 125);
  assert.equal(result.winRate.percent, 66.66666666666666);
  assert.equal(result.winRate.winThreshold, 0.01);
});

test('calculates FIFO-weighted holding time separately for profitable and losing closes', () => {
  const result = analyzeEventArenaTradingFingerprint(input([
    trade('buy-long-old', 'BUY', 0, { shares: 4 }),
    trade('buy-long-new', 'BUY', 6, { shares: 6 }),
    trade('sell-long', 'SELL', 24, { shares: 10, realizedPnL: 40 }),
    trade('short-open', 'SHORT_SELL', 25, { symbol: 'BBB', shares: 5 }),
    trade('short-close', 'BUY_TO_COVER', 29, {
      symbol: 'BBB',
      shares: 5,
      realizedPnL: -20,
    }),
  ]));

  assert.equal(result.closedTrades[0]?.holdingTimeHours, 20.4);
  assert.equal(result.closedTrades[1]?.holdingTimeHours, 4);
  assert.equal(result.averageHoldingTime.profitableHours, 20.4);
  assert.equal(result.averageHoldingTime.profitableTradesWithKnownHoldingTime, 1);
  assert.equal(result.averageHoldingTime.losingHours, 4);
  assert.equal(result.averageHoldingTime.losingTradesWithKnownHoldingTime, 1);
});

test('does not invent holding time when an event close has no matching event opening lot', () => {
  const result = analyzeEventArenaTradingFingerprint(input([
    trade('unmatched-sell', 'SELL', 3, { realizedPnL: 40 }),
  ]));

  assert.equal(result.completedTradeCount, 1);
  assert.equal(result.biggestWinningTrade?.netRealizedPnl, 40);
  assert.equal(result.averageHoldingTime.profitableHours, null);
  assert.equal(result.averageHoldingTime.profitableTradesWithKnownHoldingTime, 0);
});

test('missing realized values are excluded instead of treated as zero-profit trades', () => {
  const result = analyzeEventArenaTradingFingerprint(input([
    trade('buy', 'BUY', 0),
    trade('unknown-exit', 'SELL', 4),
  ]));

  assert.equal(result.eligibleFillCount, 2);
  assert.equal(result.incompleteCloseCount, 1);
  assert.equal(result.completedTradeCount, 1);
  assert.equal(result.realizedTradeSampleSize, 0);
  assert.equal(result.totalRealizedPnl, null);
  assert.equal(result.biggestWinningTrade, null);
  assert.equal(result.biggestLosingTrade, null);
  assert.equal(result.biggestWinnerContributionPercent, null);
  assert.equal(result.winRate.percent, null);
  assert.equal(result.consistency.maxConsecutiveWins, null);
  assert.equal(result.tradingFrequency.sampleSize, 1);
  assert.equal(result.tradingFrequency.completedTradesPer24Hours, 0.2);
  assert.equal(result.tradingFrequency.unusuallyHigh, null);
});

test('zero or negative total profit never produces an invalid winner contribution', () => {
  const zeroTotal = analyzeEventArenaTradingFingerprint(input([
    trade('buy-a', 'BUY', 0),
    trade('win-a', 'SELL', 1, { realizedPnL: 100 }),
    trade('buy-b', 'BUY', 2, { symbol: 'BBB' }),
    trade('loss-b', 'SELL', 3, { symbol: 'BBB', realizedPnL: -100 }),
  ]));
  const negativeTotal = analyzeEventArenaTradingFingerprint(input([
    trade('buy-a', 'BUY', 0),
    trade('win-a', 'SELL', 1, { realizedPnL: 100 }),
    trade('buy-b', 'BUY', 2, { symbol: 'BBB' }),
    trade('loss-b', 'SELL', 3, { symbol: 'BBB', realizedPnL: -130 }),
  ]));
  const onlyBreakeven = analyzeEventArenaTradingFingerprint(input([
    trade('buy-zero', 'BUY', 0),
    trade('sell-zero', 'SELL', 1, { realizedPnL: 0 }),
  ]));

  assert.equal(zeroTotal.totalRealizedPnl, 0);
  assert.equal(zeroTotal.biggestWinnerContributionPercent, null);
  assert.equal(negativeTotal.totalRealizedPnl, -30);
  assert.equal(negativeTotal.biggestWinnerContributionPercent, null);
  assert.equal(onlyBreakeven.totalRealizedPnl, 0);
  assert.equal(onlyBreakeven.biggestWinningTrade, null);
  assert.equal(onlyBreakeven.biggestLosingTrade, null);
  assert.equal(onlyBreakeven.winRate.percent, 0);
});

test('reports streaks and position concentration only after a meaningful sample', () => {
  const result = analyzeEventArenaTradingFingerprint(input([
    trade('buy-a', 'BUY', 0, { symbol: 'AAA' }),
    trade('win-a', 'SELL', 1, { symbol: 'AAA', realizedPnL: 100 }),
    trade('buy-a2', 'BUY', 2, { symbol: 'AAA' }),
    trade('loss-a', 'SELL', 3, { symbol: 'AAA', realizedPnL: -20 }),
    trade('buy-b', 'BUY', 4, { symbol: 'BBB' }),
    trade('loss-b', 'SELL', 5, { symbol: 'BBB', realizedPnL: -20 }),
  ]));

  assert.equal(result.consistency.sampleSize, FINGERPRINT_MIN_PATTERN_TRADES);
  assert.equal(result.consistency.meaningfulPatternSample, true);
  assert.equal(result.consistency.maxConsecutiveWins, 1);
  assert.equal(result.consistency.maxConsecutiveLosses, 2);
  assert.equal(result.positionDominance.status, 'dominant');
  assert.equal(result.positionDominance.dominantSymbol, 'AAA');
  assert.ok(
    Math.abs(result.positionDominance.shareOfAbsoluteRealizedPnlPercent! - 85.71428571428571) < 1e-9,
  );
  assert.equal(FINGERPRINT_DOMINANCE_SHARE_PERCENT, 70);
});

test('One-Stock Challenge marks concentration as required by the rules, not a behavioral pattern', () => {
  const result = analyzeEventArenaTradingFingerprint(input([
    trade('buy-a', 'BUY', 0),
    trade('win-a', 'SELL', 1, { realizedPnL: 20 }),
    trade('buy-b', 'BUY', 2),
    trade('win-b', 'SELL', 3, { realizedPnL: 15 }),
    trade('buy-c', 'BUY', 4),
    trade('win-c', 'SELL', 5, { realizedPnL: 10 }),
  ], { eventType: 'one-stock-challenge' }));

  assert.equal(result.positionDominance.status, 'rule-constrained');
  assert.equal(result.positionDominance.dominantSymbol, 'AAA');
});

test('Lightning Round requires its event tag, uses at most 24 hours, and normalizes frequency', () => {
  const lightningTrade = (id: string, action: FingerprintTradeRecord['action'], hour: number, extra = {}) =>
    trade(id, action, hour, { lightningRoundEventId: 'event-a', ...extra });
  const result = analyzeEventArenaTradingFingerprint(input([
    lightningTrade('buy-1', 'BUY', 0),
    lightningTrade('sell-1', 'SELL', 2, { realizedPnL: 10 }),
    lightningTrade('buy-2', 'BUY', 4, { symbol: 'BBB' }),
    lightningTrade('sell-2', 'SELL', 6, { symbol: 'BBB', realizedPnL: 10 }),
    lightningTrade('buy-3', 'BUY', 8, { symbol: 'CCC' }),
    lightningTrade('sell-3', 'SELL', 10, { symbol: 'CCC', realizedPnL: 10 }),
    lightningTrade('late-buy', 'BUY', 26, { symbol: 'DDD' }),
    lightningTrade('late-sell', 'SELL', 27, { symbol: 'DDD', realizedPnL: 10 }),
    trade('other-event-buy', 'BUY', 0, { lightningRoundEventId: 'event-b' }),
    trade('untagged', 'SELL', 2, { realizedPnL: 100 }),
  ], {
    eventType: 'lightning-round',
    eventEndAtMs: START + 48 * HOUR,
  }));

  assert.equal(result.eligibleFillCount, 6);
  assert.equal(result.completedTradeCount, 3);
  assert.equal(result.tradingFrequency.eventDurationHours, 24);
  assert.equal(result.tradingFrequency.completedTradesPer24Hours, 3);
  assert.equal(result.tradingFrequency.unusuallyHigh, false);
  assert.equal(result.tradingFrequency.highFrequencyThresholdPer24Hours,
    FINGERPRINT_HIGH_FREQUENCY_TRADES_PER_24H);
});

test('a single Lightning Round enrollment buy is not a completed trade or a pattern', () => {
  const result = analyzeEventArenaTradingFingerprint(input([
    trade('enrollment-buy', 'BUY', 0, { lightningRoundEventId: 'event-a' }),
  ], { eventType: 'lightning-round', eventEndAtMs: START + DAY }));

  assert.equal(result.eligibleFillCount, 1);
  assert.equal(result.completedTradeCount, 0);
  assert.equal(result.winRate.percent, null);
  assert.equal(result.consistency.meaningfulPatternSample, false);
  assert.equal(result.tradingFrequency.unusuallyHigh, null);
});

test('frequency is normalized to event duration and does not label a tiny sample', () => {
  const transactions: FingerprintTradeRecord[] = [];
  for (let index = 0; index < 3; index += 1) {
    transactions.push(
      trade(`buy-${index}`, 'BUY', index * 2),
      trade(`sell-${index}`, 'SELL', index * 2 + 1, {
        symbol: `SYM${index}`,
        realizedPnL: 10,
      }),
    );
  }
  const shortEvent = analyzeEventArenaTradingFingerprint(input(transactions, {
    eventEndAtMs: START + 6 * HOUR,
  }));
  const smallSample = analyzeEventArenaTradingFingerprint(input([
    trade('buy-one', 'BUY', 0),
    trade('sell-one', 'SELL', 1, { realizedPnL: 10 }),
    trade('buy-two', 'BUY', 2),
    trade('sell-two', 'SELL', 3, { realizedPnL: 10 }),
  ], { eventEndAtMs: START + 6 * HOUR }));

  assert.equal(shortEvent.tradingFrequency.completedTradesPer24Hours, 12);
  assert.equal(shortEvent.tradingFrequency.unusuallyHigh, true);
  assert.equal(smallSample.tradingFrequency.completedTradesPer24Hours, 8);
  assert.equal(smallSample.tradingFrequency.unusuallyHigh, null);
});

test('drawdown recovery uses only participant-scoped event equity history', () => {
  const snapshots = [
    {
      participantId: 'participant-a',
      accountId: 'event-account-a',
      date: new Date(START + DAY).toISOString(),
      value: 94_000,
    },
    {
      participantId: 'participant-a',
      accountId: 'event-account-a',
      date: new Date(START + 2 * DAY).toISOString(),
      value: 100_000,
    },
    {
      participantId: 'participant-b',
      accountId: 'event-account-a',
      date: new Date(START + 3 * DAY).toISOString(),
      value: 1_000_000,
    },
    {
      participantId: 'participant-a',
      accountId: 'other-account',
      date: new Date(START + 3 * DAY).toISOString(),
      value: 1_000_000,
    },
    {
      participantId: 'participant-a',
      accountId: 'event-account-a',
      eventId: 'event-b',
      date: new Date(START + 3 * DAY).toISOString(),
      value: 1_000_000,
    },
  ];
  const result = analyzeEventArenaTradingFingerprint(input([], { equityHistory: snapshots }));

  assert.equal(result.drawdownRecovery.status, 'recovered');
  assert.equal(result.drawdownRecovery.maxDrawdownPercent, 6);
  assert.equal(result.drawdownRecovery.snapshotCount, 2);
  assert.equal(FINGERPRINT_MEANINGFUL_DRAWDOWN_PERCENT, 5);
});

test('drawdown status distinguishes no significant decline and an unrecovered decline', () => {
  const noDrawdown = analyzeEventArenaTradingFingerprint(input([], {
    equityHistory: [{
      participantId: 'participant-a',
      accountId: 'event-account-a',
      date: new Date(START + HOUR).toISOString(),
      value: 97_000,
    }],
  }));
  const unrecovered = analyzeEventArenaTradingFingerprint(input([], {
    equityHistory: [{
      participantId: 'participant-a',
      accountId: 'event-account-a',
      date: new Date(START + HOUR).toISOString(),
      value: 90_000,
    }],
  }));
  const lightningWithoutEventTag = analyzeEventArenaTradingFingerprint(input([], {
    eventType: 'lightning-round',
    eventEndAtMs: START + DAY,
    equityHistory: [{
      participantId: 'participant-a',
      accountId: 'event-account-a',
      date: new Date(START + HOUR).toISOString(),
      value: 90_000,
    }],
  }));

  assert.equal(noDrawdown.drawdownRecovery.status, 'no-meaningful-drawdown');
  assert.equal(unrecovered.drawdownRecovery.status, 'not-recovered');
  assert.equal(lightningWithoutEventTag.drawdownRecovery.status, 'insufficient-data');
});

test('the same deterministic analysis handles each Event Arena competition type', () => {
  const types: EventArenaTradingFingerprintInput['eventType'][] = [
    'event-arena',
    'green-bull-championship',
    'bear-market-mayhem',
    'penny-stock-mayhem',
    'mountain-championship',
    'one-stock-challenge',
    'lightning-round',
  ];

  for (const eventType of types) {
    const isLightning = eventType === 'lightning-round';
    const eventTrade = trade('buy', 'BUY', 0, {
      ...(isLightning ? { lightningRoundEventId: 'event-a' } : {}),
    });
    const exit = trade('sell', 'SELL', 1, {
      ...(isLightning ? { lightningRoundEventId: 'event-a' } : {}),
      realizedPnL: 12,
    });
    const result = analyzeEventArenaTradingFingerprint(input([eventTrade, exit], {
      eventType,
      eventEndAtMs: isLightning ? START + DAY : END,
    }));

    assert.equal(result.completedTradeCount, 1, `${eventType} should analyze its completed close`);
    assert.equal(result.biggestWinningTrade?.netRealizedPnl, 12);
    if (eventType === 'one-stock-challenge') {
      assert.equal(result.positionDominance.status, 'rule-constrained');
    }
  }
});
