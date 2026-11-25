import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  canExecuteLightningRoundStagedOrder,
  cancelLightningRoundStagedOrders,
  getLightningRoundEventPortfolio,
  getLightningRoundEventTransactions,
  getLightningRoundPreparationOpensAt,
  getLightningRoundQueuedOrders,
  getLightningRoundStartEquityFromSnapshots,
  getOrCreateLightningEventArenaAccount,
  getReusableEventArenaAccountId,
  LIGHTNING_SHARED_EVENT_ARENA_ACCOUNT_ID,
  isLightningRoundPreparationOpen,
  isLightningRoundQualified,
  resetLightningSharedAccountSnapshot,
  shouldSyncLightningRoundPreparation,
  shouldOfferLightningRoundTradeEnrollment,
} from '../lightningRoundPreparation.ts';
import { ensurePaperChallengeAccount } from '../paperChallenge.ts';
import type { PaperOrder } from '../paperMath.ts';
import type { PaperChallengeEnrollment, PaperChallengeWindow } from '../paperChallenge.ts';

const eventStartAtMs = Date.parse('2026-11-20T16:00:00.000Z');
const eventEndAtMs = eventStartAtMs + 24 * 60 * 60 * 1000;
const accountId = 'paper-event:2026-11-16';
const eventId = 'lightning-2026-11-20';
const lightningWindow: PaperChallengeWindow = {
  id: eventId,
  startAtMs: eventStartAtMs,
  endAtMs: eventEndAtMs,
  phase: 'upcoming',
  eventType: 'lightning-round',
};

const enrollment: PaperChallengeEnrollment = {
  eventId,
  eventType: 'lightning-round',
  eventStartAtMs,
  eventEndAtMs,
  joinedAtMs: eventStartAtMs - 7 * 24 * 60 * 60 * 1000,
  accountId,
  accountName: 'Event Portfolio',
  startingBalance: 100_000,
  startEquity: 75_000,
};

function stagedOrder(id: string, overrides: Partial<PaperOrder> = {}): PaperOrder {
  return {
    id,
    accountId,
    lightningRoundEventId: eventId,
    symbol: 'AAPL',
    companyName: 'Apple',
    orderType: 'market',
    side: 'buy',
    shares: 5,
    status: 'pending',
    placedAt: new Date(eventStartAtMs - 1000).toISOString(),
    ...overrides,
  };
}

test('preparation opens at exactly 72 hours and closes before the official start', () => {
  const opensAt = getLightningRoundPreparationOpensAt(eventStartAtMs);
  assert.equal(opensAt, eventStartAtMs - 72 * 60 * 60 * 1000);
  assert.equal(isLightningRoundPreparationOpen(eventStartAtMs, opensAt - 1), false);
  assert.equal(isLightningRoundPreparationOpen(eventStartAtMs, opensAt), true);
  assert.equal(isLightningRoundPreparationOpen(eventStartAtMs, eventStartAtMs - 1), true);
  assert.equal(isLightningRoundPreparationOpen(eventStartAtMs, eventStartAtMs), false);
});

test('snapshot sync requires the matching Event Arena account and an open preparation window', () => {
  const opensAt = getLightningRoundPreparationOpensAt(eventStartAtMs);
  const args = {
    enrollmentAccountId: accountId,
    selectedAccountId: accountId,
    eventStartAtMs,
    nowMs: opensAt,
  };
  assert.equal(shouldSyncLightningRoundPreparation(args), true);
  assert.equal(shouldSyncLightningRoundPreparation({ ...args, selectedAccountId: 'paper-strategy-1' }), false);
  assert.equal(shouldSyncLightningRoundPreparation({ ...args, nowMs: opensAt - 1 }), false);
  assert.equal(shouldSyncLightningRoundPreparation({ ...args, nowMs: eventStartAtMs }), false);
});

test('trade-entry enrollment offer honors the official window, account, event, and enrollment', () => {
  const opensAt = getLightningRoundPreparationOpensAt(eventStartAtMs);
  const eligible = (nowMs: number, overrides: {
    accountId?: string;
    event?: PaperChallengeWindow;
    enrollment?: PaperChallengeEnrollment | null;
  } = {}) => shouldOfferLightningRoundTradeEnrollment({
    accountId: overrides.accountId ?? accountId,
    event: overrides.event ?? lightningWindow,
    nowMs,
    enrollment: overrides.enrollment,
  });

  assert.equal(eligible(opensAt - 1), false);
  assert.equal(eligible(opensAt), true);
  assert.equal(eligible(eventStartAtMs - 1), true);
  assert.equal(eligible(eventStartAtMs), false);
  assert.equal(eligible(opensAt, { enrollment }), false);
  assert.equal(eligible(opensAt, { accountId: 'paper-strategy-1' }), false);
  assert.equal(eligible(opensAt, { accountId: 'paper-lightning:lightning-2026-11-20' }), false);
  assert.equal(eligible(opensAt, {
    event: { ...lightningWindow, eventType: 'event-arena' },
  }), false);
  assert.equal(eligible(opensAt, {
    event: { ...lightningWindow, phase: 'active' },
  }), false);
});

