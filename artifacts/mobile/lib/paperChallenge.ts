import type {
  PaperAccount,
  PaperLot,
  PaperOrder,
  PaperPosition,
  PaperTransaction,
} from './paperMath.ts';

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

export type PaperChallengeMilestoneId = 'first-event' | 'positive-finish' | 'personal-best';

export const PAPER_CHALLENGE_MILESTONE_LABELS: Record<PaperChallengeMilestoneId, string> = {
  'first-event': 'FIRST EVENT',
  'positive-finish': 'IN THE GREEN',
  'personal-best': 'PERSONAL BEST',
};

export type PaperChallengeStore = {
  enrollment: PaperChallengeEnrollment | null;
  history: PaperChallengeSummary[];
};

type PaperChallengeStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

let paperChallengeWriteQueue: Promise<void> = Promise.resolve();

export function normalizePaperChallengeStore(store: PaperChallengeStore): PaperChallengeStore {
  const seenEventIds = new Set<string>();
  const history = store.history.filter((event) => {
    if (!event || typeof event.eventId !== 'string' || seenEventIds.has(event.eventId)) return false;
    seenEventIds.add(event.eventId);
    return true;
  });
  return {
    enrollment: store.enrollment ?? null,
    history: sortPaperChallengeHistory(history, 'date'),
  };
}

function parsePaperChallengeStore(raw: string | null): PaperChallengeStore {
  if (!raw) return { enrollment: null, history: [] };
  const parsed = JSON.parse(raw) as Partial<PaperChallengeStore>;
  if (parsed.history !== undefined && !Array.isArray(parsed.history)) {
    throw new Error('Saved event history is invalid.');
  }
  return normalizePaperChallengeStore({
    enrollment: parsed.enrollment ?? null,
    history: parsed.history ?? [],
  } as PaperChallengeStore);
}

export async function loadPaperChallengeStore(
  storage: Pick<PaperChallengeStorage, 'getItem'>,
): Promise<PaperChallengeStore> {
  return parsePaperChallengeStore(await storage.getItem(PAPER_CHALLENGE_STORAGE_KEY));
}

/**
 * Serialize event-store read/modify/write operations so independent screens
 * cannot overwrite one another with stale snapshots.
 */
