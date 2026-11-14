import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyEventCashTransfer,
  getEventCashReservations,
  getEventCashTransferImpact,
} from '../eventArenaTransfers.ts';
import type { PaperAccount, PaperOrder, PaperPosition } from '../paperMath.ts';

const eventAccount: PaperAccount = {
  id: 'paper-event:2026-11-16',
  name: 'Event Portfolio',
  cash: 1_000,
  createdAt: '2026-11-16T14:30:00.000Z',
};
const eventPosition: PaperPosition = {
  id: 'event-short',
  accountId: eventAccount.id,
  symbol: 'TSLA',
  companyName: 'Tesla',
  shares: 4,
  avgCost: 100,
  sector: 'Technology',
  positionType: 'short',
  collateralPerShare: 150,
  openedAt: '2026-11-17T14:00:00.000Z',
  dividendYield: 0,
};
const order = (overrides: Partial<PaperOrder>): PaperOrder => ({
  id: 'order',
  accountId: eventAccount.id,
  symbol: 'AAPL',
  companyName: 'Apple',
  orderType: 'limit',
  side: 'buy',
  shares: 1,
  limitPrice: 100,
  status: 'pending',
  placedAt: '2026-11-18T14:00:00.000Z',
  ...overrides,
});

test('event cash reservations include only pending cash-backed event orders', () => {
  const reservations = getEventCashReservations([
    order({ id: 'buy', shares: 2, limitPrice: 100 }),
    order({ id: 'short', side: 'sell', intent: 'short', shares: 2, limitPrice: 100 }),
    order({ id: 'cover', side: 'buy', intent: 'cover', symbol: 'TSLA', shares: 2, limitPrice: 120 }),
    order({ id: 'sell', side: 'sell', symbol: 'AAPL', limitPrice: 90 }),
    order({ id: 'other-account', accountId: 'paper-main' }),
    order({ id: 'filled', status: 'filled' }),
  ], [eventPosition], eventAccount, {});
  assert.deepEqual(reservations.map(({ order: item, amount }) => [item.id, amount]), [
    ['buy', 200],
    ['short', 100],
  ]);
});

test('cash transfer plans cancel the fewest underfunded reservations newest first', () => {
  const orders = [
    order({ id: 'older', shares: 2, limitPrice: 100, placedAt: '2026-11-18T13:00:00.000Z' }),
    order({ id: 'newer', shares: 3, limitPrice: 100, placedAt: '2026-11-18T15:00:00.000Z' }),
  ];
  const impact = getEventCashTransferImpact(eventAccount, orders, [], 600);
  assert.equal(impact.availableCash, 1_000);
  assert.deepEqual(impact.cancelledOrders.map((item) => item.id), ['newer']);
  assert.equal(impact.reservedAfterTransfer, 200);
  assert.equal(getEventCashTransferImpact(eventAccount, orders, [], 100).cancelledOrders.length, 0);
  assert.equal(getEventCashTransferImpact(eventAccount, orders, [], 1_001).availableCash, 1_000);
});

test('transfer application changes only the event account and is idempotent', async () => {
  const cache = {
    accounts: [
      { ...eventAccount },
      { id: 'paper-main', name: 'Main', cash: 5_000, createdAt: '2026-01-01T00:00:00.000Z' },
    ],
    positions: [{ ...eventPosition }],
    transactions: [{ id: 'main-trade', accountId: 'paper-main' }],
    orders: [
      order({ id: 'event-pending' }),
      order({ id: 'main-pending', accountId: 'paper-main' }),
    ],
  };
  let stored = JSON.stringify(cache);
  const storage = {
    async getItem(key: string) {
      assert.equal(key, '@stocksense/paper_v2');
      return stored;
    },
    async setItem(_key: string, value: string) { stored = value; },
  };

  const sent = await applyEventCashTransfer({
    accountId: eventAccount.id,
    transferId: 'transfer-123456',
    amount: 250,
    direction: 'sent',
    cancelledOrderIds: ['event-pending'],
  }, storage);
  assert.deepEqual(sent, { applied: true, cash: 750 });
  const duplicate = await applyEventCashTransfer({
    accountId: eventAccount.id,
    transferId: 'transfer-123456',
    amount: 250,
    direction: 'sent',
    cancelledOrderIds: ['event-pending'],
  }, storage);
  assert.deepEqual(duplicate, { applied: false, cash: 750 });

  const saved = JSON.parse(stored);
  assert.equal(saved.accounts.find((item: any) => item.id === 'paper-main').cash, 5_000);
  assert.equal(saved.orders.find((item: any) => item.id === 'event-pending').status, 'cancelled');
  assert.equal(saved.orders.find((item: any) => item.id === 'main-pending').status, 'pending');
  assert.deepEqual(saved.positions, cache.positions);
  assert.deepEqual(saved.transactions, cache.transactions);

  const received = await applyEventCashTransfer({
    accountId: eventAccount.id,
    transferId: 'incoming-transfer-1',
    amount: 75,
    direction: 'received',
  }, storage);
  assert.deepEqual(received, { applied: true, cash: 825 });
});