test('qualification tracks multiple valid queued orders and ignores rejected or unrelated orders', () => {
  const orders = [
    stagedOrder('one'),
    stagedOrder('two', { symbol: 'MSFT', shares: 2 }),
    stagedOrder('cancelled', { status: 'cancelled' }),
    stagedOrder('rejected', { status: 'cancelled', rejectionReason: 'Insufficient buying power.' }),
    stagedOrder('other-event', { lightningRoundEventId: 'another-event' }),
    stagedOrder('other-account', { accountId: 'paper-event:another' }),
    stagedOrder('invalid', { shares: 0 }),
  ];
  assert.deepEqual(getLightningRoundQueuedOrders(orders, eventId, accountId).map((order) => order.id), ['one', 'two']);
  assert.equal(isLightningRoundQualified(orders, eventId, accountId), true);

  const afterEditingAndCancellingOne = orders
    .filter((order) => order.id !== 'one')
    .map((order) => order.id === 'two' ? { ...order, symbol: 'NVDA', shares: 3 } : order);
  assert.equal(isLightningRoundQualified(afterEditingAndCancellingOne, eventId, accountId), true);
  assert.equal(getLightningRoundQueuedOrders(afterEditingAndCancellingOne, eventId, accountId)[0]?.symbol, 'NVDA');

  const finalOrderRejected = afterEditingAndCancellingOne.map((order) =>
    order.id === 'two' ? { ...order, status: 'cancelled' as const, rejectionReason: 'Quote became unavailable.' } : order,
  );
  assert.equal(isLightningRoundQualified(finalOrderRejected, eventId, accountId), false);
  assert.equal(isLightningRoundQualified([
    stagedOrder('filled', { status: 'filled', filledPrice: 100 }),
  ], eventId, accountId), true);
});

test('Lightning Round history and portfolio require both the event and enrolled account', () => {
  const eventTrades = [
    {
      id: 'event-buy', accountId, lightningRoundEventId: eventId, symbol: 'AAPL',
      companyName: 'Apple', action: 'BUY' as const, shares: 10, price: 100, total: 1_000,
      date: new Date(eventStartAtMs).toISOString(),
    },
    {
      id: 'unrelated-buy', accountId, lightningRoundEventId: 'other-event', symbol: 'MSFT',
      companyName: 'Microsoft', action: 'BUY' as const, shares: 50, price: 200, total: 10_000,
      date: new Date(eventStartAtMs + 1_000).toISOString(),
    },
    {
      id: 'other-account-same-event', accountId: 'paper-event:other',
      lightningRoundEventId: eventId, symbol: 'TSLA',
      companyName: 'Tesla', action: 'BUY' as const, shares: 100, price: 300, total: 30_000,
      date: new Date(eventStartAtMs + 2_000).toISOString(),
    },
  ];
  assert.deepEqual(
    getLightningRoundEventTransactions(eventTrades, eventId, accountId).map((trade) => trade.id),
    ['event-buy'],
  );
  assert.deepEqual(
    getLightningRoundEventPortfolio(eventTrades, eventId, accountId, { AAPL: 120 }),
    {
      cashBalance: 99_000,
      equity: 100_200,
      tradeCount: 1,
      positions: [{ symbol: 'AAPL', companyName: 'Apple', shares: 10, avgCost: 100 }],
    },
  );
});

test('final unenrollment cancellation touches only this round’s staged orders', () => {
  const unrelated = stagedOrder('unrelated', { lightningRoundEventId: 'other-event' });
  const otherAccount = stagedOrder('other-account', { accountId: 'paper-event:other' });
  const orders = [stagedOrder('first'), stagedOrder('second'), unrelated, otherAccount];
  const cancelled = cancelLightningRoundStagedOrders(orders, eventId, accountId);
  assert.deepEqual(cancelled.slice(0, 2).map((order) => order.status), ['cancelled', 'cancelled']);
  assert.equal(cancelled[2], unrelated);
  assert.equal(cancelled[3], otherAccount);
});

