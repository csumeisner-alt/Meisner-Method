import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPaperChallengeSummary,
  capturePaperChallengeBaseline,
  getPaperChallengeReminders,
  getPaperChallengeWindow,
  sortPaperChallengeHistory,
  type PaperChallengeSummary,
  finalizePaperChallengeStore,
  getMissingPaperChallengeQuoteSymbols,
  PAPER_CHALLENGE_STORAGE_KEY,
  type PaperChallengeStore,
  withdrawUpcomingPaperChallenge,
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
  assert.ok(offWeek.startAtMs > Date.parse('2026-11-25T17:00:00.000Z'));
  assert.ok(offWeek.endAtMs > offWeek.startAtMs);

  const pendingEnrollment = {
    eventId: offWeek.id,
    eventStartAtMs: offWeek.startAtMs,
    eventEndAtMs: offWeek.endAtMs,
    joinedAtMs: offWeek.startAtMs,
    accountId: 'strategy-2',
    accountName: 'Strategy 2',
    startEquity: null,
  };
  const startedEnrollment = capturePaperChallengeBaseline(pendingEnrollment, 102_500);
  assert.equal(startedEnrollment.startEquity, 102_500);
  assert.equal(startedEnrollment.joinedAtMs, offWeek.startAtMs);
  assert.equal(startedEnrollment.accountId, 'strategy-2');
  assert.equal(capturePaperChallengeBaseline(startedEnrollment, 120_000), startedEnrollment);
});

test('paper event market hours follow Eastern daylight-saving time', () => {
  const event = getPaperChallengeWindow(Date.parse('2027-03-24T16:00:00.000Z'));
  assert.equal(new Date(event.startAtMs).toISOString(), '2027-03-22T13:30:00.000Z');
  assert.equal(new Date(event.endAtMs).toISOString(), '2027-03-26T20:00:00.000Z');
});

test('event reminders stay limited to three per week and skip times that passed', () => {
  const now = Date.parse('2026-11-12T18:00:00.000Z');
  const upcoming = getPaperChallengeReminders(now);
  assert.equal(upcoming.length, 6);
  assert.deepEqual([...new Set(upcoming.map((reminder) => reminder.eventId))], ['2026-11-16', '2026-11-30']);
  assert.equal(upcoming.filter((reminder) => reminder.eventId === '2026-11-16').length, 3);

  const midweekNow = Date.parse('2026-11-18T19:00:00.000Z');
  const midweek = getPaperChallengeReminders(midweekNow);
  assert.equal(midweek.filter((reminder) => reminder.eventId === '2026-11-16').length, 1);
  assert.equal(midweek.filter((reminder) => reminder.eventId === '2026-11-30').length, 3);
  assert.ok(midweek.every((reminder) => reminder.scheduledAtMs > midweekNow));
});

test('event history sorts newest by date or strongest by return', () => {
  const makeSummary = (eventId: string, eventStartAtMs: number, returnPercent: number): PaperChallengeSummary => ({
    eventId,
    eventStartAtMs,
    eventEndAtMs: eventStartAtMs + 5,
    joinedAtMs: eventStartAtMs,
    accountId: `paper-event:${eventId}`,
    accountName: 'Event Portfolio',
    startEquity: 100_000,
    endEquity: 100_000 * (1 + returnPercent / 100),
    netProfit: returnPercent * 1_000,
    returnPercent,
    tradeCount: 0,
    buyCount: 0,
    sellCount: 0,
    symbolsTraded: [],
    realizedPnL: 0,
    completedAtMs: eventStartAtMs + 6,
  });
  const history = [
    makeSummary('older-best', 100, 4),
    makeSummary('newer', 200, 1),
    makeSummary('older-low', 50, -2),
  ];
  assert.deepEqual(sortPaperChallengeHistory(history, 'date').map((event) => event.eventId), ['newer', 'older-best', 'older-low']);
  assert.deepEqual(sortPaperChallengeHistory(history, 'top').map((event) => event.eventId), ['older-best', 'newer', 'older-low']);
});

