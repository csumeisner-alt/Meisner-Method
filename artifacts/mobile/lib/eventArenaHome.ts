import type {
  PaperAccount,
  PaperAccountValueSnapshot,
  PaperOrder,
  PaperPosition,
  PaperTransaction,
} from './paperMath.ts';
import {
  PAPER_CHALLENGE_STARTING_BALANCE,
  type PaperChallengeEnrollment,
  type PaperChallengeWindow,
} from './paperChallenge.ts';

export type EventArenaCountdown = {
  mode: 'starts' | 'ends' | 'ended';
  remainingMs: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

export type EventArenaParticipation =
  | 'joined'
  | 'eligible'
  | 'finish-previous'
  | 'results-pending'
  | 'event-ended';

export type EventArenaAccountData = {
  accounts: PaperAccount[];
  positions: PaperPosition[];
  transactions: PaperTransaction[];
  orders: PaperOrder[];
  snapshots: PaperAccountValueSnapshot[];
};

export type EventArenaPerformance = {
  account: PaperAccount | null;
  positions: PaperPosition[];
  pendingOrders: PaperOrder[];
  startingBalance: number;
  equity: number | null;
  profitLoss: number | null;
  returnPercent: number | null;
  buyingPower: number | null;
  completedTradeCount: number;
  chartPoints: { date: string; value: number }[];
};

const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function getEventArenaCountdown(
  event: PaperChallengeWindow,
  nowMs: number,
): EventArenaCountdown {
  const mode = nowMs < event.startAtMs
    ? 'starts'
    : nowMs <= event.endAtMs
      ? 'ends'
      : 'ended';
  const target = mode === 'starts' ? event.startAtMs : event.endAtMs;
  const remainingMs = mode === 'ended' ? 0 : Math.max(0, target - nowMs);
  const totalSeconds = Math.floor(remainingMs / SECOND_MS);
  const days = Math.floor(totalSeconds / (DAY_MS / SECOND_MS));
  const hours = Math.floor((totalSeconds % (DAY_MS / SECOND_MS)) / (HOUR_MS / SECOND_MS));
  const minutes = Math.floor((totalSeconds % (HOUR_MS / SECOND_MS)) / (MINUTE_MS / SECOND_MS));
  const seconds = totalSeconds % (MINUTE_MS / SECOND_MS);
  return { mode, remainingMs, days, hours, minutes, seconds };
}

export function getEventArenaParticipation(
  event: PaperChallengeWindow,
  enrollment: PaperChallengeEnrollment | null,
  nowMs: number,
): EventArenaParticipation {
  if (enrollment?.eventId === event.id) return 'joined';
  if (enrollment) {
    return nowMs >= enrollment.eventEndAtMs ? 'results-pending' : 'finish-previous';
  }
  return nowMs > event.endAtMs ? 'event-ended' : 'eligible';
}

export function selectEventArenaWindow<T extends PaperChallengeWindow>(
  currentEvent: T,
  availableEvents: readonly T[],
  selectedId: string | null,
): T {
  if (!selectedId || selectedId === currentEvent.id) return currentEvent;
  return availableEvents.find((event) => event.id === selectedId) ?? currentEvent;
}

export function getEventArenaChartHistory(
  snapshots: PaperAccountValueSnapshot[],
  accountId: string,
  event: PaperChallengeWindow,
  nowMs: number,
): { date: string; value: number }[] {
  return snapshots
    .filter((snapshot) => snapshot.accountId === accountId && Number.isFinite(snapshot.value))
    .filter((snapshot) => {
      const timestamp = Date.parse(snapshot.date);
      return Number.isFinite(timestamp)
        && timestamp >= event.startAtMs
        && timestamp <= Math.min(nowMs, event.endAtMs);
    })
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
    .map(({ date, value }) => ({ date, value }));
}

export function getEventArenaPerformance(
  enrollment: PaperChallengeEnrollment,
  event: PaperChallengeWindow,
  data: EventArenaAccountData,
  quotes: Record<string, number>,
  nowMs: number,
): EventArenaPerformance {
  const account = data.accounts.find((item) => item.id === enrollment.accountId) ?? null;
  const positions = data.positions.filter((item) =>
    item.accountId === enrollment.accountId && item.shares > 0,
  );
  const transactions = data.transactions.filter((item) => {
    const timestamp = Date.parse(item.date);
    return item.accountId === enrollment.accountId
      && timestamp >= Math.max(enrollment.joinedAtMs, event.startAtMs)
      && timestamp <= event.endAtMs
      && (item.action === 'BUY' || item.action === 'SELL');
  });
  const pendingOrders = data.orders.filter((item) =>
    item.accountId === enrollment.accountId && item.status === 'pending',
  );
  const startingBalance = enrollment.startEquity ?? PAPER_CHALLENGE_STARTING_BALANCE;
  const hasAllQuotes = positions.every((position) =>
    Number.isFinite(quotes[position.symbol]) && quotes[position.symbol] > 0,
  );
  const equity = account && hasAllQuotes
    ? account.cash
      + (account.unsettledCash ?? 0)
      + positions.reduce((sum, position) => sum + position.shares * quotes[position.symbol]!, 0)
    : null;
  const profitLoss = equity == null ? null : equity - startingBalance;

  return {
    account,
    positions,
    pendingOrders,
    startingBalance,
    equity,
    profitLoss,
    returnPercent: profitLoss == null || startingBalance <= 0
      ? null
      : profitLoss / startingBalance * 100,
    buyingPower: account?.cash ?? null,
    completedTradeCount: transactions.length,
    chartPoints: getEventArenaChartHistory(data.snapshots, enrollment.accountId, event, nowMs),
  };
}