test('staged orders become executable only for their enrolled account at event start', () => {
  const order = stagedOrder('ready');
  assert.equal(canExecuteLightningRoundStagedOrder(order, enrollment, eventStartAtMs - 1), false);
  assert.equal(canExecuteLightningRoundStagedOrder(order, enrollment, eventStartAtMs), true);
  assert.equal(canExecuteLightningRoundStagedOrder(order, enrollment, eventEndAtMs - 1), true);
  assert.equal(canExecuteLightningRoundStagedOrder(order, enrollment, eventEndAtMs), false);
  assert.equal(canExecuteLightningRoundStagedOrder(
    order,
    { ...enrollment, accountId: 'paper-event:another' },
    eventStartAtMs,
  ), false);
  assert.equal(canExecuteLightningRoundStagedOrder(
    { ...order, status: 'filled' },
    enrollment,
    eventStartAtMs,
  ), false);
  assert.equal(canExecuteLightningRoundStagedOrder(
    order,
    { ...enrollment, startEquity: null },
    eventStartAtMs,
  ), false);
});

test('missed starting equity uses a nearby saved account snapshot, not a seeded balance', () => {
  const snapshots = [
    { accountId, date: new Date(eventStartAtMs - 30 * 60 * 1000).toISOString(), value: 74_000 },
    { accountId: 'paper-event:other', date: new Date(eventStartAtMs + 1000).toISOString(), value: 20_000 },
    { accountId, date: new Date(eventStartAtMs + 90 * 1000).toISOString(), value: 75_500 },
    { accountId, date: new Date(eventStartAtMs - 2 * 60 * 60 * 1000).toISOString(), value: 70_000 },
  ];
  assert.equal(
    getLightningRoundStartEquityFromSnapshots(snapshots, accountId, eventStartAtMs, eventEndAtMs),
    75_500,
  );
  assert.equal(
    getLightningRoundStartEquityFromSnapshots(
      snapshots.slice(0, 1),
      accountId,
      eventStartAtMs,
      eventEndAtMs,
    ),
    74_000,
  );
  assert.equal(
    getLightningRoundStartEquityFromSnapshots(
      snapshots.slice(3),
      accountId,
      eventStartAtMs,
      eventEndAtMs,
    ),
    null,
  );
});

test('registration chooses an existing Event Arena account and never invents one', () => {
  const accounts = [
    { id: 'paper-event:2026-11-16', name: 'Event Portfolio', cash: 75_000, createdAt: '2026-11-16T00:00:00.000Z' },
    { id: 'tiger', name: 'Tiger', cash: 100_000, createdAt: '2026-10-01T00:00:00.000Z' },
  ];
  assert.equal(getReusableEventArenaAccountId({
    accounts,
    activeId: 'tiger',
    currentEventEnrollment: enrollment,
    history: [],
  }), 'paper-event:2026-11-16');
  assert.equal(getReusableEventArenaAccountId({
    accounts: [accounts[0]!],
    activeId: 'missing',
    history: [],
  }), accounts[0]!.id);
  assert.equal(getReusableEventArenaAccountId({
    accounts: [],
    history: [],
  }), null);
  assert.equal(getReusableEventArenaAccountId({
    accounts: [{ id: 'tiger', name: 'Tiger', cash: 100_000, createdAt: '2026-10-01T00:00:00.000Z' }],
    activeId: 'tiger',
    history: [],
  }), null);
});

test('first-time Lightning registration creates a shared Event Arena account, not a Lightning account', () => {
  const result = getOrCreateLightningEventArenaAccount({
    accounts: [{ id: 'strategy-1', name: 'Strategy 1', cash: 100_000, createdAt: '2026-10-01T00:00:00.000Z' }],
    activeId: 'strategy-1',
    history: [],
    nowMs: Date.parse('2026-11-24T14:00:00.000Z'),
    startingBalance: 250_000,
  });

  assert.equal(result.created, true);
  assert.deepEqual(result.account, {
    id: LIGHTNING_SHARED_EVENT_ARENA_ACCOUNT_ID,
    name: 'Event Arena',
    cash: 250_000,
    createdAt: '2026-11-24T14:00:00.000Z',
  });
  assert.match(result.account.id, /^paper-event:/);
  assert.doesNotMatch(result.account.id, /^paper-lightning:/);
});

test('Lightning registration preserves an existing Event Arena account balance and identity', () => {
  const existing = {
    id: 'paper-event:2026-11-16',
    name: 'Event Portfolio',
    cash: 83_500,
    createdAt: '2026-11-16T00:00:00.000Z',
  };
  const result = getOrCreateLightningEventArenaAccount({
    accounts: [existing],
    activeId: 'strategy-1',
    history: [],
    nowMs: Date.parse('2026-11-24T14:00:00.000Z'),
  });

  assert.equal(result.created, false);
  assert.equal(result.account, existing);
});

