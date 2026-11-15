import type { PaperAccount, PaperAccountValueSnapshot, PaperOrder } from './paperMath.ts';
import type { PaperChallengeEnrollment, PaperChallengeSummary } from './paperChallenge.ts';

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
  return getLightningRoundQueuedOrders(orders, eventId, accountId).length > 0;
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
