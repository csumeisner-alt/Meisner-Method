export const PAPER_CHALLENGE_STORAGE_KEY = '@stocksense/paper_events_v1';
export const PAPER_CHALLENGE_STARTING_BALANCE = 100_000;

const DAY_MS = 24 * 60 * 60 * 1000;
const EVENT_ANCHOR_DAY = Math.floor(Date.UTC(2026, 10, 16) / DAY_MS);
const MARKET_TIME_ZONE = 'America/New_York';

export type PaperChallengeWindow = {
  id: string;
  startAtMs: number;
  endAtMs: number;
  phase: 'upcoming' | 'active' | 'ended';
};

export type PaperChallengeEnrollment = {
  eventId: string;
  eventStartAtMs: number;
  eventEndAtMs: number;
  joinedAtMs: number;
  accountId: string;
  accountName: string;
  startEquity: number | null;
};

export type PaperChallengeSummary = Omit<PaperChallengeEnrollment, 'startEquity'> & {
  startEquity: number;
  endEquity: number;
  netProfit: number;
  returnPercent: number;
  tradeCount: number;
  buyCount: number;
  sellCount: number;
  symbolsTraded: string[];
  realizedPnL: number;
  completedAtMs: number;
};

export type PaperChallengeStore = {
  enrollment: PaperChallengeEnrollment | null;
  history: PaperChallengeSummary[];
};

function easternParts(timestamp: number): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MARKET_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestamp));
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour'), minute: value('minute') };
}

function easternLocalToUtc(year: number, month: number, day: number, hour: number, minute: number): number {
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = targetAsUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const local = easternParts(candidate);
    const representedAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
    candidate += targetAsUtc - representedAsUtc;
  }
  return candidate;
}

function dateStringFromSerial(serial: number): string {
  return new Date(serial * DAY_MS).toISOString().slice(0, 10);
}

function eventStartSerialForDay(daySerial: number): number {
  if (daySerial < EVENT_ANCHOR_DAY) return EVENT_ANCHOR_DAY;
  const daysSinceAnchor = daySerial - EVENT_ANCHOR_DAY;
  const twoWeekCycle = Math.floor(daysSinceAnchor / 14);
  const dayInCycle = daysSinceAnchor % 14;
  return EVENT_ANCHOR_DAY + (twoWeekCycle + (dayInCycle >= 7 ? 1 : 0)) * 14;
}

export function getPaperChallengeWindow(nowMs = Date.now()): PaperChallengeWindow {
  const local = easternParts(nowMs);
  const daySerial = Math.floor(Date.UTC(local.year, local.month - 1, local.day) / DAY_MS);
  const daysSinceAnchor = daySerial - EVENT_ANCHOR_DAY;
  const isThisCycleEventWeek = daysSinceAnchor >= 0 && daysSinceAnchor % 14 < 7;
  const startSerial = isThisCycleEventWeek
    ? EVENT_ANCHOR_DAY + Math.floor(daysSinceAnchor / 14) * 14
    : eventStartSerialForDay(daySerial);
  const startDate = new Date(startSerial * DAY_MS);
  const year = startDate.getUTCFullYear();
  const month = startDate.getUTCMonth() + 1;
  const day = startDate.getUTCDate();
  const fridaySerial = startSerial + 4;
  const friday = new Date(fridaySerial * DAY_MS);
  const startAtMs = easternLocalToUtc(year, month, day, 9, 30);
  const endAtMs = easternLocalToUtc(friday.getUTCFullYear(), friday.getUTCMonth() + 1, friday.getUTCDate(), 16, 0);

  return {
    id: dateStringFromSerial(startSerial),
    startAtMs,
    endAtMs,
    phase: nowMs < startAtMs ? 'upcoming' : nowMs <= endAtMs ? 'active' : 'ended',
  };
}

export function capturePaperChallengeBaseline(
  enrollment: PaperChallengeEnrollment,
  startEquity: number,
): PaperChallengeEnrollment {
  if (enrollment.startEquity !== null) return enrollment;
  return {
    ...enrollment,
    joinedAtMs: enrollment.eventStartAtMs,
    startEquity,
  };
}

export function buildPaperChallengeSummary(
  enrollment: PaperChallengeEnrollment & { startEquity: number },
  endEquity: number,
  transactions: Array<{
    accountId: string;
    symbol: string;
    action: 'BUY' | 'SELL' | 'DIVIDEND';
    date: string;
    realizedPnL?: number;
    fee?: number;
  }>,
  completedAtMs = Date.now(),
): PaperChallengeSummary {
  const eventTransactions = transactions.filter((transaction) => {
    const timestamp = Date.parse(transaction.date);
    return transaction.accountId === enrollment.accountId
      && timestamp >= enrollment.joinedAtMs
      && timestamp <= enrollment.eventEndAtMs;
  });
  const trades = eventTransactions.filter((transaction) => transaction.action === 'BUY' || transaction.action === 'SELL');
  const buys = trades.filter((transaction) => transaction.action === 'BUY');
  const sells = trades.filter((transaction) => transaction.action === 'SELL');
  const realizedPnL = eventTransactions.reduce(
    (total, transaction) => total + (transaction.action === 'SELL'
      ? (transaction.realizedPnL ?? 0) - (transaction.fee ?? 0)
      : 0),
    0,
  );
  const netProfit = endEquity - enrollment.startEquity;
  return {
    ...enrollment,
    endEquity,
    netProfit,
    returnPercent: enrollment.startEquity > 0 ? netProfit / enrollment.startEquity * 100 : 0,
    tradeCount: trades.length,
    buyCount: buys.length,
    sellCount: sells.length,
    symbolsTraded: [...new Set(trades.map((transaction) => transaction.symbol).filter(Boolean))].sort(),
    realizedPnL,
    completedAtMs,
  };
}