test('Lightning account reset starts with fresh buying power and removes only live data for that account', () => {
  const accountId = 'paper-event:2026-11-16';
  const eventId = 'lightning-2026-11-27';
  const otherAccountPosition = { accountId: 'paper-event:other' } as any;
  const oldPosition = { accountId } as any;
  const oldTrade = { accountId, action: 'BUY' } as any;
  const archivedLightningTrade = { accountId, lightningRoundEventId: 'lightning-2026-11-13' } as any;
  const currentLightningTrade = { accountId, lightningRoundEventId: eventId } as any;
  const oldOrder = { accountId } as any;
  const archivedLightningOrder = { accountId, lightningRoundEventId: 'lightning-2026-11-13' } as any;
  const currentLightningOrder = { accountId, lightningRoundEventId: eventId } as any;
  const oldLot = { accountId } as any;
  const oldSnapshot = { accountId } as any;
  const result = resetLightningSharedAccountSnapshot({
    account: {
      id: accountId,
      name: 'Old Event Portfolio',
      cash: 98.85,
      shortCollateral: 500,
      shortCollateralRatio: 1.7,
      unsettledItems: [{ amount: 50, settlesAt: '2026-11-28T00:00:00.000Z' }],
      createdAt: '2026-11-16T00:00:00.000Z',
    },
    positions: [oldPosition, otherAccountPosition],
    transactions: [oldTrade, archivedLightningTrade, currentLightningTrade],
    orders: [oldOrder, archivedLightningOrder, currentLightningOrder],
    lots: [oldLot],
    snapshots: [oldSnapshot],
    eventId,
    nowMs: Date.parse('2026-11-25T14:00:00.000Z'),
    startingBalance: 100_000,
  });

  assert.deepEqual(result.account, {
    id: accountId,
    name: 'Event Arena',
    cash: 100_000,
    shortCollateral: 0,
    shortCollateralRatio: 1.5,
    unsettledItems: [],
    createdAt: '2026-11-25T14:00:00.000Z',
  });
  assert.deepEqual(result.positions, [otherAccountPosition]);
  assert.deepEqual(result.transactions, [archivedLightningTrade]);
  assert.deepEqual(result.orders, [archivedLightningOrder]);
  assert.deepEqual(result.lots, []);
  assert.deepEqual(result.snapshots, []);
});

test('the next main event gets its normal fresh account instead of carrying over the shared Lightning account', () => {
  const shared = getOrCreateLightningEventArenaAccount({
    accounts: [{ id: 'strategy-1', name: 'Strategy 1', cash: 100_000, createdAt: '2026-10-01T00:00:00.000Z' }],
    activeId: 'strategy-1',
    history: [],
    nowMs: Date.parse('2026-11-24T14:00:00.000Z'),
  }).account;
  const mainStartAtMs = Date.parse('2026-11-30T14:30:00.000Z');
  const mainAccountId = 'paper-event:2026-11-30';
  const mainState = ensurePaperChallengeAccount({
    eventId: '2026-11-30',
    eventType: 'event-arena',
    startingBalance: 250_000,
    rankingDirection: 'highest-return',
    eventStartAtMs: mainStartAtMs,
    eventEndAtMs: mainStartAtMs + 5 * 24 * 60 * 60 * 1000,
    joinedAtMs: mainStartAtMs,
    accountId: mainAccountId,
    accountName: 'Event Portfolio',
    startEquity: null,
  }, {
    accounts: [shared],
    positions: [],
    transactions: [],
    orders: [],
    lots: [],
  });

  assert.notEqual(mainAccountId, shared.id);
  assert.equal(mainState.accounts.find((account) => account.id === mainAccountId)?.cash, 250_000);
  assert.equal(mainState.accounts.find((account) => account.id === shared.id)?.cash, 100_000);
  assert.deepEqual(mainState.positions, []);
  assert.deepEqual(mainState.transactions, []);
});

test('Paper Trading scopes Lightning Round status to its Event Arena account and supports explicit unenrollment', () => {
  const source = readFileSync('app/(tabs)/paper.tsx', 'utf8');
  assert.ok(source.includes('const lightningEnrollmentForDisplay = activeLightningEnrollment'));
  assert.ok(source.includes('shouldSyncLightningRoundPreparation({'));
  assert.ok(source.includes('enrollment.accountId !== activeId'));
  assert.ok(source.includes('LEAVE LIGHTNING ROUND'));
  assert.ok(source.includes('You will be removed from this competition and will need to enroll again if registration is still open.'));
  assert.ok(source.includes('KEEP ME ENROLLED'));
  assert.ok(source.includes('LEAVE EVENT'));
  assert.ok(source.includes('/leave`'));
});
