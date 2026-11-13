import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPaperChallengeSummary,
  getPaperChallengeWindow,
} from '../paperChallenge.ts';

test('paper event runs Monday open through Friday close, then skips a week', () => {
  const active = getPaperChallengeWindow(Date.parse('2026-11-18T17:00:00.000Z'));
  assert.equal(active.id, '2026-11-16');
  assert.equal(active.phase, 'active');
  assert.equal(new Date(active.startAtMs).toISOString(), '2026-11-16T14:30:00.000Z');
  assert.equal(new Date(active.endAtMs).toISOString(), '2026-11-20T21:00:00.000Z');

  const offWeek = getPaperChallengeWindow(Date.parse('2026-11-25T17:00:00.000Z'));
  assert.equal(offWeek.id, '2026-11-30');
  assert.equal(offWeek.phase, 'upcoming');
});

test('paper event market hours follow Eastern daylight-saving time', () => {
  const event = getPaperChallengeWindow(Date.parse('2027-03-24T16:00:00.000Z'));
  assert.equal(new Date(event.startAtMs).toISOString(), '2027-03-22T13:30:00.000Z');
  assert.equal(new Date(event.endAtMs).toISOString(), '2027-03-26T20:00:00.000Z');
});

test('paper event summary uses account equity change and event-only trades', () => {
  const summary = buildPaperChallengeSummary({
    eventId: '2026-11-16',
    eventStartAtMs: Date.parse('2026-11-16T14:30:00.000Z'),
    eventEndAtMs: Date.parse('2026-11-20T21:00:00.000Z'),
    joinedAtMs: Date.parse('2026-11-16T14:30:00.000Z'),
    accountId: 'event-account',
    accountName: 'Event',
    startEquity: 100_000,
  }, 101_250, [
    { accountId: 'event-account', symbol: 'AAPL', action: 'SELL', date: '2026-11-17T15:00:00.000Z', realizedPnL: 300, fee: 5 },
    { accountId: 'other-account', symbol: 'GOOG', action: 'SELL', date: '2026-11-17T15:00:00.000Z', realizedPnL: 9_000 },
    { accountId: 'event-account', symbol: 'MSFT', action: 'BUY', date: '2026-11-21T15:00:00.000Z' },
  ], Date.parse('2026-11-21T12:00:00.000Z'));

  assert.equal(summary.netProfit, 1_250);
  assert.equal(summary.returnPercent, 1.25);
  assert.equal(summary.tradeCount, 1);
  assert.equal(summary.sellCount, 1);
  assert.deepEqual(summary.symbolsTraded, ['AAPL']);
  assert.equal(summary.realizedPnL, 295);
});