test('Event Arena wires its label, history sorting, midweek refresh, sharing, and notification toggle', async () => {
  const testDirectory = dirname(fileURLToPath(import.meta.url));
  const componentSource = await readFile(resolve(testDirectory, '../../components/PaperChallengeHistory.tsx'), 'utf8');
  const cardSource = await readFile(resolve(testDirectory, '../../components/PaperEventShareCard.tsx'), 'utf8');
  assert.match(componentSource, /accessibilityLabel="Event Arena"/);
  assert.match(componentSource, /sortPaperChallengeHistory\(store\.history, sortMode\)/);
  assert.match(componentSource, /refreshEventPosition/);
  assert.match(componentSource, /Share\.share/);
  assert.match(componentSource, /setEventNotifications\(value\)/);
  assert.match(componentSource, /Sharing\.shareAsync\(uri/);
  assert.match(componentSource, /share-paper-event-image-/);
  assert.match(cardSource, /MEISNER METHOD/);
  assert.match(cardSource, /EVENT RETURN/);
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

test('event finalization waits for every held position to have a fresh quote', () => {
  const positions = [
    { symbol: 'AAPL', shares: 2 },
    { symbol: 'MSFT', shares: 1 },
    { symbol: 'MSFT', shares: 3 },
  ];
  assert.deepEqual(getMissingPaperChallengeQuoteSymbols(positions, {
    AAPL: { price: 190 },
    MSFT: { price: 0 },
  }), ['MSFT']);
  assert.deepEqual(getMissingPaperChallengeQuoteSymbols(positions, {
    AAPL: { price: 190 },
    MSFT: { price: 420 },
  }), []);
  assert.deepEqual(getMissingPaperChallengeQuoteSymbols([], {}), []);
});

test('event enrollment and one summary survive reloads without changing other paper accounts', () => {
  const eventId = '2026-11-16';
  const enrollment = {
    eventId,
    eventStartAtMs: Date.parse('2026-11-16T14:30:00.000Z'),
    eventEndAtMs: Date.parse('2026-11-20T21:00:00.000Z'),
    joinedAtMs: Date.parse('2026-11-16T14:30:00.000Z'),
    accountId: 'paper-event:2026-11-16',
    accountName: 'Event Portfolio',
    startEquity: 100_000,
  };
  const summary = buildPaperChallengeSummary(enrollment, 101_000, [], Date.parse('2026-11-20T21:00:00.000Z'));
  const challengeStore: PaperChallengeStore = { enrollment, history: [] };
  const otherPaperData = {
    accounts: [{ id: 'paper-main', name: 'Main', cash: 90_000 }],
    transactions: [{ accountId: 'paper-main', symbol: 'MSFT', action: 'BUY', date: '2026-11-17T15:00:00.000Z' }],
  };
  const savedData = new Map<string, string>([
    [PAPER_CHALLENGE_STORAGE_KEY, JSON.stringify(challengeStore)],
    ['@stocksense/paper_v2', JSON.stringify(otherPaperData)],
  ]);

  const reloadChallengeStore = () => JSON.parse(savedData.get(PAPER_CHALLENGE_STORAGE_KEY)!) as PaperChallengeStore;
  const afterInitialReload = reloadChallengeStore();
  assert.deepEqual(afterInitialReload.enrollment, enrollment);
  const beforeEventEnd = finalizePaperChallengeStore(
    afterInitialReload,
    summary,
    enrollment.eventEndAtMs - 1,
  );
  assert.deepEqual(beforeEventEnd.enrollment, enrollment);
  assert.deepEqual(beforeEventEnd.history, []);

  savedData.set(
    PAPER_CHALLENGE_STORAGE_KEY,
    JSON.stringify(finalizePaperChallengeStore(afterInitialReload, summary, enrollment.eventEndAtMs)),
  );
  const afterFinalizationReload = reloadChallengeStore();
  assert.equal(afterFinalizationReload.enrollment, null);
  assert.deepEqual(afterFinalizationReload.history, [summary]);

  savedData.set(
    PAPER_CHALLENGE_STORAGE_KEY,
    JSON.stringify(finalizePaperChallengeStore(afterFinalizationReload, summary, enrollment.eventEndAtMs)),
  );
  const afterReopeningPaperTrading = reloadChallengeStore();
  assert.equal(afterReopeningPaperTrading.history.length, 1);
  assert.deepEqual(afterReopeningPaperTrading.history[0], summary);
  assert.deepEqual(JSON.parse(savedData.get('@stocksense/paper_v2')!), otherPaperData);

  const retryWithExistingHistory = finalizePaperChallengeStore({
    enrollment,
    history: [summary, ...afterReopeningPaperTrading.history],
  }, { ...summary, netProfit: 999_999 }, enrollment.eventEndAtMs);
  assert.equal(retryWithExistingHistory.history.length, 1);
  assert.deepEqual(retryWithExistingHistory.history[0], summary);
});

test('expired enrollment remains saved until its event summary is finalized', async () => {
  const testDirectory = dirname(fileURLToPath(import.meta.url));
  const source = await readFile(resolve(testDirectory, '../../app/paper.tsx'), 'utf8');
  assert.doesNotMatch(source, /savePaperChallenge\(\{ enrollment: null, history: latestStore\.history \}\)/);
  assert.match(source, /paper-event-results-pending/);
  assert.match(source, /retry-paper-event-results/);
});

test('upcoming signup withdrawal removes only enrollment and is locked at event start', () => {
  const eventStartAtMs = Date.parse('2026-11-30T14:30:00.000Z');
  const enrollment = {
    eventId: '2026-11-30',
    eventStartAtMs,
    eventEndAtMs: Date.parse('2026-12-04T21:00:00.000Z'),
    joinedAtMs: eventStartAtMs,
    accountId: 'paper-event:2026-11-30',
    accountName: 'Event Portfolio',
    startEquity: null,
  };
  const history = [{ eventId: 'past-event' }] as unknown as PaperChallengeSummary[];
  const store: PaperChallengeStore = { enrollment, history };

  const withdrawn = withdrawUpcomingPaperChallenge(store, enrollment.eventId, eventStartAtMs - 1);
  assert.equal(withdrawn.enrollment, null);
  assert.strictEqual(withdrawn.history, history);

  assert.strictEqual(withdrawUpcomingPaperChallenge(store, enrollment.eventId, eventStartAtMs), store);
  assert.strictEqual(withdrawUpcomingPaperChallenge(store, 'another-event', eventStartAtMs - 1), store);
  assert.strictEqual(withdrawUpcomingPaperChallenge({
    enrollment: { ...enrollment, startEquity: 100_000 },
    history,
  }, enrollment.eventId, eventStartAtMs - 1).enrollment?.startEquity, 100_000);
});
