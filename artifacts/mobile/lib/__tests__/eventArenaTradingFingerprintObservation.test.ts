import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeEventArenaTradingFingerprint,
  type EventArenaTradingFingerprintInput,
  type FingerprintTradeRecord,
} from '../eventArenaTradingFingerprint.ts';
import {
  rankTradingFingerprintObservations,
  selectTradingFingerprintObservation,
  TRADING_FINGERPRINT_NEUTRAL_FALLBACK,
  type TradingFingerprintObservation,
} from '../eventArenaTradingFingerprintObservation.ts';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const START = Date.UTC(2026, 2, 1, 9);

function trade(
  id: string,
  action: FingerprintTradeRecord['action'],
  hour: number,
  overrides: Partial<FingerprintTradeRecord> = {},
): FingerprintTradeRecord {
  return {
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
    date: new Date(START + hour * HOUR).toISOString(),
    ...overrides,
  };
}

function analyze(
  transactions: FingerprintTradeRecord[],
  overrides: Partial<EventArenaTradingFingerprintInput> = {},
) {
  return analyzeEventArenaTradingFingerprint({
    participantId: 'participant-a',
    accountId: 'event-account-a',
    eventId: 'event-a',
    eventType: 'event-arena',
    eventStartAtMs: START,
    eventEndAtMs: START + 5 * DAY,
    startingEquity: 100_000,
    transactions,
    ...overrides,
  });
}

function exactTieCandidate(
  id: TradingFingerprintObservation['id'],
): TradingFingerprintObservation {
  return {
    id,
    sentence: id,
    score: 50,
    scoreParts: { magnitude: 0.5, uniqueness: 0.5, reliability: 0.5 },
    evidence: {},
  };
}

test('selects a strong, supported observation and includes its calculated evidence', () => {
  const transactions: FingerprintTradeRecord[] = [];
  const outcomes = [1_000, -150, -150, -150, -150, -150];
  outcomes.forEach((pnl, index) => {
    const symbol = `SYM${index}`;
    transactions.push(
      trade(`buy-${index}`, 'BUY', index * 2, { symbol }),
      trade(`sell-${index}`, 'SELL', index * 2 + 1, { symbol, realizedPnL: pnl }),
    );
  });

  const result = selectTradingFingerprintObservation(analyze(transactions, {
    equityHistory: [
      { participantId: 'participant-a', accountId: 'event-account-a', date: new Date(START + DAY).toISOString(), value: 90_000 },
      { participantId: 'participant-a', accountId: 'event-account-a', date: new Date(START + 2 * DAY).toISOString(), value: 80_000 },
      { participantId: 'participant-a', accountId: 'event-account-a', date: new Date(START + 3 * DAY).toISOString(), value: 100_000 },
    ],
  }), 'event-arena');

  assert.equal(result.selected?.id, 'one-trade-made-a-difference');
  assert.match(result.sentence, /One reported trade supplied 400% of your recorded net profit/);
  assert.match(result.sentence, /\$1,000\.00 realized gain/);
  assert.equal(result.selected?.evidence.netProfitContributionPercent, 400);
  assert.ok(result.candidates.length > 1, 'all supported observations should be evaluated');
  assert.equal(result.candidates[0]?.score, result.selected?.score);
  assert.ok(
    result.candidates.every((candidate, index, all) =>
      index === 0 || (all[index - 1]?.score ?? 0) >= candidate.score),
  );
});

test('returns the neutral fallback instead of inventing a pattern from too little data', () => {
  const noTrades = analyze([]);
  const oneLightningEnrollmentBuy = analyze([
    trade('enrollment-buy', 'BUY', 0, { lightningRoundEventId: 'event-a' }),
  ], {
    eventType: 'lightning-round',
    eventEndAtMs: START + DAY,
  });

  for (const [fingerprint, eventType] of [
    [noTrades, 'event-arena'],
    [oneLightningEnrollmentBuy, 'lightning-round'],
  ] as const) {
    const result = selectTradingFingerprintObservation(fingerprint, eventType);
    assert.equal(result.selected, null);
    assert.deepEqual(result.candidates, []);
    assert.equal(result.sentence, TRADING_FINGERPRINT_NEUTRAL_FALLBACK);
  }
});

test('uses a fixed editorial priority when applicable observations have equal scores', () => {
  const ranked = rankTradingFingerprintObservations([
    exactTieCandidate('positive-trade-consistency'),
    exactTieCandidate('patient-profitable-trades'),
    exactTieCandidate('one-trade-made-a-difference'),
    exactTieCandidate('recovered-drawdown'),
  ]);

  assert.deepEqual(ranked.map((item) => item.id), [
    'one-trade-made-a-difference',
    'recovered-drawdown',
    'patient-profitable-trades',
    'positive-trade-consistency',
  ]);
});

