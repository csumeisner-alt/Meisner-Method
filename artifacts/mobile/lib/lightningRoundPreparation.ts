import type {
  PaperAccount,
  PaperAccountValueSnapshot,
  PaperOrder,
  PaperTransaction,
} from './paperMath.ts';
import type {
  PaperChallengeEnrollment,
  PaperChallengeSummary,
  PaperChallengeWindow,
} from './paperChallenge.ts';

export const LIGHTNING_ROUND_PREPARATION_WINDOW_MS = 72 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** Pick an already-existing Event Arena account, never create a Lightning account. */
export function getReusableEventArenaAccountId(args: {
  accounts: PaperAccount[];
  activeId?: string;
  currentEventEnrollment?: PaperChallengeEnrollment | null;
  history: PaperChallengeSummary[];
}): string | null {
  const accountIds = new Set(args.accounts.map((account) => account.id));
  if (args.currentEventEnrollment
    && args.currentEventEnrollment.eventType !== 'lightning-round'
    && accountIds.has(args.currentEventEnrollment.accountId)) {
    return args.currentEventEnrollment.accountId;
  }
  const latestHistoricalEvent = [...args.history]
    .filter((event) => event.eventType !== 'lightning-round' && accountIds.has(event.accountId))
    .sort((left, right) => right.eventStartAtMs - left.eventStartAtMs)[0];
  if (latestHistoricalEvent) return latestHistoricalEvent.accountId;
  const existingEventAccount = [...args.accounts]
    .filter((account) => account.id.startsWith('paper-event:'))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0];
  if (existingEventAccount) return existingEventAccount.id;
  return args.activeId && accountIds.has(args.activeId) ? args.activeId : args.accounts[0]?.id ?? null;
}

/** Recover a missed start baseline from the closest persisted account snapshot. */
export function getLightningRoundStartEquityFromSnapshots(
  snapshots: PaperAccountValueSnapshot[],
  accountId: string,
  startAtMs: number,
  endAtMs: number,
): number | null {
  const eligible = snapshots
    .filter((snapshot) => snapshot.accountId === accountId && Number.isFinite(snapshot.value))
    .map((snapshot) => ({ ...snapshot, timestamp: Date.parse(snapshot.date) }))
    .filter((snapshot) => Number.isFinite(snapshot.timestamp)
      && snapshot.timestamp >= startAtMs - HOUR_MS
      && snapshot.timestamp <= endAtMs)
    .sort((left, right) => left.timestamp - right.timestamp);
  const firstAtOrAfterStart = eligible.find((snapshot) => snapshot.timestamp >= startAtMs);
  const nearestBeforeStart = eligible.filter((snapshot) => snapshot.timestamp < startAtMs).at(-1);
  const baseline = firstAtOrAfterStart ?? nearestBeforeStart;
  return baseline && baseline.value > 0 ? baseline.value : null;
}

export function getLightningRoundPreparationOpensAt(eventStartAtMs: number): number {
  return eventStartAtMs - LIGHTNING_ROUND_PREPARATION_WINDOW_MS;
}

/** The preparation window includes its opening instant and ends before the start. */
export function isLightningRoundPreparationOpen(eventStartAtMs: number, nowMs: number): boolean {
  return Number.isFinite(eventStartAtMs)
    && Number.isFinite(nowMs)
    && nowMs >= getLightningRoundPreparationOpensAt(eventStartAtMs)
    && nowMs < eventStartAtMs;
}

/** Offer enrollment only from the existing Event Arena account during an eligible Lightning Round's preparation window. */
export function shouldOfferLightningRoundTradeEnrollment(args: {
  accountId: string;
  event: PaperChallengeWindow;
  nowMs: number;
  enrollment?: PaperChallengeEnrollment | null;
}): boolean {
  return args.accountId.startsWith('paper-event:')
    && args.event.eventType === 'lightning-round'
    && args.event.phase === 'upcoming'
    && args.enrollment?.eventId !== args.event.id
    && isLightningRoundPreparationOpen(args.event.startAtMs, args.nowMs);
}

export function isLightningRoundStagedOrder(
  order: PaperOrder,
  eventId?: string,
): boolean {
  return typeof order.lightningRoundEventId === 'string'
    && order.lightningRoundEventId.length > 0
    && (eventId === undefined || order.lightningRoundEventId === eventId);
}