export function updatePaperChallengeStore(
  update: (store: PaperChallengeStore) => PaperChallengeStore,
  storage: PaperChallengeStorage,
): Promise<PaperChallengeStore> {
  const operation = paperChallengeWriteQueue.then(async () => {
    const current = await loadPaperChallengeStore(storage);
    const updated = update(current);
    if (updated === current) return current;

    const normalized = normalizePaperChallengeStore(updated);
    await storage.setItem(PAPER_CHALLENGE_STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  });
  paperChallengeWriteQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

export function getPaperChallengeMilestones(
  event: PaperChallengeSummary,
  history: PaperChallengeSummary[],
): PaperChallengeMilestoneId[] {
  const previousEvents = history.filter((item) =>
    item.eventId !== event.eventId && item.eventStartAtMs < event.eventStartAtMs,
  );
  const milestones: PaperChallengeMilestoneId[] = [];

  if (previousEvents.length === 0) milestones.push('first-event');
  if (event.returnPercent > 0) milestones.push('positive-finish');
  if (
    previousEvents.length > 0
    && event.returnPercent > 0
    && previousEvents.every((item) => event.returnPercent > item.returnPercent)
  ) {
    milestones.push('personal-best');
  }

  return milestones;
}

export type PaperChallengeAccountState = {
  accounts: PaperAccount[];
  positions: PaperPosition[];
  transactions: PaperTransaction[];
  orders: PaperOrder[];
  lots: PaperLot[];
};

/**
 * Add a clean local account for an event, preserving all existing accounts.
 * If the account already exists, its in-progress trades are left intact so
 * reopening Paper Trading cannot reset an active event.
 */
export function ensurePaperChallengeAccount(
  enrollment: PaperChallengeEnrollment,
  state: PaperChallengeAccountState,
): PaperChallengeAccountState {
  if (state.accounts.some((account) => account.id === enrollment.accountId)) return state;

  const account: PaperAccount = {
    id: enrollment.accountId,
    name: enrollment.accountName,
    cash: PAPER_CHALLENGE_STARTING_BALANCE,
    createdAt: new Date(enrollment.joinedAtMs).toISOString(),
  };
  const isOtherAccount = <T extends { accountId: string }>(record: T) => record.accountId !== account.id;

  return {
    accounts: [...state.accounts, account],
    positions: state.positions.filter(isOtherAccount),
    transactions: state.transactions.filter(isOtherAccount),
    orders: state.orders.filter(isOtherAccount),
    lots: state.lots.filter(isOtherAccount),
  };
}

export function getMissingPaperChallengeQuoteSymbols(
  positions: Array<{ symbol: string; shares: number }>,
  quotes: Record<string, { price: number }>,
): string[] {
  return [...new Set(positions
    .filter((position) => {
      const quote = quotes[position.symbol];
      return position.shares > 0
        && (!quote || !Number.isFinite(quote.price) || quote.price <= 0);
    })
    .map((position) => position.symbol))];
}

export function finalizePaperChallengeStore(
  store: PaperChallengeStore,
  summary: PaperChallengeSummary,
  nowMs = Date.now(),
): PaperChallengeStore {
  if (
    store.enrollment?.eventId !== summary.eventId
    || nowMs < store.enrollment.eventEndAtMs
  ) return store;

  const existingSummary = store.history.find((event) => event.eventId === summary.eventId);
  return {
    enrollment: null,
    history: [
      existingSummary ?? summary,
      ...store.history.filter((event) => event.eventId !== summary.eventId),
    ],
  };
}

export async function persistPaperChallengeFinalization(
  summary: PaperChallengeSummary,
  nowMs: number,
  storage: PaperChallengeStorage,
): Promise<PaperChallengeStore> {
  return updatePaperChallengeStore(
    (store) => finalizePaperChallengeStore(store, summary, nowMs),
    storage,
  );
}

export function withdrawUpcomingPaperChallenge(
  store: PaperChallengeStore,
  eventId: string,
  nowMs = Date.now(),
): PaperChallengeStore {
  const enrollment = store.enrollment;
  if (
    !enrollment
    || enrollment.eventId !== eventId
    || enrollment.startEquity !== null
    || nowMs >= enrollment.eventStartAtMs
  ) return store;

  return { enrollment: null, history: store.history };
}

export type PaperChallengeReminder = {
  eventId: string;
  scheduledAtMs: number;
  title: string;
  body: string;
  kind: 'event-start' | 'event-midweek' | 'event-trade-reminder';
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

export function getPaperChallengeReminders(nowMs = Date.now()): PaperChallengeReminder[] {
  let event = getPaperChallengeWindow(nowMs);
  if (event.phase === 'ended') event = getPaperChallengeWindow(event.endAtMs + 3 * DAY_MS + 1);
  const reminders: PaperChallengeReminder[] = [];
  for (let cycle = 0; cycle < 2; cycle += 1) {
    const eventReminders: PaperChallengeReminder[] = [
      {
        eventId: event.id,
        scheduledAtMs: event.startAtMs,
        title: 'Event Arena is open',
        body: 'Your fresh $100,000 event portfolio is ready. Join or place your first trade.',
        kind: 'event-start',
      },
      {
        eventId: event.id,
        scheduledAtMs: event.startAtMs + 2 * DAY_MS + 2.5 * 60 * 60 * 1000,
        title: 'Midweek Event Arena update',
        body: 'Check your current overall position and return in Event Arena.',
        kind: 'event-midweek',
      },
      {
        eventId: event.id,
        scheduledAtMs: event.startAtMs + 3 * DAY_MS + 2.5 * 60 * 60 * 1000,
        title: 'One more day to trade',
        body: 'There is still time to place a paper trade before Friday’s 4 p.m. ET close.',
        kind: 'event-trade-reminder',
      },
    ];
    reminders.push(...eventReminders.filter((reminder) => reminder.scheduledAtMs > nowMs));
    event = getPaperChallengeWindow(event.endAtMs + 3 * DAY_MS + 1);
  }
  return reminders;
}

export function sortPaperChallengeHistory(
  history: PaperChallengeSummary[],
  mode: 'date' | 'top',
): PaperChallengeSummary[] {
  return [...history].sort((a, b) => mode === 'top'
    ? b.returnPercent - a.returnPercent || b.eventStartAtMs - a.eventStartAtMs
    : b.eventStartAtMs - a.eventStartAtMs);
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
