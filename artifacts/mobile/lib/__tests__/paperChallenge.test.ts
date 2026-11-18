import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPaperChallengeSummary,
  getPaperChallengeArchiveChartWidth,
  getLightningRoundSeasonSummary,
  capturePaperChallengeBaseline,
  ensurePaperChallengeAccount,
  getPaperChallengeMilestones,
  getPaperChallengePersonalBestProgress,
  getPaperChallengeArtworkId,
  getPaperChallengeConfiguration,
  isMountainChampionshipTransferLocked,
  isPaperChallengeConfiguration,
  GREEN_BULL_STARTING_BALANCE,
  NEON_NIGHTCLUB_STARTING_BALANCE,
  PAPER_CHALLENGE_ARTWORK_IDS,
  getPaperChallengeReminders,
  getPaperEventLiveNoticeDismissalKey,
  getPaperChallengeWindow,
  getLightningRoundWindow,
  findPreparedLightningRoundWindow,
  findPreparedLightningRoundInvitationWindow,
  getLatestLightningRoundAlias,
  hasRegularPaperChallengeOverlap,
  LIGHTNING_ROUND_STARTING_BALANCE,
  isLightningRoundEventId,
  isPaperChallengeAccountId,
  isDismissiblePaperEventLiveNotice,
  loadPaperChallengeStore,
  loadPaperEventLiveNoticeDismissal,
  sortPaperChallengeHistory,
  type PaperChallengeSummary,
  type PaperChallengeAccountState,
  finalizePaperChallengeStore,
  normalizePaperChallengeStore,
  getMissingPaperChallengeQuoteSymbols,
  PAPER_CHALLENGE_STORAGE_KEY,
  persistPaperEventLiveNoticeDismissal,
  type PaperChallengeStore,
  withdrawUpcomingPaperChallenge,
  persistPaperChallengeFinalization,
  updatePaperChallengeStore,
  shouldEnsurePaperChallengeAccount,
} from '../paperChallenge.ts';
import {
  isTradingFingerprintEventType,
  TRADING_FINGERPRINT_NEUTRAL_FALLBACK,
} from '../eventArenaTradingFingerprintObservation.ts';
import { getRegularEventPreparationStartAtMs } from '../paperChallengeCalendar.ts';
import {
  calculateEventHoldingAllocationPercent,
  getVisibleEventHoldings,
  formatEventHoldingAllocation,
  formatEventHoldingSide,
  hasEventAverageCostFallback,
} from '../paperChallengeAllocation.ts';

test('Event Arena live notice dismissal persists per account and event only', async () => {
  const storage = new Map<string, string>();
  const storagePort = {
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => { storage.set(key, value); },
  };
  const firstAccountEvent = getPaperEventLiveNoticeDismissalKey('paper-event:account-a', '2026-11-16');
  const otherAccountEvent = getPaperEventLiveNoticeDismissalKey('paper-event:account-b', '2026-11-16');
  const laterEvent = getPaperEventLiveNoticeDismissalKey('paper-event:account-a', '2026-11-23');

  assert.ok(firstAccountEvent);
  assert.ok(otherAccountEvent);
  assert.ok(laterEvent);
  assert.notEqual(firstAccountEvent, otherAccountEvent);
  assert.notEqual(firstAccountEvent, laterEvent);
  assert.equal(await loadPaperEventLiveNoticeDismissal(storagePort, firstAccountEvent), false);

  await persistPaperEventLiveNoticeDismissal(storagePort, firstAccountEvent);
  assert.equal(await loadPaperEventLiveNoticeDismissal(storagePort, firstAccountEvent), true);
  const restartedStoragePort = {
    getItem: async (key: string) => storage.get(key) ?? null,
  };
  assert.equal(await loadPaperEventLiveNoticeDismissal(restartedStoragePort, firstAccountEvent), true);
  assert.equal(await loadPaperEventLiveNoticeDismissal(storagePort, otherAccountEvent), false);
  assert.equal(await loadPaperEventLiveNoticeDismissal(storagePort, laterEvent), false);
  assert.equal(getPaperEventLiveNoticeDismissalKey('', '2026-11-16'), null);
  assert.equal(getPaperEventLiveNoticeDismissalKey('paper-event:account-a', ''), null);
});

test('standard Event Arena and One-Stock notices can be dismissed', () => {
  assert.equal(isDismissiblePaperEventLiveNotice('event-arena'), true);
  assert.equal(isDismissiblePaperEventLiveNotice('one-stock-challenge'), true);
  for (const eventType of [
    'lightning-round',
    'penny-stock-mayhem',
    'green-bull-championship',
    'bear-market-mayhem',
    'mountain-championship',
  ] as const) {
    assert.equal(isDismissiblePaperEventLiveNotice(eventType), false, `${eventType} stays unchanged`);
  }
});

test('event holding allocation uses absolute market exposure over reported equity', () => {
  assert.equal(calculateEventHoldingAllocationPercent(25, 40, 20_000), 5);
  assert.equal(calculateEventHoldingAllocationPercent(-25, 40, 20_000), 5);
  assert.equal(calculateEventHoldingAllocationPercent(25, null, 20_000), null);
  assert.equal(calculateEventHoldingAllocationPercent(25, 40, 0), null);
  assert.equal(calculateEventHoldingAllocationPercent(Number.NaN, 40, 20_000), null);
  assert.equal(formatEventHoldingAllocation(5), '5.00%');
  assert.equal(formatEventHoldingAllocation(null), 'Allocation unavailable');
  assert.equal(formatEventHoldingSide('long'), 'Long');
  assert.equal(formatEventHoldingSide('short'), 'Short');
  assert.equal(hasEventAverageCostFallback(['AAPL', 'MSFT'], new Set(['AAPL'])), true);
  assert.equal(hasEventAverageCostFallback(['aapl'], new Set(['AAPL'])), false);
  assert.equal(hasEventAverageCostFallback([], new Set()), false);
});

test('event leaderboard holdings preview keeps all reported entries available', () => {
  const holdings = Array.from({ length: 8 }, (_, index) => ({
    symbol: `STK${index + 1}`,
    companyName: `Company ${index + 1}`,
    allocationPercent: index + 1,
    side: index % 2 === 0 ? 'long' : 'short',
  }));

  assert.deepEqual(getVisibleEventHoldings(holdings, false), holdings.slice(0, 5));
  assert.deepEqual(getVisibleEventHoldings(holdings, true), holdings);
  assert.deepEqual(getVisibleEventHoldings(holdings.slice(0, 3), false), holdings.slice(0, 3));
});

