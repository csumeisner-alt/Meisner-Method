import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildEventArenaDeviceSnapshot,
  mergeEventArenaDeviceSnapshot,
  type PaperCacheState,
} from '../eventArenaDeviceSync.ts';
import type { PaperChallengeStore } from '../paperChallenge.ts';

const challengeStore: PaperChallengeStore = {
  enrollment: null,
  lightningEnrollment: null,
  history: [],
};

const account = (id: string, cash: number) => ({
  id,
  name: id,
  cash,
  createdAt: '2026-11-16T00:00:00.000Z',
});

const cache: PaperCacheState = {
  accounts: [account('paper-event:2026-11-16', 91_000), account('personal', 8_000)],
  positions: [
    { id: 'event-position', accountId: 'paper-event:2026-11-16', symbol: 'AAPL', companyName: 'Apple', shares: 2, avgCost: 100, openedAt: '2026-11-16T00:00:00.000Z', dividendYield: 0, sector: 'Tech' },
    { id: 'personal-position', accountId: 'personal', symbol: 'MSFT', companyName: 'Microsoft', shares: 1, avgCost: 100, openedAt: '2026-11-16T00:00:00.000Z', dividendYield: 0, sector: 'Tech' },
  ],
  transactions: [
    { id: 'event-trade', accountId: 'paper-event:2026-11-16', symbol: 'AAPL', companyName: 'Apple', action: 'BUY', shares: 2, price: 100, total: 200, date: '2026-11-16T00:00:00.000Z', lightningRoundEventId: 'lightning-2026-11-20' },
    { id: 'personal-trade', accountId: 'personal', symbol: 'MSFT', companyName: 'Microsoft', action: 'BUY', shares: 1, price: 100, total: 100, date: '2026-11-16T00:00:00.000Z' },
  ],
  orders: [
    { id: 'staged-order', accountId: 'paper-event:2026-11-16', symbol: 'AAPL', companyName: 'Apple', orderType: 'market', side: 'buy', shares: 2, status: 'pending', placedAt: '2026-11-16T00:00:00.000Z', lightningRoundEventId: 'lightning-2026-11-20' },
  ],
  lots: [],
  activeId: 'personal',
};

test('device snapshot includes only Event Arena accounts and keeps Lightning Round tags', () => {
  const snapshot = buildEventArenaDeviceSnapshot(cache, challengeStore, 'installation-id-123456');
  assert.deepEqual(snapshot.accounts.map((item) => item.id), ['paper-event:2026-11-16']);
  assert.deepEqual(snapshot.positions.map((item) => item.id), ['event-position']);
  assert.deepEqual(snapshot.transactions.map((item) => item.id), ['event-trade']);
  assert.equal(snapshot.transactions[0]?.lightningRoundEventId, 'lightning-2026-11-20');
  assert.equal(snapshot.orders[0]?.lightningRoundEventId, 'lightning-2026-11-20');
  assert.equal('activeId' in snapshot, false);
});

test('restore keeps personal accounts and does not reset a queued Lightning Round order', () => {
  const remote = buildEventArenaDeviceSnapshot(cache, challengeStore, 'installation-id-123456');
  remote.accounts[0] = account('paper-event:2026-11-16', 87_000);
  remote.orders[0] = { ...remote.orders[0]!, status: 'filled', filledPrice: 102, filledAt: '2026-11-20T15:00:00.000Z' };
  const restored = mergeEventArenaDeviceSnapshot(
    { ...cache, accounts: [account('personal', 8_000)], positions: [], transactions: [], orders: [], lots: [] },
    challengeStore,
    remote,
  );
  assert.deepEqual(restored.cache.accounts.map((item) => item.id).sort(), ['paper-event:2026-11-16', 'personal']);
  assert.equal(restored.cache.accounts.find((item) => item.id === 'paper-event:2026-11-16')?.cash, 87_000);
  assert.equal(restored.cache.orders.find((item) => item.id === 'staged-order')?.status, 'filled');
  assert.equal(restored.cache.orders.find((item) => item.id === 'staged-order')?.lightningRoundEventId, 'lightning-2026-11-20');
  assert.equal(restored.cache.positions.some((item) => item.accountId === 'personal'), false);
});

test('restore refuses to replace a different local copy of the same Event Arena account', () => {
  const remote = buildEventArenaDeviceSnapshot(cache, challengeStore, 'installation-id-123456');
  const local = {
    ...cache,
    accounts: [account('paper-event:2026-11-16', 80_000), account('personal', 8_000)],
  };
  assert.throws(
    () => mergeEventArenaDeviceSnapshot(local, challengeStore, remote, { protectConflicts: true }),
    /local data was left unchanged/,
  );
  assert.equal(local.accounts[0]?.cash, 80_000);
});

test('merging preserves a local active enrollment when the shared snapshot omits it', () => {
  const localEnrollment: NonNullable<PaperChallengeStore['enrollment']> = {
    eventId: '2026-11-16',
    eventType: 'event-arena',
    eventStartAtMs: 1_800_000_000_000,
    eventEndAtMs: 1_800_086_400_000,
    joinedAtMs: 1_799_000_000_000,
    accountId: 'paper-event:2026-11-16',
    accountName: 'Event Arena',
    startEquity: 100_000,
    leaderboardOptedIn: false,
  };
  const localStore: PaperChallengeStore = { ...challengeStore, enrollment: localEnrollment };
  const remote = buildEventArenaDeviceSnapshot(cache, challengeStore, 'installation-id-123456');
  const merged = mergeEventArenaDeviceSnapshot(cache, localStore, remote);
  assert.equal(merged.challengeStore.enrollment?.eventId, localEnrollment.eventId);
});
