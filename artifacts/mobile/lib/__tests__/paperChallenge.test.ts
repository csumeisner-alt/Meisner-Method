import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPaperChallengeSummary,
  capturePaperChallengeBaseline,
  ensurePaperChallengeAccount,
  getPaperChallengeMilestones,
  getPaperChallengeReminders,
  getPaperChallengeWindow,
  sortPaperChallengeHistory,
  type PaperChallengeSummary,
  type PaperChallengeAccountState,
  finalizePaperChallengeStore,
  getMissingPaperChallengeQuoteSymbols,
  PAPER_CHALLENGE_STORAGE_KEY,
  type PaperChallengeStore,
  withdrawUpcomingPaperChallenge,
  persistPaperChallengeFinalization,
  updatePaperChallengeStore,
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

test('event milestones reward first participation, positive finishes, and strict personal bests', () => {
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
  const firstEvent = makeSummary('first', 100, 1.5);
  const previousEvent = makeSummary('previous', 200, 1.5);
  const personalBest = makeSummary('best', 300, 2);
  const tiedReturn = makeSummary('tie', 400, 2);
  const improvedLoss = makeSummary('less-negative', 500, -1);
  const laterEvent = makeSummary('later', 600, 5);

  assert.deepEqual(getPaperChallengeMilestones(firstEvent, [firstEvent, previousEvent]), [
    'first-event',
    'positive-finish',
  ]);
  assert.deepEqual(getPaperChallengeMilestones(personalBest, [laterEvent, firstEvent, previousEvent]), [
    'positive-finish',
    'personal-best',
  ]);
  assert.deepEqual(getPaperChallengeMilestones(tiedReturn, [firstEvent, previousEvent, personalBest]), ['positive-finish']);
  assert.deepEqual(getPaperChallengeMilestones(improvedLoss, [previousEvent]), []);
});

