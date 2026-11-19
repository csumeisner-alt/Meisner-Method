import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildEventArenaPreloadState,
  eventArenaPreloadSymbols,
  refreshEventArenaQuotes,
} from '../eventArenaPreload.ts';
import type { EventArenaAccountData } from '../eventArenaHome.ts';
import type { LiveQuote, PaperAccount, PaperPosition } from '../paperMath.ts';
import type {
  PaperChallengeEnrollment,
  PaperChallengeStore,
  PaperChallengeSummary,
  PaperChallengeWindow,
} from '../paperChallenge.ts';

const day = '2026-11-19T15:00:00.000Z';

function account(id: string, cash: number): PaperAccount {
  return { id, name: id, cash, createdAt: day };
}

function position(id: string, accountId: string, symbol: string, shares: number): PaperPosition {
  return {
    id,
    accountId,
    symbol,
    companyName: symbol,
    shares,
    avgCost: 100,
    openedAt: day,
    dividendYield: 0,
    sector: 'Technology',
  };
}

function enrollment(
  eventId: string,
  accountId: string,
  startEquity: number | null,
  eventType: PaperChallengeEnrollment['eventType'] = 'event-arena',
): PaperChallengeEnrollment {
  return {
    eventId,
    eventType,
    artworkId: eventType === 'lightning-round' ? 'lightning-round-arena' : 'stadium',
    startingBalance: 100_000,
    rankingDirection: 'highest-return',
    eventStartAtMs: 1_000,
    eventEndAtMs: 3_000,
    joinedAtMs: 1_000,
    accountId,
    accountName: accountId,
    startEquity,
    leaderboardAlias: 'Trader',
    leaderboardOptedIn: true,
  };
}

function window(id: string, startAtMs: number, endAtMs: number, phase: PaperChallengeWindow['phase']): PaperChallengeWindow {
  return { id, startAtMs, endAtMs, phase, eventType: 'event-arena', startingBalance: 100_000, rankingDirection: 'highest-return' };
}

function quote(price: number, fetchedAtMs: number): LiveQuote {
  return { price, change: 1, pct: 1, fetchedAtMs };
}

const emptyStore: PaperChallengeStore = { enrollment: null, lightningEnrollment: null, history: [] };

function accountData(overrides: Partial<EventArenaAccountData> = {}): EventArenaAccountData {
  return {
    accounts: [],
    positions: [],
    transactions: [],
    orders: [],
    snapshots: [],
    ...overrides,
  };
}

test('active preload keeps regular and Lightning Round accounts isolated', () => {
  const regular = enrollment('event-active', 'paper-event:event-active', 100_000);
  const lightning = enrollment('lightning-2026-11-20', 'paper-lightning:lightning-2026-11-20', 100_000, 'lightning-round');
  const state = buildEventArenaPreloadState({
    store: { enrollment: regular, lightningEnrollment: lightning, history: [] },
    accountData: accountData({
      accounts: [
        account(regular.accountId, 99_900),
        account(lightning.accountId, 90_000),
        account('paper-strategy-1', 50_000),
      ],
      positions: [
        position('regular-position', regular.accountId, 'AAA', 1),
        position('lightning-position', lightning.accountId, 'BBB', 2),
        position('strategy-position', 'paper-strategy-1', 'CCC', 10),
      ],
      transactions: [
        { id: 'regular-trade', accountId: regular.accountId, symbol: 'AAA', companyName: 'AAA', action: 'BUY', shares: 1, price: 100, total: 100, date: day },
        { id: 'lightning-trade', accountId: lightning.accountId, symbol: 'BBB', companyName: 'BBB', action: 'BUY', shares: 2, price: 100, total: 200, date: day, lightningRoundEventId: lightning.eventId },
      ],
      snapshots: [
        { accountId: regular.accountId, date: day, value: 100_000 },
        { accountId: lightning.accountId, date: day, value: 90_200 },
      ],
    }),
    quotes: { AAA: quote(110, 10), BBB: quote(120, 10), CCC: quote(20, 10) },
    currentEvent: window('event-active', 1_000, 3_000, 'active'),
    lightningWindow: window(lightning.eventId, 2_000, 4_000, 'upcoming'),
    nowMs: 2_000,
  });

  assert.equal(state.ready, true);
  assert.equal(state.participation, 'joined');
  assert.equal(state.countdown?.mode, 'ends');
  assert.equal(state.store.enrollment?.accountId, regular.accountId);
  assert.equal(state.store.lightningEnrollment?.accountId, lightning.accountId);
  assert.deepEqual(state.accountData.accounts.map((item) => item.id), [regular.accountId, lightning.accountId]);
  assert.deepEqual(state.accountData.positions.map((item) => item.accountId), [regular.accountId, lightning.accountId]);
  assert.deepEqual(eventArenaPreloadSymbols(state), ['AAA', 'BBB']);
  assert.equal(state.performance?.account?.id, regular.accountId);
  assert.equal(state.performance?.buyingPower, 99_900);
  assert.equal(state.performance?.equity, 100_010);
  assert.equal(state.performance?.profitLoss, 10);
  assert.equal(state.performance?.positions[0]?.accountId, regular.accountId);
});