test('paper event runs Monday open through Friday close, then skips a week', () => {
  const active = getPaperChallengeWindow(Date.parse('2026-11-18T17:00:00.000Z'));
  assert.equal(active.id, '2026-11-16');
  assert.equal(active.phase, 'active');
  assert.equal(active.artworkId, 'stadium');
  assert.equal(new Date(active.startAtMs).toISOString(), '2026-11-16T14:30:00.000Z');
  assert.equal(new Date(active.endAtMs).toISOString(), '2026-11-20T21:00:00.000Z');

  const offWeek = getPaperChallengeWindow(Date.parse('2026-11-25T17:00:00.000Z'));
  assert.equal(offWeek.id, '2026-11-30');
  assert.equal(offWeek.phase, 'upcoming');
  assert.equal(offWeek.artworkId, 'neon-nightclub');
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

test('Event Arena artwork rotates through all seven events and then wraps', () => {
  const starts = [
    '2026-11-16',
    '2026-11-30',
    '2026-12-14',
    '2026-12-28',
    '2027-01-11',
    '2027-01-25',
    '2027-02-08',
    '2027-02-22',
  ];
  assert.deepEqual(starts.map(getPaperChallengeArtworkId), [
    ...PAPER_CHALLENGE_ARTWORK_IDS,
    PAPER_CHALLENGE_ARTWORK_IDS[0],
  ]);
  assert.equal(getPaperChallengeArtworkId('2026-11-02'), 'stadium');
  assert.equal(getPaperChallengeArtworkId('not-an-event'), 'stadium');
});

test('Neon Nightclub starts new accounts at $250,000 and keeps saved balances intact', () => {
  const configuration = getPaperChallengeConfiguration('neon-nightclub');
  assert.deepEqual(configuration, {
    eventType: 'event-arena',
    artworkId: 'neon-nightclub',
    startingBalance: NEON_NIGHTCLUB_STARTING_BALANCE,
    rankingDirection: 'highest-return',
  });
  const event = getPaperChallengeWindow(Date.parse('2026-12-01T17:00:00.000Z'));
  assert.equal(event.id, '2026-11-30');
  assert.equal(event.artworkId, 'neon-nightclub');
  assert.equal(event.startingBalance, 250_000);

  const enrollment = {
    eventId: event.id,
    ...configuration,
    eventStartAtMs: event.startAtMs,
    eventEndAtMs: event.endAtMs,
    joinedAtMs: event.startAtMs,
    accountId: `paper-event:${event.id}`,
    accountName: 'Event Portfolio',
    startEquity: null,
  };
  const initialized = ensurePaperChallengeAccount(enrollment, {
    accounts: [],
    positions: [],
    transactions: [],
    orders: [],
    lots: [],
  });
  assert.equal(initialized.accounts[0]?.cash, 250_000);

  const savedUpcomingEnrollment = {
    eventId: event.id,
    ...configuration,
    startingBalance: 100_000,
    eventStartAtMs: event.startAtMs,
    eventEndAtMs: event.endAtMs,
    joinedAtMs: event.startAtMs - 86_400_000,
    accountId: `paper-event:${event.id}`,
    accountName: 'Event Portfolio',
    startEquity: null,
  };
  const normalizedUpcoming = normalizePaperChallengeStore(
    { enrollment: savedUpcomingEnrollment, history: [] },
    event.startAtMs - 1,
  );
  assert.equal(normalizedUpcoming.enrollment?.startingBalance, 250_000);
  assert.equal(normalizedUpcoming.enrollment?.startEquity, null);

  const normalizedStarted = normalizePaperChallengeStore(
    {
      enrollment: {
        ...savedUpcomingEnrollment,
        eventStartAtMs: event.startAtMs,
        startEquity: 100_000,
      },
      history: [],
    },
    event.startAtMs,
  );
  assert.equal(normalizedStarted.enrollment?.startingBalance, 100_000);

  assert.equal(isPaperChallengeConfiguration({
    ...configuration,
    startingBalance: 100_000,
  }), true, 'previously saved Neon Nightclub events keep their original balance');
});

test('Green Bull artwork fixes saved rules, account capital, baseline, fees, and archive results', () => {
  const configuration = getPaperChallengeConfiguration('green-stock-exchange');
  assert.deepEqual(configuration, {
    eventType: 'green-bull-championship',
    artworkId: 'green-stock-exchange',
    startingBalance: GREEN_BULL_STARTING_BALANCE,
    rankingDirection: 'highest-return',
  });
  assert.equal(getPaperChallengeConfiguration('stadium').startingBalance, 100_000);
  const scheduledGreenEvent = getPaperChallengeWindow(Date.parse('2027-01-11T12:00:00.000Z'));
  assert.equal(scheduledGreenEvent.id, '2027-01-11');
  assert.equal(scheduledGreenEvent.artworkId, 'green-stock-exchange');
  assert.equal(scheduledGreenEvent.startingBalance, 500_000);

  const enrollment = {
    eventId: '2027-01-11',
    ...configuration,
    eventStartAtMs: Date.parse('2027-01-11T14:30:00.000Z'),
    eventEndAtMs: Date.parse('2027-01-15T21:00:00.000Z'),
    joinedAtMs: Date.parse('2027-01-11T14:30:00.000Z'),
    accountId: 'paper-event:2027-01-11',
    accountName: 'Event Portfolio',
    startEquity: null,
  };
  const initialized = ensurePaperChallengeAccount(enrollment, {
    accounts: [{ id: 'paper-main', name: 'Main', cash: 73_000, createdAt: '2026-01-01T00:00:00.000Z' }],
    positions: [],
    transactions: [],
    orders: [],
    lots: [],
  });
  assert.equal(initialized.accounts[1]?.cash, 500_000);
  assert.equal(initialized.accounts[0]?.cash, 73_000);
  const baseline = capturePaperChallengeBaseline(enrollment, 503_000);
  assert.equal(baseline.startEquity, 500_000);

  const summary = buildPaperChallengeSummary(
    { ...baseline, startEquity: 500_000 },
    501_234,
    [{
      accountId: enrollment.accountId,
      symbol: 'VOO',
      action: 'SELL',
      date: '2027-01-12T15:00:00.000Z',
      realizedPnL: 1_000,
      fee: 10,
    }],
    enrollment.eventEndAtMs,
  );
  assert.equal(summary.startingBalance, 500_000);
  assert.equal(summary.startEquity, 500_000);
  assert.equal(summary.netProfit, 1_234);
  assert.ok(Math.abs(summary.returnPercent - 0.2468) < 1e-12);
  assert.equal(summary.realizedPnL, 990);

  const archived = normalizePaperChallengeStore({ enrollment: null, history: [summary] }).history[0];
  assert.equal(archived.eventType, 'green-bull-championship');
  assert.equal(archived.artworkId, 'green-stock-exchange');
  assert.equal(archived.startingBalance, 500_000);
  assert.ok(Math.abs(archived.returnPercent - 0.2468) < 1e-12);
});

test('Mountain Championship uses a stable event type and locks transfers only in its schedule window', () => {
  const configuration = getPaperChallengeConfiguration('mountain-summit');
  assert.deepEqual(configuration, {
    eventType: 'mountain-championship',
    artworkId: 'mountain-summit',
    startingBalance: 100_000,
    rankingDirection: 'highest-return',
  });
  const event = getPaperChallengeWindow(Date.parse('2026-12-16T17:00:00.000Z'));
  assert.equal(event.id, '2026-12-14');
  assert.equal(event.eventType, 'mountain-championship');
  assert.equal(event.startingBalance, 100_000);

  const preparationStart = getRegularEventPreparationStartAtMs(event.id);
  assert.equal(preparationStart, Date.parse('2026-12-07T05:00:00.000Z'));
  const eventEnd = Date.parse('2026-12-18T21:00:00.000Z');
  assert.equal(isMountainChampionshipTransferLocked('mountain-championship', event.id, eventEnd, preparationStart - 1), false);
  assert.equal(isMountainChampionshipTransferLocked('mountain-championship', event.id, eventEnd, preparationStart), true);
  assert.equal(isMountainChampionshipTransferLocked('mountain-championship', event.id, eventEnd, event.startAtMs), true);
  assert.equal(isMountainChampionshipTransferLocked('mountain-championship', event.id, eventEnd, eventEnd - 1), true);
  assert.equal(isMountainChampionshipTransferLocked('mountain-championship', event.id, eventEnd, eventEnd), false);

  for (const eventType of [
    'event-arena',
    'green-bull-championship',
    'bear-market-mayhem',
    'penny-stock-mayhem',
    'lightning-round',
  ] as const) {
    assert.equal(isMountainChampionshipTransferLocked(eventType, event.id, eventEnd, event.startAtMs), false);
  }
  assert.equal(isMountainChampionshipTransferLocked('event-arena', event.id, eventEnd, event.startAtMs), false);
  assert.equal(isPaperChallengeConfiguration({
    eventType: 'event-arena',
    artworkId: 'mountain-summit',
    startingBalance: 100_000,
    rankingDirection: 'highest-return',
  }), true, 'legacy saved Mountain events remain readable');
  assert.equal(isPaperChallengeConfiguration({
    eventType: 'mountain-championship',
    artworkId: 'mountain-summit',
    startingBalance: 100_000,
    rankingDirection: 'highest-return',
  }), true, 'previously saved Mountain Championship rules remain readable');
});

test('Red Showdown creates an isolated Bear Market event and preserves its saved rules in history', () => {
  const configuration = getPaperChallengeConfiguration('red-showdown');
  assert.deepEqual(configuration, {
    eventType: 'bear-market-mayhem',
    artworkId: 'red-showdown',
    startingBalance: 100_000,
    rankingDirection: 'lowest-return',
  });
  const scheduledEvent = getPaperChallengeWindow(Date.parse('2026-12-28T12:00:00.000Z'));
  assert.equal(scheduledEvent.artworkId, 'red-showdown');
  assert.equal(scheduledEvent.eventType, 'bear-market-mayhem');
  assert.equal(scheduledEvent.startingBalance, 100_000);
  assert.equal(scheduledEvent.rankingDirection, 'lowest-return');

  const enrollment = {
    eventId: scheduledEvent.id,
    ...configuration,
    eventStartAtMs: scheduledEvent.startAtMs,
    eventEndAtMs: scheduledEvent.endAtMs,
    joinedAtMs: scheduledEvent.startAtMs,
    accountId: `paper-event:${scheduledEvent.id}`,
    accountName: 'Event Portfolio',
    startEquity: null,
  };
  const initialized = ensurePaperChallengeAccount(enrollment, {
    accounts: [{ id: 'paper-main', name: 'Main', cash: 73_000, createdAt: '2026-01-01T00:00:00.000Z' }],
    positions: [{
      id: 'previous-event-position',
      accountId: 'paper-event:2026-12-14',
      symbol: 'OLD',
      companyName: 'Old Event Position',
      shares: 12,
      avgCost: 10,
      openedAt: '2026-12-14T15:00:00.000Z',
      dividendYield: 0,
      sector: '',
    }],
    transactions: [],
    orders: [],
    lots: [],
  });
  assert.equal(initialized.accounts[1]?.cash, 100_000);
  assert.equal(initialized.accounts[0]?.cash, 73_000);
  assert.equal(initialized.positions[0]?.accountId, 'paper-event:2026-12-14');
  assert.equal(initialized.positions.some((position) => position.accountId === enrollment.accountId), false);

  const baseline = capturePaperChallengeBaseline(enrollment, 63_000);
  assert.equal(baseline.startEquity, 100_000);
  const summary = buildPaperChallengeSummary(
    { ...baseline, startEquity: 100_000 },
    65_000,
    [],
    scheduledEvent.endAtMs,
  );
  assert.equal(summary.startingBalance, 100_000);
  assert.equal(summary.endEquity, 65_000);
  assert.equal(summary.netProfit, -35_000);
  assert.equal(summary.returnPercent, -35);
  const archived = normalizePaperChallengeStore({ enrollment: null, history: [summary] }).history[0];
  assert.equal(archived.eventType, 'bear-market-mayhem');
  assert.equal(archived.artworkId, 'red-showdown');
  assert.equal(archived.startingBalance, 100_000);
  assert.equal(archived.rankingDirection, 'lowest-return');
  assert.equal(archived.returnPercent, -35);
});

test('Penny Stock Mayhem gets a fresh standard account and archives its $20 buy limit', () => {
  const window = getPaperChallengeWindow(Date.parse('2027-01-25T12:00:00.000Z'));
  assert.equal(window.id, '2027-01-25');
  assert.equal(window.artworkId, 'penny-stock-mayhem');
  assert.equal(window.eventType, 'penny-stock-mayhem');
  assert.equal(window.startingBalance, 100_000);
  assert.equal(window.rankingDirection, 'highest-return');
  assert.equal(window.purchaseLimit, 20);
  assert.equal(new Date(window.startAtMs).toISOString(), '2027-01-25T14:30:00.000Z');
  assert.equal(new Date(window.endAtMs).toISOString(), '2027-01-29T21:00:00.000Z');

  const enrollment = {
    eventId: window.id,
    ...getPaperChallengeConfiguration('penny-stock-mayhem'),
    eventStartAtMs: window.startAtMs,
    eventEndAtMs: window.endAtMs,
    joinedAtMs: window.startAtMs,
    accountId: `paper-event:${window.id}`,
    accountName: 'Event Portfolio',
    startEquity: null,
  };
  const isolated = ensurePaperChallengeAccount(enrollment, {
    accounts: [{ id: 'paper-event:2027-01-11', name: 'Previous event', cash: 12_345, createdAt: '2027-01-11T14:30:00.000Z' }],
    positions: [{
      id: 'previous-position',
      accountId: 'paper-event:2027-01-11',
      symbol: 'OLD',
      companyName: 'Previous holding',
      shares: 4,
      avgCost: 10,
      openedAt: '2027-01-12T15:00:00.000Z',
      dividendYield: 0,
      sector: '',
    }],
    transactions: [],
    orders: [],
    lots: [],
  });
  assert.equal(isolated.accounts.find((item) => item.id === enrollment.accountId)?.cash, 100_000);
  assert.equal(isolated.positions.length, 1);
  assert.equal(isolated.positions[0]?.accountId, 'paper-event:2027-01-11');
  assert.equal(isolated.positions.some((item) => item.accountId === enrollment.accountId), false);

  const summary = buildPaperChallengeSummary(
    { ...enrollment, startEquity: 100_000 },
    102_000,
    [],
    window.endAtMs,
  );
  assert.equal(summary.returnPercent, 2);
  assert.equal(summary.purchaseLimit, 20);
  const archived = normalizePaperChallengeStore({ enrollment: null, history: [summary] }).history[0];
  assert.equal(archived.eventType, 'penny-stock-mayhem');
  assert.equal(archived.artworkId, 'penny-stock-mayhem');
  assert.equal(archived.purchaseLimit, 20);
  assert.equal(archived.returnPercent, 2);
});

test('event accounts are created at the scheduled start, including late result recovery', () => {
  const eventStartAtMs = Date.parse('2026-11-30T14:30:00.000Z');
  const pendingEnrollment = {
    eventId: '2026-11-30',
    eventStartAtMs,
    eventEndAtMs: Date.parse('2026-12-04T21:00:00.000Z'),
    joinedAtMs: eventStartAtMs,
    accountId: 'paper-event:2026-11-30',
    accountName: 'Event Portfolio',
    startEquity: null,
  };

  assert.equal(shouldEnsurePaperChallengeAccount(pendingEnrollment, eventStartAtMs - 1), false);
  assert.equal(shouldEnsurePaperChallengeAccount(pendingEnrollment, eventStartAtMs), true);
  assert.equal(shouldEnsurePaperChallengeAccount(pendingEnrollment, pendingEnrollment.eventEndAtMs + 1), true);
  assert.equal(shouldEnsurePaperChallengeAccount({ ...pendingEnrollment, startEquity: 100_000 }, eventStartAtMs - 1), true);
});

test('Lightning Round reuses account data and archives independently from a concurrent regular event', () => {
  const lightning = getLightningRoundWindow(Date.parse('2026-11-21T16:00:00.000Z'));
  const regularEnrollment = {
    eventId: '2026-11-16',
    eventType: 'event-arena' as const,
    artworkId: 'stadium' as const,
    startingBalance: 100_000,
    rankingDirection: 'highest-return' as const,
    eventStartAtMs: Date.parse('2026-11-16T14:30:00.000Z'),
    eventEndAtMs: Date.parse('2026-11-20T21:00:00.000Z'),
    joinedAtMs: Date.parse('2026-11-16T14:30:00.000Z'),
    accountId: 'paper-event:2026-11-16',
    accountName: 'Event Portfolio',
    startEquity: 100_000,
  };
  const lightningEnrollment = {
    eventId: lightning.id,
    eventType: 'lightning-round' as const,
    artworkId: 'lightning-round-arena' as const,
    startingBalance: 100_000,
    rankingDirection: 'highest-return' as const,
    eventStartAtMs: lightning.startAtMs,
    eventEndAtMs: lightning.endAtMs,
    joinedAtMs: lightning.startAtMs,
    accountId: `paper-lightning:${lightning.id}`,
    accountName: 'Lightning Round',
    startEquity: 100_000,
  };
  const existingRegularAccount = {
    id: regularEnrollment.accountId,
    name: regularEnrollment.accountName,
    cash: 97_000,
    createdAt: new Date(regularEnrollment.joinedAtMs).toISOString(),
  };
  const existingState = {
    accounts: [existingRegularAccount],
    positions: [{
      id: 'regular-position',
      accountId: regularEnrollment.accountId,
      symbol: 'AAPL',
      companyName: 'Apple',
      shares: 30,
      avgCost: 100,
      openedAt: '2026-11-17T15:00:00.000Z',
      dividendYield: 0,
      sector: 'Technology',
    }],
    transactions: [],
    orders: [],
    lots: [],
  };
  const initialized = ensurePaperChallengeAccount(lightningEnrollment, existingState);
  assert.equal(initialized, existingState);
  assert.equal(initialized.accounts[0]?.cash, 97_000);
  assert.equal(initialized.accounts.some((item) => item.id.startsWith('paper-lightning:')), false);
  assert.equal(initialized.positions[0]?.accountId, regularEnrollment.accountId);

  const lightningSummary = buildPaperChallengeSummary(
    lightningEnrollment,
    103_000,
    [],
    lightning.endAtMs,
    { finalRank: 2 },
  );
  const finalized = finalizePaperChallengeStore({
    enrollment: regularEnrollment,
    lightningEnrollment,
    history: [],
  }, lightningSummary, lightning.endAtMs);
  assert.equal(finalized.enrollment?.eventId, regularEnrollment.eventId);
  assert.equal(finalized.lightningEnrollment, null);
  assert.equal(finalized.history[0]?.eventType, 'lightning-round');
  assert.equal(finalized.history[0]?.eventId, lightning.id);
  assert.equal(finalized.history[0]?.artworkId, 'lightning-round-arena');
  assert.equal(finalized.history[0]?.finalRank, 2);
  assert.equal(finalized.history[0]?.returnPercent, 3);

  const normalized = normalizePaperChallengeStore(finalized);
  assert.equal(normalized.history[0]?.startingBalance, LIGHTNING_ROUND_STARTING_BALANCE);
  assert.equal(normalized.enrollment?.eventId, regularEnrollment.eventId);
});

test('Lightning Round can offer only the latest completed Lightning alias for explicit reuse', () => {
  const history = [
    {
      eventId: 'lightning-2026-11-13',
      eventType: 'lightning-round' as const,
      eventStartAtMs: Date.parse('2026-11-13T14:30:00.000Z'),
      leaderboardAlias: 'Earlier Alias',
    },
    {
      eventId: '2026-11-16',
      eventType: 'event-arena' as const,
      eventStartAtMs: Date.parse('2026-11-16T14:30:00.000Z'),
      leaderboardAlias: 'Regular Alias',
    },
    {
      eventId: 'lightning-2026-11-20',
      eventStartAtMs: Date.parse('2026-11-20T14:30:00.000Z'),
      leaderboardAlias: '  Flash  ',
    },
  ];

  assert.equal(getLatestLightningRoundAlias(history), 'Flash');
  assert.equal(getLatestLightningRoundAlias([
    {
      eventId: 'lightning-2026-11-27',
      eventStartAtMs: Date.parse('2026-11-27T14:30:00.000Z'),
      leaderboardAlias: '  ',
    },
  ]), null);
});

test('paper event market hours follow Eastern daylight-saving time', () => {
  const event = getPaperChallengeWindow(Date.parse('2027-03-24T16:00:00.000Z'));
  assert.equal(new Date(event.startAtMs).toISOString(), '2027-03-22T13:30:00.000Z');
  assert.equal(new Date(event.endAtMs).toISOString(), '2027-03-26T20:00:00.000Z');
});

test('Lightning Round runs Friday 7:30 a.m. Denver only when the full window is clear', () => {
  const regularWeek = getLightningRoundWindow(Date.parse('2026-11-20T14:29:59.000Z'));
  assert.equal(regularWeek.id, 'lightning-2026-11-27');
  assert.equal(regularWeek.startAtMs, Date.parse('2026-11-27T14:30:00.000Z'));
  assert.equal(regularWeek.phase, 'upcoming');

  const regularStart = Date.parse('2026-11-16T14:30:00.000Z');
  const regularEnd = Date.parse('2026-11-20T21:00:00.000Z');
  assert.equal(hasRegularPaperChallengeOverlap(
    Date.parse('2026-11-20T14:30:00.000Z'),
    Date.parse('2026-11-21T14:30:00.000Z'),
  ), true);
  assert.equal(hasRegularPaperChallengeOverlap(regularEnd, regularEnd + 24 * 60 * 60 * 1000), false);
  assert.equal(hasRegularPaperChallengeOverlap(
    regularStart - 24 * 60 * 60 * 1000,
    regularStart,
  ), false);

  const beforeStart = getLightningRoundWindow(Date.parse('2026-11-27T14:29:59.000Z'));
  assert.equal(beforeStart.id, 'lightning-2026-11-27');
  assert.equal(beforeStart.phase, 'upcoming');
  assert.equal(beforeStart.startAtMs, Date.parse('2026-11-27T14:30:00.000Z'));

  const active = getLightningRoundWindow(Date.parse('2026-11-27T14:30:00.000Z'));
  assert.equal(active.phase, 'active');
  assert.equal(active.eventType, 'lightning-round');
  assert.equal(active.artworkId, 'lightning-round-arena');
  assert.equal(active.startingBalance, LIGHTNING_ROUND_STARTING_BALANCE);
  assert.equal(active.endAtMs - active.startAtMs, 24 * 60 * 60 * 1000);
  assert.equal(getLightningRoundWindow(active.endAtMs - 1).id, active.id);
  assert.equal(getLightningRoundWindow(active.endAtMs).id, 'lightning-2026-12-11');
  assert.equal(getLightningRoundWindow(active.endAtMs).phase, 'upcoming');

  const beforeDst = getLightningRoundWindow(Date.parse('2027-03-05T14:29:59.000Z'));
  const afterDst = getLightningRoundWindow(Date.parse('2027-03-19T13:29:59.000Z'));
  assert.equal(beforeDst.id, 'lightning-2027-03-05');
  assert.equal(beforeDst.startAtMs, Date.parse('2027-03-05T14:30:00.000Z'));
  assert.equal(beforeDst.endAtMs, Date.parse('2027-03-06T14:30:00.000Z'));
  assert.equal(afterDst.id, 'lightning-2027-03-19');
  assert.equal(afterDst.startAtMs, Date.parse('2027-03-19T13:30:00.000Z'));
  assert.equal(afterDst.endAtMs, Date.parse('2027-03-20T13:30:00.000Z'));

  assert.equal(isLightningRoundEventId('lightning-2026-11-27'), true);
  assert.equal(isLightningRoundEventId('lightning-2026-11-21'), true);
  assert.equal(isLightningRoundEventId('lightning-2026-11-22'), false);
  assert.equal(isPaperChallengeAccountId('paper-lightning:lightning-2026-11-27'), true);
  assert.equal(isPaperChallengeAccountId('paper-event:2026-11-16'), true);
  assert.equal(isPaperChallengeAccountId('paper-strategy-1'), false);
});

test('prepared Lightning Round dates override a mismatching local calendar', () => {
  const now = Date.parse('2026-11-20T14:00:00.000Z');
  const localWindow = getLightningRoundWindow(now);
  const serverWindow = {
    eventId: 'lightning-2026-12-11',
    eventType: 'lightning-round',
    artworkId: 'lightning-round-arena',
    startingBalance: LIGHTNING_ROUND_STARTING_BALANCE,
    rankingDirection: 'highest-return',
    startAtMs: Date.parse('2026-12-11T14:30:00.000Z'),
    endAtMs: Date.parse('2026-12-12T14:30:00.000Z'),
  };

  assert.equal(localWindow.id, 'lightning-2026-11-27');
  const prepared = findPreparedLightningRoundWindow([serverWindow], now);
  assert.equal(prepared?.id, serverWindow.eventId);
  assert.equal(prepared?.startAtMs, serverWindow.startAtMs);
  assert.equal(prepared?.phase, 'upcoming');
  assert.equal(
    findPreparedLightningRoundWindow([serverWindow], serverWindow.startAtMs)?.phase,
    'active',
  );
  assert.equal(findPreparedLightningRoundWindow([], now), null);
});

test('Lightning invitation follows the prepared event at exact 72-hour and 48-hour boundaries', () => {
  const startAtMs = Date.parse('2026-12-11T14:30:00.000Z');
  const endAtMs = Date.parse('2026-12-12T14:30:00.000Z');
  const prepared = [{
    eventId: 'lightning-2026-12-11',
    eventType: 'lightning-round',
    artworkId: 'lightning-round-arena',
    startingBalance: LIGHTNING_ROUND_STARTING_BALANCE,
    rankingDirection: 'highest-return',
    startAtMs,
    endAtMs,
  }];
  const preparationStartsAt = startAtMs - 72 * 60 * 60 * 1000;
  const invitationEndsAt = endAtMs + 48 * 60 * 60 * 1000;

  assert.equal(findPreparedLightningRoundInvitationWindow(prepared, preparationStartsAt - 1), null);
  assert.equal(
    findPreparedLightningRoundInvitationWindow(prepared, preparationStartsAt)?.id,
    'lightning-2026-12-11',
  );
  assert.equal(findPreparedLightningRoundInvitationWindow(prepared, startAtMs)?.phase, 'active');
  assert.equal(findPreparedLightningRoundInvitationWindow(prepared, endAtMs)?.phase, 'ended');
  assert.equal(
    findPreparedLightningRoundInvitationWindow(prepared, invitationEndsAt - 1)?.id,
    'lightning-2026-12-11',
  );
  assert.equal(findPreparedLightningRoundInvitationWindow(prepared, invitationEndsAt), null);
});

test('event reminders include eligible Lightning Rounds at their scheduled Denver start', () => {
  const now = Date.parse('2026-11-12T18:00:00.000Z');
  const upcoming = getPaperChallengeReminders(now);
  assert.equal(upcoming.length, 8);
  assert.deepEqual(
    [...new Set(upcoming.filter((reminder) => !reminder.eventId.startsWith('lightning-')).map((reminder) => reminder.eventId))],
    ['2026-11-16', '2026-11-30'],
  );
  assert.equal(upcoming.filter((reminder) => reminder.eventId === '2026-11-16').length, 3);
  const lightningReminders = upcoming.filter((reminder) => reminder.kind === 'lightning-round-start');
  assert.deepEqual(lightningReminders.map(({ eventId, scheduledAtMs }) => ({
    eventId,
    scheduledAtMs: new Date(scheduledAtMs).toISOString(),
  })), [
    { eventId: 'lightning-2026-11-27', scheduledAtMs: '2026-11-27T14:30:00.000Z' },
    { eventId: 'lightning-2026-12-11', scheduledAtMs: '2026-12-11T14:30:00.000Z' },
  ]);
  assert.ok(upcoming.every((reminder, index) =>
    index === 0 || upcoming[index - 1]!.scheduledAtMs <= reminder.scheduledAtMs));

  const midweekNow = Date.parse('2026-11-18T19:00:00.000Z');
  const midweek = getPaperChallengeReminders(midweekNow);
  assert.equal(midweek.filter((reminder) => reminder.eventId === '2026-11-16').length, 1);
  assert.equal(midweek.filter((reminder) => reminder.eventId === '2026-11-30').length, 3);
  assert.ok(!midweek.some((reminder) => reminder.eventId === 'lightning-2026-11-20'));
  assert.ok(midweek.some((reminder) => reminder.eventId === 'lightning-2026-11-27'));
  assert.ok(midweek.every((reminder) => reminder.scheduledAtMs > midweekNow));

  const beforeDstStart = getPaperChallengeReminders(Date.parse('2027-03-19T13:29:59.000Z'))
    .find((reminder) => reminder.eventId === 'lightning-2027-03-19');
  assert.equal(beforeDstStart?.scheduledAtMs, Date.parse('2027-03-19T13:30:00.000Z'));
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
  assert.deepEqual(sortPaperChallengeHistory(history, 'low').map((event) => event.eventId), ['older-low', 'newer', 'older-best']);
  assert.deepEqual(sortPaperChallengeHistory(history, 'positive').map((event) => event.eventId), ['newer', 'older-best']);
  assert.deepEqual(sortPaperChallengeHistory(history, 'negative').map((event) => event.eventId), ['older-low']);
});

test('Lightning Round season summary aggregates only completed local Lightning Round records', () => {
  const makeSummary = (
    eventId: string,
    overrides: Partial<PaperChallengeSummary> = {},
  ): PaperChallengeSummary => ({
    eventId,
    eventStartAtMs: 1_000,
    eventEndAtMs: 2_000,
    joinedAtMs: 1_000,
    accountId: `paper-lightning:${eventId}`,
    accountName: 'Lightning Round',
    eventType: 'lightning-round',
    startEquity: 100_000,
    endEquity: 100_000,
    netProfit: 0,
    returnPercent: 0,
    tradeCount: 0,
    buyCount: 0,
    sellCount: 0,
    symbolsTraded: [],
    realizedPnL: 0,
    completedAtMs: 2_001,
    ...overrides,
  });
  const history = [
    makeSummary('lightning-2026-11-20', {
      startEquity: 100_000,
      startingBalance: 100_000,
      netProfit: 5_000,
      finalRank: 3,
    }),
    makeSummary('lightning-2026-12-04', {
      startEquity: 200_000,
      startingBalance: 200_000,
      netProfit: -2_000,
      finalRank: 1,
      completedAtMs: 20_000,
    }),
    makeSummary('lightning-2026-12-18', { completedAtMs: 30_000 }),
    makeSummary('regular-event', {
      eventType: 'event-arena',
      netProfit: 90_000,
      finalRank: 1,
    }),
  ];

  assert.deepEqual(getLightningRoundSeasonSummary(history, 25_000), {
    completedRounds: 2,
    totalProfitLoss: 3_000,
    startingEquity: 300_000,
    returnPercent: 1,
    bestRank: 1,
  });
  assert.equal(getLightningRoundSeasonSummary(history, 1_500), null);
});

test('event archive chart fits a 400px mobile viewport without fabricated width', () => {
  assert.equal(getPaperChallengeArchiveChartWidth(400), 332);
  assert.equal(getPaperChallengeArchiveChartWidth(320), 252);
  assert.equal(getPaperChallengeArchiveChartWidth(Number.NaN), 180);
});

test('legacy event records keep missing archive details unavailable', () => {
  const legacyEvent = {
    eventId: 'legacy-event',
    eventStartAtMs: 10,
    eventEndAtMs: 20,
    joinedAtMs: 10,
    accountId: 'paper-event:legacy-event',
    accountName: 'Event Portfolio',
    startEquity: 100_000,
    endEquity: 100_000,
    netProfit: 0,
    returnPercent: 0,
    tradeCount: 0,
    buyCount: 0,
    sellCount: 0,
    symbolsTraded: [],
    realizedPnL: 0,
    completedAtMs: 21,
  } satisfies PaperChallengeSummary;

  const normalized = normalizePaperChallengeStore({ enrollment: null, history: [legacyEvent] });
  assert.equal(normalized.history[0].transactions, undefined);
  assert.equal(normalized.history[0].equityHistory, undefined);
  assert.equal(normalized.history[0].finalPositions, undefined);
  assert.equal(normalized.history[0].finalRank, undefined);
  assert.equal(normalized.history[0].artworkId, 'stadium');
  const legacyGreenArt = normalizePaperChallengeStore({
    enrollment: null,
    history: [{ ...legacyEvent, eventId: 'old-green-art', artworkId: 'green-stock-exchange' }],
  }).history[0];
  assert.equal(legacyGreenArt.eventType, undefined);
  assert.equal(legacyGreenArt.startingBalance, undefined);
  assert.equal(legacyGreenArt.startEquity, 100_000);

  const legacyGreenEnrollment = normalizePaperChallengeStore({
    enrollment: {
      eventId: '2027-01-11',
      artworkId: 'green-stock-exchange',
      eventStartAtMs: 10,
      eventEndAtMs: 20,
      joinedAtMs: 10,
      accountId: 'paper-event:legacy-green',
      accountName: 'Event Portfolio',
      startEquity: 92_500,
    },
    history: [],
  }).enrollment;
  assert.equal(legacyGreenEnrollment?.eventType, 'event-arena');
  assert.equal(legacyGreenEnrollment?.startingBalance, 92_500);
  assert.equal(legacyGreenEnrollment?.startEquity, 92_500);

  const legacyRedEnrollment = normalizePaperChallengeStore({
    enrollment: {
      eventId: '2026-12-28',
      artworkId: 'red-showdown',
      eventStartAtMs: 10,
      eventEndAtMs: 20,
      joinedAtMs: 10,
      accountId: 'paper-event:old-red',
      accountName: 'Event Portfolio',
      startEquity: 100_000,
      eventType: 'event-arena',
      startingBalance: 100_000,
      rankingDirection: 'highest-return',
    },
    history: [],
  }).enrollment;
  assert.equal(legacyRedEnrollment?.eventType, 'event-arena');
  assert.equal(legacyRedEnrollment?.rankingDirection, 'highest-return');
});

test('event artwork survives enrollment normalization, summary creation, and archive finalization', () => {
  const enrollment = {
    eventId: '2026-12-14',
    artworkId: 'mountain-summit' as const,
    eventStartAtMs: Date.parse('2026-12-14T14:30:00.000Z'),
    eventEndAtMs: Date.parse('2026-12-18T21:00:00.000Z'),
    joinedAtMs: Date.parse('2026-12-14T14:30:00.000Z'),
    accountId: 'paper-event:2026-12-14',
    accountName: 'Event Portfolio',
    startEquity: 100_000,
  };
  const normalizedEnrollment = normalizePaperChallengeStore({
    enrollment: { ...enrollment, artworkId: undefined },
    history: [],
  }).enrollment;
  assert.equal(normalizedEnrollment?.artworkId, 'stadium', 'legacy enrollments get the stable legacy choice');

  const normalized = normalizePaperChallengeStore({ enrollment, history: [] });
  const summary = buildPaperChallengeSummary(
    normalized.enrollment as typeof enrollment,
    101_000,
    [],
    enrollment.eventEndAtMs,
  );
  const completed = finalizePaperChallengeStore(
    { enrollment: normalized.enrollment, history: [] },
    summary,
    enrollment.eventEndAtMs,
  );
  assert.equal(summary.artworkId, 'mountain-summit');
  assert.equal(completed.enrollment, null);
  assert.equal(completed.history[0].artworkId, 'mountain-summit');
  assert.equal(normalizePaperChallengeStore(completed).history[0].artworkId, 'mountain-summit');
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

test('live personal-best progress compares only valid earlier completed-event returns', () => {
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
    makeSummary('older-best', 100, 3.5),
    makeSummary('older-loss', 200, -2),
    makeSummary('current', 300, 50),
    makeSummary('future', 400, 100),
    makeSummary('invalid', 150, Number.NaN),
  ];

  assert.deepEqual(getPaperChallengePersonalBestProgress(history, 300, 2.25), {
    bestReturnPercent: 3.5,
    gapPercentPoints: 1.25,
  });
  assert.deepEqual(getPaperChallengePersonalBestProgress(history, 300, 4), {
    bestReturnPercent: 3.5,
    gapPercentPoints: -0.5,
  });
  assert.equal(getPaperChallengePersonalBestProgress([history[2]], 300, 2.25), null);
  assert.equal(getPaperChallengePersonalBestProgress(history, 300, null), null);
  assert.equal(getPaperChallengePersonalBestProgress(history, 300, Number.NaN), null);
});

test('Event Arena wires its label, history sorting, midweek refresh, sharing, and notification toggle', async () => {
  const testDirectory = dirname(fileURLToPath(import.meta.url));
  const componentSource = await readFile(resolve(testDirectory, '../../components/PaperChallengeHistory.tsx'), 'utf8');
  const cardSource = await readFile(resolve(testDirectory, '../../components/PaperEventShareCard.tsx'), 'utf8');
  const fingerprintSource = await readFile(resolve(testDirectory, '../../components/TradingFingerprintSection.tsx'), 'utf8');
  const paperScreenSource = await readFile(resolve(testDirectory, '../../app/paper.tsx'), 'utf8');
  const badgeSource = await readFile(resolve(testDirectory, '../../components/PaperChallengeMilestoneBadges.tsx'), 'utf8');
  assert.match(componentSource, /accessibilityLabel="Event Arena"/);
  assert.match(componentSource, /sortPaperChallengeHistory\(store\.history, sortMode\)/);
  assert.match(componentSource, /testID="open-paper-event-archive"/);
  assert.match(componentSource, /testID=\{`paper-event-card-\$\{event\.eventId\}`\}/);
  assert.match(componentSource, /PortfolioLineChart/);
  assert.match(componentSource, /testID="paper-event-return-active"/);
  assert.match(componentSource, /testID=\{`paper-event-filter-\$\{option\.key\}`\}/);
  assert.match(componentSource, /archivedPositions === undefined/);
  assert.match(componentSource, /equityHistory\.length >= 2/);
  assert.match(componentSource, /flexWrap: 'wrap'/);
  assert.match(componentSource, /getPaperChallengeArchiveChartWidth\(screenWidth\)/);
  const archiveStart = componentSource.indexOf('const renderArchive');
  const componentRenderStart = componentSource.indexOf('\n  return (\n    <View style={{ marginBottom: 18 }}', archiveStart);
  const archiveUi = componentSource.slice(archiveStart, componentRenderStart);
  assert.doesNotMatch(archiveUi, /updatePaperChallengeStore|savePaperCache|setPositions|setAccounts|setTransactions/);
  assert.match(componentSource, /disabled=\{saving \|\| storeLoadState !== 'ready' \|\| \!\!store\.enrollment\}/);
  assert.match(componentSource, /testID="retry-paper-challenge-history"/);
  assert.match(componentSource, /Could not load your saved event history/);
  assert.match(componentSource, /refreshEventPosition/);
  assert.match(componentSource, /getPaperChallengePersonalBestProgress\(store\.history, currentWindow\.startAtMs, positionValue\.returnPercent\)/);
  assert.match(componentSource, /positionValue && !positionValue\.usedFallbackPrice/);
  assert.match(componentSource, /testID="paper-event-personal-best-progress"/);
  assert.match(componentSource, /Share\.share/);
  assert.match(componentSource, /setEventNotifications\(value\)/);
  assert.match(componentSource, /Sharing\.shareAsync\(uri/);
  assert.match(componentSource, /share-paper-event-image-/);
  assert.match(cardSource, /MEISNER METHOD/);
  assert.match(cardSource, /EVENT RETURN/);
  assert.match(cardSource, /TradingFingerprintSection/);
  assert.match(componentSource, /TradingFingerprintSection/);
  assert.match(fingerprintSource, /YOUR TRADING FINGERPRINT/);
  assert.match(fingerprintSource, /backgroundColor: '#171A1F'/);
  assert.match(fingerprintSource, /borderColor: 'rgba\(205, 170, 91, 0\.42\)'/);
  assert.match(fingerprintSource, /flexDirection: 'row'/);
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
    { id: 'sell-aapl', accountId: 'event-account', symbol: 'AAPL', action: 'SELL', date: '2026-11-17T15:00:00.000Z', shares: 2, price: 150, total: 300, realizedPnL: 300, fee: 5 },
    { accountId: 'other-account', symbol: 'GOOG', action: 'SELL', date: '2026-11-17T15:00:00.000Z', realizedPnL: 9_000 },
    { accountId: 'event-account', symbol: 'MSFT', action: 'BUY', date: '2026-11-21T15:00:00.000Z' },
  ], Date.parse('2026-11-21T12:00:00.000Z'));

  assert.equal(summary.netProfit, 1_250);
  assert.equal(summary.returnPercent, 1.25);
  assert.equal(summary.tradeCount, 1);
  assert.equal(summary.sellCount, 1);
  assert.deepEqual(summary.symbolsTraded, ['AAPL']);
  assert.equal(summary.realizedPnL, 295);
  assert.deepEqual(summary.transactions, [{
    id: 'sell-aapl',
    symbol: 'AAPL',
    action: 'SELL',
    shares: 2,
    price: 150,
    total: 300,
    date: '2026-11-17T15:00:00.000Z',
    realizedPnL: 300,
    fee: 5,
  }]);
});

test('finalized summaries save the strongest observation and preserve it after reload', () => {
  const eventStartAtMs = Date.parse('2026-11-16T14:30:00.000Z');
  const eventEndAtMs = Date.parse('2026-11-20T21:00:00.000Z');
  const accountId = 'paper-event:2026-11-16';
  const enrollment = {
    eventId: '2026-11-16',
    eventType: 'event-arena' as const,
    eventStartAtMs,
    eventEndAtMs,
    joinedAtMs: eventStartAtMs,
    accountId,
    accountName: 'Event Portfolio',
    startEquity: 100_000,
  };
  const summary = buildPaperChallengeSummary(enrollment, 100_060, [
    { id: 'sell-a', accountId, symbol: 'AAA', action: 'SELL', date: '2026-11-17T10:00:00.000Z', shares: 1, price: 110, total: 110, realizedPnL: 10 },
    { id: 'sell-b', accountId, symbol: 'BBB', action: 'SELL', date: '2026-11-18T10:00:00.000Z', shares: 1, price: 120, total: 120, realizedPnL: 20 },
    { id: 'sell-c', accountId, symbol: 'CCC', action: 'SELL', date: '2026-11-19T10:00:00.000Z', shares: 1, price: 130, total: 130, realizedPnL: 30 },
    { id: 'other-account-sell', accountId: 'paper-event:other', symbol: 'ZZZ', action: 'SELL', date: '2026-11-19T10:00:00.000Z', shares: 1, price: 1, total: 1, realizedPnL: 90_000 },
    { id: 'other-round-sell', accountId, symbol: 'YYY', action: 'SELL', date: '2026-11-19T10:00:00.000Z', shares: 1, price: 1, total: 1, realizedPnL: 80_000, lightningRoundEventId: 'lightning-other' },
  ], eventEndAtMs);

  assert.equal(summary.tradingFingerprintObservation?.observationId, 'positive-trade-consistency');
  assert.equal(summary.tradingFingerprintObservation?.evidence.positiveTradeCount, 3);
  assert.equal(summary.tradingFingerprintObservation?.evidence.realizedTradeCount, 3);
  assert.match(summary.tradingFingerprintObservation?.supportingSentence ?? '', /3 of 3 trades/);
  assert.deepEqual(summary.transactions?.map((transaction) => transaction.id), ['sell-a', 'sell-b', 'sell-c']);

  const completed = finalizePaperChallengeStore({ enrollment, history: [] }, summary, eventEndAtMs);
  const reloaded = normalizePaperChallengeStore(JSON.parse(JSON.stringify(completed)));
  const changedRetry = {
    ...summary,
    tradingFingerprintObservation: {
      ...summary.tradingFingerprintObservation!,
      headline: 'Changed after finalization',
    },
  };
  const retried = finalizePaperChallengeStore(
    { ...reloaded, enrollment },
    changedRetry,
    eventEndAtMs,
  );

  assert.deepEqual(
    retried.history[0]?.tradingFingerprintObservation,
    summary.tradingFingerprintObservation,
  );
});

test('Lightning Round summary excludes regular and other-round fills and stores the neutral fallback', () => {
  const eventStartAtMs = Date.parse('2026-11-20T14:30:00.000Z');
  const eventEndAtMs = eventStartAtMs + 24 * 60 * 60 * 1000;
  const accountId = 'paper-event:shared';
  const summary = buildPaperChallengeSummary({
    eventId: 'lightning-2026-11-20',
    eventType: 'lightning-round',
    eventStartAtMs,
    eventEndAtMs,
    joinedAtMs: eventStartAtMs,
    accountId,
    accountName: 'Shared Event Arena',
    startEquity: 100_000,
  }, 100_010, [
    { id: 'mandatory-enrollment-buy', accountId, symbol: 'AAA', action: 'BUY', date: new Date(eventStartAtMs + 1000).toISOString(), shares: 1, price: 100, total: 100, lightningRoundEventId: 'lightning-2026-11-20' },
    { id: 'round-close', accountId, symbol: 'AAA', action: 'SELL', date: new Date(eventStartAtMs + 2 * 60 * 60 * 1000).toISOString(), shares: 1, price: 110, total: 110, realizedPnL: 10, lightningRoundEventId: 'lightning-2026-11-20' },
    ...['a', 'b', 'c'].map((suffix, index) => ({
      id: `other-round-close-${suffix}`,
      accountId,
      symbol: `SYM${suffix.toUpperCase()}`,
      action: 'SELL' as const,
      date: new Date(eventStartAtMs + (index + 3) * 60 * 60 * 1000).toISOString(),
      shares: 1,
      price: 110,
      total: 110,
      realizedPnL: 100,
      lightningRoundEventId: 'lightning-other',
    })),
    { id: 'regular-account-close', accountId, symbol: 'REG', action: 'SELL', date: new Date(eventStartAtMs + 8 * 60 * 60 * 1000).toISOString(), shares: 1, price: 110, total: 110, realizedPnL: 10_000 },
  ], eventEndAtMs);

  assert.deepEqual(summary.transactions?.map((transaction) => transaction.id), [
    'mandatory-enrollment-buy',
    'round-close',
  ]);
  assert.equal(summary.tradeCount, 2);
  assert.equal(summary.tradingFingerprintObservation?.observationId, null);
  assert.equal(
    summary.tradingFingerprintObservation?.supportingSentence,
    TRADING_FINGERPRINT_NEUTRAL_FALLBACK,
  );
});

test('Trading Fingerprint is enabled only for the requested event formats', () => {
  for (const eventType of [
    'event-arena',
    'penny-stock-mayhem',
    'one-stock-challenge',
    'lightning-round',
  ] as const) {
    assert.equal(isTradingFingerprintEventType(eventType), true);
  }
  assert.equal(isTradingFingerprintEventType(undefined), true, 'legacy events default to Event Arena');
  assert.equal(isTradingFingerprintEventType('green-bull-championship'), false);
  assert.equal(isTradingFingerprintEventType('bear-market-mayhem'), false);
});

test('new event archive freezes only matching event observations and closing positions', () => {
  const eventStartAtMs = Date.parse('2026-11-16T14:30:00.000Z');
  const completedAtMs = Date.parse('2026-11-20T21:00:00.000Z');
  const accountId = 'paper-event:2026-11-16';
  const summary = buildPaperChallengeSummary({
    eventId: '2026-11-16',
    eventStartAtMs,
    eventEndAtMs: completedAtMs,
    joinedAtMs: eventStartAtMs,
    accountId,
    accountName: 'Event Portfolio',
    startEquity: 100_000,
  }, 101_250, [
    { id: 'event-sell', accountId, symbol: 'AAPL', action: 'SELL', date: '2026-11-18T15:00:00.000Z', shares: 2, price: 150, total: 300, realizedPnL: 20, fee: 1 },
    { id: 'other-sell', accountId: 'paper-event:2026-11-30', symbol: 'MSFT', action: 'SELL', date: '2026-11-18T15:00:00.000Z', shares: 1, price: 200, total: 200 },
  ], completedAtMs, {
    equityHistory: [
      { accountId, date: '2026-11-16T14:30:00.000Z', value: 100_000 },
      { accountId, date: '2026-11-19T16:00:00.000Z', value: 100_900 },
      { accountId: 'paper-event:2026-11-30', date: '2026-11-19T16:00:00.000Z', value: 500_000 },
      { accountId, date: '2026-11-21T16:00:00.000Z', value: 999_999 },
    ],
    finalPositions: [{
      symbol: 'AAPL',
      companyName: 'Apple Inc.',
      shares: 2,
      avgCost: 140,
      marketPrice: 150,
      marketValue: 300,
      unrealizedPnL: 20,
    }],
    finalRank: 4,
  });

  assert.deepEqual(summary.equityHistory, [
    { date: '2026-11-16T14:30:00.000Z', value: 100_000 },
    { date: '2026-11-19T16:00:00.000Z', value: 100_900 },
  ]);
  assert.deepEqual(summary.transactions?.map((transaction) => transaction.id), ['event-sell']);
  assert.deepEqual(summary.finalPositions, [{
    symbol: 'AAPL',
    companyName: 'Apple Inc.',
    shares: 2,
    avgCost: 140,
    marketPrice: 150,
    marketValue: 300,
    unrealizedPnL: 20,
  }]);
  assert.equal(summary.finalRank, 4);
  assert.equal(summary.endEquity, 101_250);
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
  const summary = {
    ...buildPaperChallengeSummary(enrollment, 101_000, [], Date.parse('2026-11-20T21:00:00.000Z')),
    equityHistory: [{ date: '2026-11-18T15:00:00.000Z', value: 100_500 }],
    finalPositions: [{
      symbol: 'AAPL',
      companyName: 'Apple Inc.',
      shares: 1,
      avgCost: 100,
      marketPrice: 101,
      marketValue: 101,
      unrealizedPnL: 1,
    }],
    finalRank: 4,
  };
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
    artworkId: 'stadium' as const,
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

test('a failed event-store read does not write over history and retry restores it', async () => {
  const enrollment = {
    eventId: '2026-11-16',
    artworkId: 'stadium' as const,
    eventStartAtMs: Date.parse('2026-11-16T14:30:00.000Z'),
    eventEndAtMs: Date.parse('2026-11-20T21:00:00.000Z'),
    joinedAtMs: Date.parse('2026-11-16T14:30:00.000Z'),
    accountId: 'paper-event:2026-11-16',
    accountName: 'Event Portfolio',
    startEquity: 100_000,
  };
  const previousSummary = buildPaperChallengeSummary(
    { ...enrollment, eventId: '2026-11-09', eventStartAtMs: enrollment.eventStartAtMs - 7 * 24 * 60 * 60 * 1000 },
    102_000,
    [],
    enrollment.eventEndAtMs - 7 * 24 * 60 * 60 * 1000,
  );
  const savedStore: PaperChallengeStore = { enrollment: null, history: [previousSummary] };
  let storedValue = JSON.stringify(savedStore);
  let failNextRead = true;
  let writes = 0;
  const storage = {
    getItem: async (key: string) => {
      assert.equal(key, PAPER_CHALLENGE_STORAGE_KEY);
      if (failNextRead) {
        failNextRead = false;
        throw new Error('Simulated AsyncStorage read failure');
      }
      return storedValue;
    },
    setItem: async (key: string, value: string) => {
      assert.equal(key, PAPER_CHALLENGE_STORAGE_KEY);
      writes += 1;
      storedValue = value;
    },
  };

  await assert.rejects(
    updatePaperChallengeStore((current) => ({ ...current, enrollment }), storage),
    /Simulated AsyncStorage read failure/,
  );
  assert.equal(writes, 0);
  assert.deepEqual(JSON.parse(storedValue), savedStore);

  const restored = await loadPaperChallengeStore(storage);
  assert.deepEqual(restored, savedStore);

  const joined = await updatePaperChallengeStore(
    (current) => ({ ...current, enrollment }),
    storage,
  );
  assert.deepEqual(
    joined.enrollment,
    normalizePaperChallengeStore({ enrollment, history: [] }).enrollment,
  );
  assert.deepEqual(joined.history, [previousSummary]);
  assert.deepEqual(JSON.parse(storedValue), joined);
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
  assert.match(screenSource, /nextState\.positions/);
});

test('expired enrollment remains saved until its event summary is finalized', async () => {
  const testDirectory = dirname(fileURLToPath(import.meta.url));
  const source = await readFile(resolve(testDirectory, '../../app/paper.tsx'), 'utf8');
  assert.doesNotMatch(source, /savePaperChallenge\(\{ enrollment: null, history: latestStore\.history \}\)/);
  assert.match(source, /await savePaperChallenge\(\(current\) =>\s*finalizePaperChallengeStore\(current, summary, challengeNow\)/);
  assert.match(source, /void pushEventArenaSnapshotRef\.current\(\{/);
  assert.match(source, /paper-event-results-pending/);
  assert.match(source, /retry-paper-event-results/);
});

test('upcoming signup withdrawal removes only enrollment and is locked at event start', () => {
  const eventStartAtMs = Date.parse('2026-11-30T14:30:00.000Z');
  const enrollment = {
    eventId: '2026-11-30',
    artworkId: 'neon-nightclub' as const,
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

test('failed upcoming signup withdrawal keeps enrollment saved and can be retried', async () => {
  const eventStartAtMs = Date.parse('2026-11-30T14:30:00.000Z');
  const enrollment = {
    eventId: '2026-11-30',
    artworkId: 'neon-nightclub' as const,
    eventStartAtMs,
    eventEndAtMs: Date.parse('2026-12-04T21:00:00.000Z'),
    joinedAtMs: eventStartAtMs - 60_000,
    accountId: 'paper-event:2026-11-30',
    accountName: 'Event Portfolio',
    startEquity: null,
  };
  const savedStore: PaperChallengeStore = { enrollment, history: [] };
  let storedValue = JSON.stringify(savedStore);
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
  const withdraw = () => updatePaperChallengeStore(
    (current) => withdrawUpcomingPaperChallenge(current, enrollment.eventId, eventStartAtMs - 1),
    storage,
  );

  await assert.rejects(withdraw(), /Simulated AsyncStorage write failure/);
  assert.deepEqual(JSON.parse(storedValue), savedStore);
  assert.deepEqual(await loadPaperChallengeStore(storage), normalizePaperChallengeStore(savedStore));

  const retried = await withdraw();
  assert.equal(retried.enrollment, null);
  assert.deepEqual(await loadPaperChallengeStore(storage), retried);
});

test('leaderboard opt-in stays in event enrollment and does not modify paper accounts', async () => {
  const eventId = '2026-11-16';
  const enrollment = {
    eventId,
    eventStartAtMs: Date.parse('2026-11-16T14:30:00.000Z'),
    eventEndAtMs: Date.parse('2026-11-20T21:00:00.000Z'),
    joinedAtMs: Date.parse('2026-11-16T14:30:00.000Z'),
    accountId: `paper-event:${eventId}`,
    accountName: 'Event Portfolio',
    startEquity: 100_000,
  };
  const regularPaperCache = {
    accounts: [{ id: 'paper-main', name: 'Main', cash: 81_000 }],
    positions: [{ accountId: 'paper-main', symbol: 'MSFT', shares: 4 }],
    transactions: [{ accountId: 'paper-main', symbol: 'MSFT', action: 'BUY' }],
  };
  const saved = new Map<string, string>([
    [PAPER_CHALLENGE_STORAGE_KEY, JSON.stringify({ enrollment, history: [] })],
    ['@stocksense/paper_v2', JSON.stringify(regularPaperCache)],
  ]);
  const storage = {
    getItem: async (key: string) => saved.get(key) ?? null,
    setItem: async (key: string, value: string) => { saved.set(key, value); },
  };

  const optedIn = await updatePaperChallengeStore((current) => ({
    ...current,
    enrollment: {
      ...current.enrollment!,
      leaderboardAlias: 'MarketFox',
      leaderboardOptedIn: true,
    },
  }), storage);
  assert.equal(optedIn.enrollment?.leaderboardAlias, 'MarketFox');
  assert.equal(optedIn.enrollment?.leaderboardOptedIn, true);
  assert.deepEqual(JSON.parse(saved.get('@stocksense/paper_v2')!), regularPaperCache);

  const optedOut = await updatePaperChallengeStore((current) => ({
    ...current,
    enrollment: {
      ...current.enrollment!,
      leaderboardOptedIn: false,
    },
  }), storage);
  assert.equal(optedOut.enrollment?.leaderboardOptedIn, false);
  assert.deepEqual(JSON.parse(saved.get('@stocksense/paper_v2')!), regularPaperCache);
});