test('Event Arena wires its label, history sorting, midweek refresh, sharing, and notification toggle', async () => {
  const testDirectory = dirname(fileURLToPath(import.meta.url));
  const componentSource = await readFile(resolve(testDirectory, '../../components/PaperChallengeHistory.tsx'), 'utf8');
  const cardSource = await readFile(resolve(testDirectory, '../../components/PaperEventShareCard.tsx'), 'utf8');
  const paperScreenSource = await readFile(resolve(testDirectory, '../../app/paper.tsx'), 'utf8');
  const badgeSource = await readFile(resolve(testDirectory, '../../components/PaperChallengeMilestoneBadges.tsx'), 'utf8');
  assert.match(componentSource, /accessibilityLabel="Event Arena"/);
  assert.match(componentSource, /sortPaperChallengeHistory\(store\.history, sortMode\)/);
  assert.match(componentSource, /refreshEventPosition/);
  assert.match(componentSource, /Share\.share/);
  assert.match(componentSource, /setEventNotifications\(value\)/);
  assert.match(componentSource, /Sharing\.shareAsync\(uri/);
  assert.match(componentSource, /share-paper-event-image-/);
  assert.match(cardSource, /MEISNER METHOD/);
  assert.match(cardSource, /EVENT RETURN/);
  assert.match(componentSource, /getPaperChallengeMilestones\(event, store\.history\)/);
  assert.match(componentSource, /PaperChallengeMilestoneBadges milestones=\{getPaperChallengeMilestones\(event, store\.history\)\} compact/);
  assert.match(paperScreenSource, /milestones=\{getPaperChallengeMilestones\(completedEventSummary, paperChallenge\.history\)\}/);
  assert.match(cardSource, /PaperChallengeMilestoneBadges milestones=\{milestones\}/);
  assert.match(badgeSource, /paper-event-milestone-badges/);
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

test('event summary retries after storage failure without losing enrollment or duplicating history', async () => {
  const enrollment = {
    eventId: '2026-11-16',
    eventStartAtMs: Date.parse('2026-11-16T14:30:00.000Z'),
    eventEndAtMs: Date.parse('2026-11-20T21:00:00.000Z'),
    joinedAtMs: Date.parse('2026-11-16T14:30:00.000Z'),
    accountId: 'paper-event:2026-11-16',
    accountName: 'Event Portfolio',
    startEquity: 100_000,
  };
  const summary = buildPaperChallengeSummary(
    enrollment,
    101_000,
    [],
    enrollment.eventEndAtMs,
  );
  const enrollmentStore: PaperChallengeStore = { enrollment, history: [] };
  let storedValue = JSON.stringify(enrollmentStore);
  let failNextWrite = true;
  const storage = {
    getItem: async (key: string) => {
      assert.equal(key, PAPER_CHALLENGE_STORAGE_KEY);
      return storedValue;
    },
    setItem: async (key: string, value: string) => {
      assert.equal(key, PAPER_CHALLENGE_STORAGE_KEY);
      if (failNextWrite) {
        failNextWrite = false;
        throw new Error('Simulated AsyncStorage write failure');
      }
      storedValue = value;
    },
  };

  await assert.rejects(
    persistPaperChallengeFinalization(summary, enrollment.eventEndAtMs, storage),
    /Simulated AsyncStorage write failure/,
  );
  const afterFailedWrite = JSON.parse(storedValue) as PaperChallengeStore;
  assert.deepEqual(afterFailedWrite.enrollment, enrollment);
  assert.deepEqual(afterFailedWrite.history, []);

  const retriedStore = await persistPaperChallengeFinalization(
    summary,
    enrollment.eventEndAtMs,
    storage,
  );
  const afterRetry = JSON.parse(storedValue) as PaperChallengeStore;
  assert.deepEqual(retriedStore, afterRetry);
  assert.equal(afterRetry.enrollment, null);
  assert.deepEqual(afterRetry.history, [summary]);

  const repeatedRetry = await persistPaperChallengeFinalization(
    summary,
    enrollment.eventEndAtMs,
    storage,
  );
  assert.deepEqual(repeatedRetry, afterRetry);
  assert.deepEqual(repeatedRetry.history, [summary]);
});

test('concurrent enrollment and completion preserve unique newest-first event history', async () => {
  const firstEnrollment = {
    eventId: '2026-11-16',
    eventStartAtMs: Date.parse('2026-11-16T14:30:00.000Z'),
    eventEndAtMs: Date.parse('2026-11-20T21:00:00.000Z'),
    joinedAtMs: Date.parse('2026-11-16T14:30:00.000Z'),
    accountId: 'paper-event:2026-11-16',
    accountName: 'Event Portfolio',
    startEquity: 100_000,
  };
  const nextEnrollment = {
    eventId: '2026-11-30',
    eventStartAtMs: Date.parse('2026-11-30T14:30:00.000Z'),
    eventEndAtMs: Date.parse('2026-12-04T21:00:00.000Z'),
    joinedAtMs: Date.parse('2026-11-30T14:30:00.000Z'),
    accountId: 'paper-event:2026-11-30',
    accountName: 'Event Portfolio',
    startEquity: null,
  };
  const olderSummary = buildPaperChallengeSummary(firstEnrollment, 101_000, [], firstEnrollment.eventEndAtMs);
  let storedValue = JSON.stringify({ enrollment: firstEnrollment, history: [] } satisfies PaperChallengeStore);
  const storage = {
    getItem: async (key: string) => {
      assert.equal(key, PAPER_CHALLENGE_STORAGE_KEY);
      return storedValue;
    },
    setItem: async (key: string, value: string) => {
      assert.equal(key, PAPER_CHALLENGE_STORAGE_KEY);
      // Yield between writes to exercise overlapping screen actions.
      await new Promise((resolve) => setTimeout(resolve, 1));
      storedValue = value;
    },
  };

  await Promise.all([
    persistPaperChallengeFinalization(olderSummary, firstEnrollment.eventEndAtMs, storage),
    updatePaperChallengeStore((current) => current.enrollment
      ? current
      : { ...current, enrollment: nextEnrollment }, storage),
  ]);

  const reopened = JSON.parse(storedValue) as PaperChallengeStore;
  assert.deepEqual(reopened.history.map((event) => event.eventId), ['2026-11-16']);
  assert.equal(reopened.enrollment?.eventId, '2026-11-30');

  // A stale withdrawal attempt must not erase a completed summary.
  await updatePaperChallengeStore(
    (current) => withdrawUpcomingPaperChallenge(current, firstEnrollment.eventId, firstEnrollment.eventStartAtMs - 1),
    storage,
  );
  const afterWithdrawal = JSON.parse(storedValue) as PaperChallengeStore;
  assert.deepEqual(afterWithdrawal.history.map((event) => event.eventId), ['2026-11-16']);
  assert.equal(afterWithdrawal.history.filter((event) => event.eventId === '2026-11-16').length, 1);
  assert.deepEqual(sortPaperChallengeHistory(afterWithdrawal.history, 'date'), [olderSummary]);
});

test('a later event keeps earlier summaries and remains unique after reload', () => {
  const earlierEnrollment = {
    eventId: '2026-11-16',
    eventStartAtMs: Date.parse('2026-11-16T14:30:00.000Z'),
    eventEndAtMs: Date.parse('2026-11-20T21:00:00.000Z'),
    joinedAtMs: Date.parse('2026-11-16T14:30:00.000Z'),
    accountId: 'paper-event:2026-11-16',
    accountName: 'Event Portfolio',
    startEquity: 100_000,
  };
  const laterEnrollment = {
    eventId: '2026-11-30',
    eventStartAtMs: Date.parse('2026-11-30T14:30:00.000Z'),
    eventEndAtMs: Date.parse('2026-12-04T21:00:00.000Z'),
    joinedAtMs: Date.parse('2026-11-30T14:30:00.000Z'),
    accountId: 'paper-event:2026-11-30',
    accountName: 'Event Portfolio',
    startEquity: 100_000,
  };
  const earlierSummary = buildPaperChallengeSummary(
    earlierEnrollment,
    101_000,
    [],
    earlierEnrollment.eventEndAtMs,
  );
  const laterSummary = buildPaperChallengeSummary(
    laterEnrollment,
    99_000,
    [],
    laterEnrollment.eventEndAtMs,
  );
  const savedData = new Map<string, string>([
    [PAPER_CHALLENGE_STORAGE_KEY, JSON.stringify({
      enrollment: laterEnrollment,
      history: [earlierSummary],
    } satisfies PaperChallengeStore)],
  ]);
  const reloadStore = () => JSON.parse(savedData.get(PAPER_CHALLENGE_STORAGE_KEY)!) as PaperChallengeStore;

  const completedLaterEvent = finalizePaperChallengeStore(
    reloadStore(),
    laterSummary,
    laterEnrollment.eventEndAtMs,
  );
  savedData.set(PAPER_CHALLENGE_STORAGE_KEY, JSON.stringify(completedLaterEvent));

  const reopenedStore = reloadStore();
  assert.equal(reopenedStore.enrollment, null);
  assert.deepEqual(reopenedStore.history.map((summary) => summary.eventId), ['2026-11-30', '2026-11-16']);
  assert.deepEqual(
    sortPaperChallengeHistory(reopenedStore.history, 'date').map((summary) => summary.eventId),
    ['2026-11-30', '2026-11-16'],
  );
  for (const eventId of ['2026-11-30', '2026-11-16']) {
    assert.equal(reopenedStore.history.filter((summary) => summary.eventId === eventId).length, 1);
  }

  const retriedCompletion = finalizePaperChallengeStore({
    enrollment: laterEnrollment,
    history: reopenedStore.history,
  }, { ...laterSummary, netProfit: 999_999 }, laterEnrollment.eventEndAtMs);
  savedData.set(PAPER_CHALLENGE_STORAGE_KEY, JSON.stringify(retriedCompletion));
  const afterRetryReload = reloadStore();
  assert.deepEqual(afterRetryReload.history, [laterSummary, earlierSummary]);
});

test('each event gets a fresh account without inheriting earlier or orphaned event data', async () => {
  const firstEvent = {
    eventId: '2026-11-16',
    eventStartAtMs: Date.parse('2026-11-16T14:30:00.000Z'),
    eventEndAtMs: Date.parse('2026-11-20T21:00:00.000Z'),
    joinedAtMs: Date.parse('2026-11-16T14:30:00.000Z'),
    accountId: 'paper-event:2026-11-16',
    accountName: 'Event Portfolio',
    startEquity: 100_000,
  };
  const secondEvent = {
    ...firstEvent,
    eventId: '2026-11-30',
    eventStartAtMs: Date.parse('2026-11-30T14:30:00.000Z'),
    eventEndAtMs: Date.parse('2026-12-04T21:00:00.000Z'),
    joinedAtMs: Date.parse('2026-11-30T14:30:00.000Z'),
    accountId: 'paper-event:2026-11-30',
    startEquity: null,
  };
  assert.notEqual(firstEvent.accountId, secondEvent.accountId);

  const regularAccounts = [
    { id: 'paper-main', name: 'Main', cash: 88_000, createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'paper-strategy-2', name: 'Strategy 2', cash: 97_000, createdAt: '2026-01-02T00:00:00.000Z' },
    { id: 'paper-strategy-3', name: 'Strategy 3', cash: 105_000, createdAt: '2026-01-03T00:00:00.000Z' },
  ];
  const position = (id: string, accountId: string, symbol: string) => ({
    id, accountId, symbol, companyName: symbol, shares: 1, avgCost: 100,
    openedAt: '2026-11-16T15:00:00.000Z', dividendYield: 0, sector: '',
  });
  const transaction = (id: string, accountId: string, symbol: string) => ({
    id, accountId, symbol, companyName: symbol, action: 'BUY' as const,
    shares: 1, price: 100, total: 100, date: '2026-11-16T15:00:00.000Z',
  });
  const order = (id: string, accountId: string, symbol: string) => ({
    id, accountId, symbol, companyName: symbol, orderType: 'market' as const,
    side: 'buy' as const, shares: 1, status: 'pending' as const, placedAt: '2026-11-16T15:00:00.000Z',
  });
  const lot = (id: string, accountId: string, symbol: string) => ({
    id, accountId, symbol, shares: 1, cost: 100, purchasedAt: '2026-11-16T15:00:00.000Z',
  });
  const state: PaperChallengeAccountState = {
    accounts: [
      ...regularAccounts,
      { id: firstEvent.accountId, name: 'Event Portfolio', cash: 91_500, createdAt: '2026-11-16T14:30:00.000Z' },
    ],
    positions: [
      position('main-position', 'paper-main', 'MSFT'),
      position('first-event-position', firstEvent.accountId, 'AAPL'),
      position('orphaned-second-event-position', secondEvent.accountId, 'NVDA'),
    ],
    transactions: [
      transaction('main-transaction', 'paper-main', 'MSFT'),
      transaction('strategy-2-transaction', 'paper-strategy-2', 'AMZN'),
      transaction('strategy-3-transaction', 'paper-strategy-3', 'GOOG'),
      transaction('first-event-transaction', firstEvent.accountId, 'AAPL'),
      transaction('orphaned-second-event-transaction', secondEvent.accountId, 'NVDA'),
    ],
    orders: [
      order('main-order', 'paper-main', 'MSFT'),
      order('strategy-2-order', 'paper-strategy-2', 'AMZN'),
      order('strategy-3-order', 'paper-strategy-3', 'GOOG'),
      order('first-event-order', firstEvent.accountId, 'AAPL'),
      order('orphaned-second-event-order', secondEvent.accountId, 'NVDA'),
    ],
    lots: [
      lot('main-lot', 'paper-main', 'MSFT'),
      lot('strategy-2-lot', 'paper-strategy-2', 'AMZN'),
      lot('strategy-3-lot', 'paper-strategy-3', 'GOOG'),
      lot('first-event-lot', firstEvent.accountId, 'AAPL'),
      lot('orphaned-second-event-lot', secondEvent.accountId, 'NVDA'),
    ],
  };

  const initialized = ensurePaperChallengeAccount(secondEvent, state);
  assert.equal(initialized.accounts.length, 5);
  assert.deepEqual(initialized.accounts.slice(0, 3), regularAccounts);
  assert.deepEqual(initialized.accounts[3], state.accounts[3]);
  assert.deepEqual(initialized.accounts[4], {
    id: secondEvent.accountId,
    name: 'Event Portfolio',
    cash: 100_000,
    createdAt: new Date(secondEvent.joinedAtMs).toISOString(),
  });
  const regularIds = new Set(regularAccounts.map((account) => account.id));
  assert.deepEqual(
    initialized.accounts.filter((item) => regularIds.has(item.id)),
    state.accounts.filter((item) => regularIds.has(item.id)),
  );
  const assertRegularRecordsUnchanged = <T extends { accountId: string }>(after: T[], before: T[], label: string) => {
    assert.deepEqual(
      after.filter((item) => regularIds.has(item.accountId)),
      before.filter((item) => regularIds.has(item.accountId)),
      `regular account ${label} should remain unchanged`,
    );
  };
  assertRegularRecordsUnchanged(initialized.positions, state.positions, 'positions');
  assertRegularRecordsUnchanged(initialized.transactions, state.transactions, 'transactions');
  assertRegularRecordsUnchanged(initialized.orders, state.orders, 'orders');
  assertRegularRecordsUnchanged(initialized.lots, state.lots, 'lots');
  for (const records of [
    initialized.positions,
    initialized.transactions,
    initialized.orders,
    initialized.lots,
  ]) {
    assert.ok(records.every((record) => record.accountId !== secondEvent.accountId));
    assert.ok(records.some((record) => record.accountId === firstEvent.accountId));
    assert.ok(records.some((record) => record.accountId === 'paper-main'));
  }

  const reopening = ensurePaperChallengeAccount(secondEvent, {
    ...initialized,
    accounts: initialized.accounts.map((account) => account.id === secondEvent.accountId
      ? { ...account, cash: 92_000 }
      : account),
    positions: [...initialized.positions, position('second-event-position', secondEvent.accountId, 'TSLA')],
  });
  assert.equal(reopening.accounts.find((account) => account.id === secondEvent.accountId)?.cash, 92_000);
  assert.ok(reopening.positions.some((position) => position.accountId === secondEvent.accountId));

  const testDirectory = dirname(fileURLToPath(import.meta.url));
  const screenSource = await readFile(resolve(testDirectory, '../../app/paper.tsx'), 'utf8');
  assert.match(screenSource, /ensurePaperChallengeAccount\(enrollment/);
  assert.match(screenSource, /eventAccountState\.positions/);
});

test('expired enrollment remains saved until its event summary is finalized', async () => {
  const testDirectory = dirname(fileURLToPath(import.meta.url));
  const source = await readFile(resolve(testDirectory, '../../app/paper.tsx'), 'utf8');
  assert.doesNotMatch(source, /savePaperChallenge\(\{ enrollment: null, history: latestStore\.history \}\)/);
  assert.match(source, /const finalizedStore = await persistPaperChallengeFinalization\(/);
  assert.match(source, /paperChallengeRef\.current = finalizedStore;\s*setPaperChallenge\(finalizedStore\)/);
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