test('Event Arena preload rejects account records whose IDs belong to another event', () => {
  const current = enrollment('event-active', 'paper-event:event-active', 100_000);
  const state = buildEventArenaPreloadState({
    store: { ...emptyStore, enrollment: current },
    accountData: accountData({
      accounts: [
        account(current.accountId, 90_000),
        account('paper-event:event-other', 80_000),
      ],
      positions: [
        position('current-position', current.accountId, 'AAA', 1),
        position('other-position', 'paper-event:event-other', 'BBB', 1),
      ],
      transactions: [
        { id: 'other-trade', accountId: 'paper-event:event-other', symbol: 'BBB', companyName: 'BBB', action: 'BUY', shares: 1, price: 100, total: 100, date: day },
      ],
    }),
    quotes: { AAA: quote(110, 10), BBB: quote(120, 10) },
    currentEvent: window('event-active', 1_000, 3_000, 'active'),
    lightningWindow: null,
    nowMs: 2_000,
  });

  assert.deepEqual(state.accountData.accounts.map((item) => item.id), [current.accountId]);
  assert.deepEqual(state.accountData.positions.map((item) => item.id), ['current-position']);
  assert.deepEqual(state.accountData.transactions, []);
  assert.deepEqual(Object.keys(state.quotes), ['AAA']);
});

test('upcoming enrollment loads registration and countdown without creating its event account', () => {
  const upcoming = enrollment('event-upcoming', 'paper-event:event-upcoming', null);
  const state = buildEventArenaPreloadState({
    store: { ...emptyStore, enrollment: upcoming },
    accountData: accountData({ accounts: [account('paper-strategy-1', 100_000)] }),
    quotes: {},
    currentEvent: window('event-upcoming', 5_000, 8_000, 'upcoming'),
    lightningWindow: null,
    nowMs: 4_000,
  });

  assert.equal(state.store.enrollment?.startEquity, null);
  assert.equal(state.participation, 'joined');
  assert.equal(state.countdown?.mode, 'starts');
  assert.equal(state.performance?.account, null);
  assert.equal(state.performance?.equity, null);
  assert.deepEqual(state.accountData.accounts, []);
});

test('completed event preload keeps its result history and ended status', () => {
  const completed: PaperChallengeSummary = {
    ...enrollment('event-completed', 'paper-event:event-completed', 100_000),
    startEquity: 100_000,
    startingBalance: 100_000,
    endEquity: 101_500,
    returnPercent: 1.5,
    netProfit: 1_500,
    tradeCount: 2,
    buyCount: 1,
    sellCount: 1,
    symbolsTraded: ['AAA'],
    realizedPnL: 1_500,
    completedAtMs: 4_000,
  };
  const state = buildEventArenaPreloadState({
    store: { ...emptyStore, enrollment: completed, history: [completed] },
    accountData: accountData({
      accounts: [account(completed.accountId, 101_500)],
      positions: [position('completed-position', completed.accountId, 'AAA', 0)],
    }),
    quotes: {},
    currentEvent: window('event-completed', 1_000, 3_000, 'ended'),
    lightningWindow: null,
    nowMs: 4_000,
  });

  assert.equal(state.participation, 'joined');
  assert.equal(state.countdown?.mode, 'ended');
  assert.equal(state.store.history[0]?.eventId, 'event-completed');
  assert.equal(state.accountData.accounts[0]?.id, completed.accountId);
});

test('quote refresh runs distinct symbols concurrently and retains good cached prices on failure', async () => {
  const cached = { BBB: quote(80, 10) };
  const requested: string[] = [];
  let active = 0;
  let maxActive = 0;
  const result = await refreshEventArenaQuotes(['AAA', 'BBB', 'AAA'], cached, async (symbol) => {
    requested.push(symbol);
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    if (symbol === 'BBB') throw new Error('temporarily unavailable');
    return quote(110, 20);
  });

  assert.deepEqual([...requested].sort(), ['AAA', 'BBB']);
  assert.ok(maxActive > 1);
  assert.equal(result.quotes.AAA.price, 110);
  assert.equal(result.quotes.BBB.price, 80);
  assert.deepEqual(result.failedSymbols, ['BBB']);
});

test('quote refresh can force a provider request after foreground return', async () => {
  const forceFlags: boolean[] = [];
  const result = await refreshEventArenaQuotes(['AAA'], {}, async (_symbol, forceRefresh) => {
    forceFlags.push(forceRefresh ?? false);
    return quote(110, 20);
  }, true);
  assert.deepEqual(forceFlags, [true]);
  assert.deepEqual(result.failedSymbols, []);
});

test('slower Event Arena quote responses cannot replace a newer observation', async () => {
  const result = await refreshEventArenaQuotes(['AAA'], {
    AAA: quote(150, 20),
  }, async () => quote(120, 10));

  assert.equal(result.quotes.AAA.price, 150);
  assert.deepEqual(result.failedSymbols, []);
});