test('evaluates holding-time behavior against Lightning Round duration, not the declared window', () => {
  const lightningTrade = (
    id: string,
    action: FingerprintTradeRecord['action'],
    hour: number,
    realizedPnL?: number,
  ) => trade(id, action, hour, {
    lightningRoundEventId: 'event-a',
    ...(realizedPnL === undefined ? {} : { realizedPnL }),
  });
  const transactions = [
    lightningTrade('buy-win-1', 'BUY', 0),
    lightningTrade('sell-win-1', 'SELL', 10, 10),
    lightningTrade('buy-loss-1', 'BUY', 0.5),
    lightningTrade('sell-loss-1', 'SELL', 4.5, -5),
    lightningTrade('buy-win-2', 'BUY', 11),
    lightningTrade('sell-win-2', 'SELL', 21, 10),
    lightningTrade('buy-loss-2', 'BUY', 11.5),
    lightningTrade('sell-loss-2', 'SELL', 15.5, -5),
  ];
  const lightning = analyze(transactions, {
    eventType: 'lightning-round',
    eventEndAtMs: START + 48 * HOUR,
  });
  const regular = analyze(transactions.map((item) => ({
    ...item,
    lightningRoundEventId: undefined,
  })));

  const lightningSelection = selectTradingFingerprintObservation(lightning, 'lightning-round');
  const patience = lightningSelection.candidates.find(
    (candidate) => candidate.id === 'patient-profitable-trades',
  );
  const regularSelection = selectTradingFingerprintObservation(regular, 'event-arena');

  assert.equal(lightning.tradingFrequency.eventDurationHours, 24);
  assert.ok(patience, 'six-hour holding-time difference qualifies for a 24-hour event');
  assert.equal(patience.evidence.eventDurationHours, 24);
  assert.equal(patience.evidence.differenceHours, 5);
  assert.equal(
    regularSelection.candidates.some((candidate) => candidate.id === 'patient-profitable-trades'),
    false,
    'the same difference is not meaningful against a five-day event window',
  );
});

test('evaluates event-normalized trade frequency and excludes enrollment buys', () => {
  const lightningTrade = (
    id: string,
    action: FingerprintTradeRecord['action'],
    hour: number,
    realizedPnL?: number,
  ) => trade(id, action, hour, {
    lightningRoundEventId: 'event-a',
    ...(realizedPnL === undefined ? {} : { realizedPnL }),
  });
  const fingerprint = analyze([
    lightningTrade('enrollment-buy', 'BUY', 0),
    lightningTrade('close-1', 'SELL', 1, 10),
    lightningTrade('close-2', 'SELL', 3, 10),
    lightningTrade('close-3', 'SELL', 5, 10),
  ], {
    eventType: 'lightning-round',
    eventEndAtMs: START + 6 * HOUR,
  });

  const result = selectTradingFingerprintObservation(fingerprint, 'lightning-round');
  const pace = result.candidates.find((candidate) => candidate.id === 'event-paced-trading');

  assert.equal(fingerprint.completedTradeCount, 3);
  assert.equal(fingerprint.tradingFrequency.completedTradesPer24Hours, 12);
  assert.ok(pace);
  assert.equal(pace.evidence.completedTradeCount, 3);
  assert.equal(pace.evidence.eventDurationHours, 6);
  assert.match(pace.sentence, /3 trades over 6 hours \(12 per 24 hours\)/);
});

test('does not frame a One-Stock Challenge rule as a participant behavior', () => {
  const fingerprint = analyze([
    trade('buy-1', 'BUY', 0),
    trade('sell-1', 'SELL', 1, { realizedPnL: 20 }),
    trade('buy-2', 'BUY', 2),
    trade('sell-2', 'SELL', 3, { realizedPnL: 15 }),
    trade('buy-3', 'BUY', 4),
    trade('sell-3', 'SELL', 5, { realizedPnL: 10 }),
  ], { eventType: 'one-stock-challenge' });

  const result = selectTradingFingerprintObservation(fingerprint, 'one-stock-challenge');

  assert.equal(fingerprint.positionDominance.status, 'rule-constrained');
  assert.equal(
    result.candidates.some((candidate) => candidate.id === 'symbol-result-concentration'),
    false,
  );
  assert.ok(result.selected, 'other supported observations may still be selected');
});