export function canExecuteLightningRoundStagedOrder(
  order: PaperOrder,
  enrollment: PaperChallengeEnrollment | null | undefined,
  nowMs: number,
): boolean {
  return !!enrollment
    && isLightningRoundStagedOrder(order, enrollment.eventId)
    && order.accountId === enrollment.accountId
    && order.status === 'pending'
    && order.orderType === 'market'
    && order.side === 'buy'
    && nowMs >= enrollment.eventStartAtMs
    && nowMs < enrollment.eventEndAtMs
    && enrollment.startEquity !== null;
}

export function getLightningRoundQueuedOrders(
  orders: PaperOrder[],
  eventId: string,
  accountId: string,
): PaperOrder[] {
  return orders.filter((order) =>
    order.accountId === accountId
    && order.lightningRoundEventId === eventId
    && order.status === 'pending'
    && order.orderType === 'market'
    && order.side === 'buy'
    && !order.intent
    && typeof order.symbol === 'string'
    && order.symbol.trim().length > 0
    && Number.isFinite(order.shares)
    && order.shares > 0,
  );
}

export function isLightningRoundQualified(
  orders: PaperOrder[],
  eventId: string,
  accountId: string,
): boolean {
  return orders.some((order) =>
    order.accountId === accountId
    && order.lightningRoundEventId === eventId
    && order.status === 'filled',
  ) || getLightningRoundQueuedOrders(orders, eventId, accountId).length > 0;
}

export function getLightningRoundEventPortfolio(
  transactions: PaperTransaction[],
  eventId: string,
  quotes: Record<string, number>,
  startingBalance = 100_000,
): {
  cashBalance: number;
  equity: number | null;
  tradeCount: number;
  positions: Array<{
    symbol: string;
    companyName: string;
    shares: number;
    avgCost: number;
  }>;
} {
  const eventTrades = transactions
    .filter((transaction) =>
      transaction.lightningRoundEventId === eventId
      && transaction.action !== 'DIVIDEND',
    )
    .sort((left, right) => Date.parse(left.date) - Date.parse(right.date));
  const holdings = new Map<string, {
    symbol: string;
    companyName: string;
    shares: number;
    totalCost: number;
  }>();
  let cashBalance = startingBalance;
  for (const trade of eventTrades) {
    const existing = holdings.get(trade.symbol);
    if (trade.action === 'BUY') {
      cashBalance -= trade.total;
      const currentShares = existing?.shares ?? 0;
      holdings.set(trade.symbol, {
        symbol: trade.symbol,
        companyName: trade.companyName,
        shares: currentShares + trade.shares,
        totalCost: (existing?.totalCost ?? 0) + trade.shares * trade.price,
      });
    } else if (trade.action === 'SELL' && existing) {
      cashBalance += trade.total - (trade.fee ?? 0);
      const remainingShares = Math.max(0, existing.shares - trade.shares);
      if (remainingShares <= 0.0001) {
        holdings.delete(trade.symbol);
      } else {
        const averageCost = existing.totalCost / existing.shares;
        holdings.set(trade.symbol, {
          ...existing,
          shares: remainingShares,
          totalCost: averageCost * remainingShares,
        });
      }
    }
  }
  const positions = [...holdings.values()].map((position) => ({
    symbol: position.symbol,
    companyName: position.companyName,
    shares: position.shares,
    avgCost: position.totalCost / position.shares,
  }));
  const hasMissingQuote = positions.some((position) =>
    !Number.isFinite(quotes[position.symbol]) || quotes[position.symbol] <= 0,
  );
  return {
    cashBalance,
    equity: hasMissingQuote
      ? null
      : cashBalance + positions.reduce((sum, position) =>
        sum + position.shares * quotes[position.symbol]!, 0),
    tradeCount: eventTrades.length,
    positions,
  };
}

export function cancelLightningRoundStagedOrders(
  orders: PaperOrder[],
  eventId: string,
  accountId: string,
): PaperOrder[] {
  return orders.map((order) =>
    order.accountId === accountId
      && order.lightningRoundEventId === eventId
      && order.status === 'pending'
      ? { ...order, status: 'cancelled' as const }
      : order,
  );
}
