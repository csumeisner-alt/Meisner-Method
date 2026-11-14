import type { PaperAccount, PaperOrder, PaperPosition } from './paperMath.ts';

const PAPER_CACHE_KEY = '@stocksense/paper_v2';
const MAX_APPLIED_TRANSFER_IDS = 500;

export type EventCashReservation = {
  order: PaperOrder;
  amount: number;
};

export type EventCashTransferImpact = {
  availableCash: number;
  reservations: EventCashReservation[];
  cancelledOrders: PaperOrder[];
  reservedAfterTransfer: number;
};

type PaperCache = {
  accounts?: PaperAccount[];
  orders?: PaperOrder[];
  eventArenaAppliedTransferIds?: string[];
  [key: string]: unknown;
};

type TransferCacheStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

let transferCacheWriteQueue: Promise<void> = Promise.resolve();

function estimatePendingOrderPrice(order: PaperOrder, quotes: Record<string, number>): number {
  const quote = quotes[order.symbol];
  const fallback = Number.isFinite(quote) && quote > 0 ? quote : 0;
  if (order.orderType === 'limit') return order.limitPrice ?? fallback;
  if (order.orderType === 'stop') return order.stopPrice ?? fallback;
  if (order.orderType === 'stop_limit') return Math.max(order.limitPrice ?? fallback, order.stopPrice ?? fallback);
  if (order.orderType === 'trailing_stop') return order.trailPct != null
    ? fallback * (1 + order.trailPct / 100)
    : order.trailAbs != null
      ? fallback + order.trailAbs
      : fallback;
  return fallback;
}

export function getEventCashReservations(
  orders: PaperOrder[],
  positions: PaperPosition[],
  account: PaperAccount,
  quotes: Record<string, number>,
): EventCashReservation[] {
  return orders.flatMap((order) => {
    if (order.accountId !== account.id || order.status !== 'pending') return [];
    const price = estimatePendingOrderPrice(order, quotes);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(order.shares) || order.shares <= 0) return [];

    if (order.intent === 'short') {
      const ratio = order.shortCollateralRatio ?? account.shortCollateralRatio ?? 1.5;
      return [{ order, amount: order.shares * price * Math.max(0, ratio - 1) }];
    }
    if (order.intent === 'cover') {
      const position = positions.find((item) =>
        item.accountId === account.id && item.symbol === order.symbol && item.positionType === 'short',
      );
      const collateralPerShare = position?.collateralPerShare
        ?? (position ? position.avgCost * (account.shortCollateralRatio ?? 1.5) : 0);
      return [{ order, amount: Math.max(0, order.shares * price - order.shares * collateralPerShare) }];
    }
    if (order.side === 'buy') return [{ order, amount: order.shares * price }];
    return [];
  }).filter((reservation) => Number.isFinite(reservation.amount) && reservation.amount > 0);
}

export function getEventCashTransferImpact(
  account: PaperAccount | null | undefined,
  orders: PaperOrder[],
  positions: PaperPosition[],
  amount: number,
  quotes: Record<string, number> = {},
): EventCashTransferImpact {
  const cash = account && Number.isFinite(account.cash) ? Math.max(0, account.cash) : 0;
  const reservations = account ? getEventCashReservations(orders, positions, account, quotes) : [];
  let reservedAfterTransfer = reservations.reduce((sum, item) => sum + item.amount, 0);
  const cashAfterTransfer = cash - amount;
  const cancelledOrders: PaperOrder[] = [];
  if (cashAfterTransfer < reservedAfterTransfer) {
    const newestFirst = [...reservations].sort((a, b) =>
      Date.parse(b.order.placedAt) - Date.parse(a.order.placedAt),
    );
    for (const reservation of newestFirst) {
      if (reservedAfterTransfer <= cashAfterTransfer + 1e-8) break;
      cancelledOrders.push(reservation.order);
      reservedAfterTransfer -= reservation.amount;
    }
  }
  return {
    availableCash: cash,
    reservations,
    cancelledOrders,
    reservedAfterTransfer: Math.max(0, reservedAfterTransfer),
  };
}

export async function applyEventCashTransfer(
  args: {
    accountId: string;
    transferId: string;
    amount: number;
    direction: 'sent' | 'received';
    cancelledOrderIds?: string[];
  },
  storage: TransferCacheStorage,
): Promise<{ applied: boolean; cash: number }> {
  const operation = transferCacheWriteQueue.then(async () => {
    const raw = await storage.getItem(PAPER_CACHE_KEY);
    if (!raw) throw new Error('The event account cache is unavailable.');
    const cache = JSON.parse(raw) as PaperCache;
    const account = cache.accounts?.find((item) => item.id === args.accountId);
    if (!account || !Number.isFinite(account.cash)) throw new Error('The event account is unavailable.');

    const appliedIds = Array.isArray(cache.eventArenaAppliedTransferIds)
      ? cache.eventArenaAppliedTransferIds.filter((id): id is string => typeof id === 'string')
      : [];
    if (appliedIds.includes(args.transferId)) return { applied: false, cash: account.cash };

    const cashDelta = args.direction === 'sent' ? -args.amount : args.amount;
    if (!Number.isFinite(args.amount) || args.amount <= 0 || account.cash + cashDelta < -1e-8) {
      throw new Error('The event account does not have enough cash for this transfer.');
    }
    const cancelled = new Set(args.cancelledOrderIds ?? []);
    const orders = Array.isArray(cache.orders) ? cache.orders : [];
    const nextOrders = cancelled.size === 0 ? orders : orders.map((order) =>
      order.accountId === args.accountId && order.status === 'pending' && cancelled.has(order.id)
        ? { ...order, status: 'cancelled' as const }
        : order,
    );
    const nextAppliedIds = [...appliedIds, args.transferId].slice(-MAX_APPLIED_TRANSFER_IDS);
    const nextCash = Math.max(0, account.cash + cashDelta);
    await storage.setItem(PAPER_CACHE_KEY, JSON.stringify({
      ...cache,
      accounts: cache.accounts?.map((item) => item.id === args.accountId ? { ...item, cash: nextCash } : item),
      orders: nextOrders,
      eventArenaAppliedTransferIds: nextAppliedIds,
    }));
    return { applied: true, cash: nextCash };
  });
  transferCacheWriteQueue = operation.then(() => undefined, () => undefined);
  return operation;
}
