import type {
  PaperAccount,
  PaperAccountValueSnapshot,
  PaperLot,
  PaperOrder,
  PaperPosition,
  PaperTransaction,
} from './paperMath.ts';
import {
  getFirstLightningRoundCandidateDaySerial,
  getRegularEventCalendarError,
  getRegularEventSequenceIndex,
  getRegularEventWindowForCurrentDate,
  hasRegularEventWindowOverlap,
} from './paperChallengeCalendar.ts';

export const PAPER_CHALLENGE_STORAGE_KEY = '@stocksense/paper_events_v1';
export const PAPER_CHALLENGE_STARTING_BALANCE = 100_000;
export const LIGHTNING_ROUND_STARTING_BALANCE = 100_000;
export const GREEN_BULL_STARTING_BALANCE = 500_000;
export const LIGHTNING_ROUND_TIME_ZONE = 'America/Denver';
export const LIGHTNING_ROUND_START_HOUR = 7;
export const LIGHTNING_ROUND_START_MINUTE = 30;
export const LIGHTNING_ROUND_PREPARATION_MS = 72 * 60 * 60 * 1000;

export function getLightningRoundPreparationAtMs(eventStartAtMs: number): number {
  return eventStartAtMs - LIGHTNING_ROUND_PREPARATION_MS;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export const PAPER_CHALLENGE_ARTWORK_IDS = [
  'stadium',
  'neon-nightclub',
  'mountain-summit',
  'red-showdown',
  'green-stock-exchange',
  'penny-stock-mayhem',
] as const;
export const LIGHTNING_ROUND_ARTWORK_ID = 'lightning-round-arena' as const;
export type PaperChallengeArtworkId =
  | typeof PAPER_CHALLENGE_ARTWORK_IDS[number]
  | typeof LIGHTNING_ROUND_ARTWORK_ID;
export const LEGACY_PAPER_CHALLENGE_ARTWORK_ID: PaperChallengeArtworkId = 'stadium';
export type PaperChallengeEventType =
  | 'event-arena'
  | 'green-bull-championship'
  | 'bear-market-mayhem'
  | 'penny-stock-mayhem'
  | 'lightning-round';
export type PaperChallengeRankingDirection = 'highest-return' | 'lowest-return';

export type PaperChallengeConfiguration = {
  eventType: PaperChallengeEventType;
  artworkId: PaperChallengeArtworkId;
  startingBalance: number;
  rankingDirection: PaperChallengeRankingDirection;
  purchaseLimit?: number;
};

/** Resolve a scheduled event's rules once from its assigned artwork. */
export function getPaperChallengeConfiguration(
  artworkId: PaperChallengeArtworkId,
): PaperChallengeConfiguration {
  if (artworkId === 'green-stock-exchange') {
    return {
        eventType: 'green-bull-championship',
        artworkId,
        startingBalance: GREEN_BULL_STARTING_BALANCE,
        rankingDirection: 'highest-return',
    };
  }
  if (artworkId === 'red-showdown') {
    return {
      eventType: 'bear-market-mayhem',
      artworkId,
      startingBalance: PAPER_CHALLENGE_STARTING_BALANCE,
      rankingDirection: 'lowest-return',
    };
  }
  if (artworkId === 'penny-stock-mayhem') {
    return {
      eventType: 'penny-stock-mayhem',
      artworkId,
      startingBalance: PAPER_CHALLENGE_STARTING_BALANCE,
      rankingDirection: 'highest-return',
      purchaseLimit: 20,
    };
  }
  if (artworkId === 'lightning-round-arena') {
    return {
      eventType: 'lightning-round',
      artworkId,
      startingBalance: LIGHTNING_ROUND_STARTING_BALANCE,
      rankingDirection: 'highest-return',
    };
  }
  return {
        eventType: 'event-arena',
        artworkId,
        startingBalance: PAPER_CHALLENGE_STARTING_BALANCE,
        rankingDirection: 'highest-return',
  };
}

/** Validate saved rules without deriving them from display artwork. */
export function isPaperChallengeConfiguration(value: unknown): value is PaperChallengeConfiguration {
  if (!value || typeof value !== 'object') return false;
  const configuration = value as Partial<PaperChallengeConfiguration>;
  if (!isPaperChallengeArtworkId(configuration.artworkId)) return false;
  const expected = getPaperChallengeConfiguration(configuration.artworkId as PaperChallengeArtworkId);
  if (
    configuration.eventType === expected.eventType
    && configuration.startingBalance === expected.startingBalance
    && configuration.rankingDirection === expected.rankingDirection
    && configuration.purchaseLimit === expected.purchaseLimit
  ) return true;
  // A Red Showdown event saved before Bear Market Mayhem was introduced keeps
  // its original standard-event rules and results.
  return configuration.artworkId === 'red-showdown'
    && configuration.eventType === 'event-arena'
    && configuration.startingBalance === PAPER_CHALLENGE_STARTING_BALANCE
    && configuration.rankingDirection === 'highest-return'
    && configuration.purchaseLimit === undefined;
}

export function normalizePaperChallengeArtworkId(value: unknown): PaperChallengeArtworkId {
  return isPaperChallengeArtworkId(value) ? value : LEGACY_PAPER_CHALLENGE_ARTWORK_ID;
}

function isPaperChallengeArtworkId(value: unknown): value is PaperChallengeArtworkId {
  return value === LIGHTNING_ROUND_ARTWORK_ID
    || PAPER_CHALLENGE_ARTWORK_IDS.includes(value as typeof PAPER_CHALLENGE_ARTWORK_IDS[number]);
}

/**
 * Assign art by the scheduled competition sequence so every participant sees
 * the same background, regardless of when or on which device they enroll.
 * Records created before the rotation anchor retain the original stadium art.
 */
export function getPaperChallengeArtworkId(eventId: string): PaperChallengeArtworkId {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventId)) return LEGACY_PAPER_CHALLENGE_ARTWORK_ID;
  const eventDate = new Date(`${eventId}T00:00:00.000Z`);
  if (!Number.isFinite(eventDate.getTime()) || eventDate.toISOString().slice(0, 10) !== eventId) {
    return LEGACY_PAPER_CHALLENGE_ARTWORK_ID;
  }
  const sequenceIndex = getRegularEventSequenceIndex(eventId);
  if (sequenceIndex === null) return LEGACY_PAPER_CHALLENGE_ARTWORK_ID;
  const artworkIndex = sequenceIndex % PAPER_CHALLENGE_ARTWORK_IDS.length;
  return PAPER_CHALLENGE_ARTWORK_IDS[artworkIndex];
}

export type PaperChallengeWindow = {
  id: string;
  startAtMs: number;
  endAtMs: number;
  phase: 'upcoming' | 'active' | 'ended';
  artworkId?: PaperChallengeArtworkId;
  eventType?: PaperChallengeEventType;
  startingBalance?: number;
  rankingDirection?: PaperChallengeRankingDirection;
  purchaseLimit?: number;
};

export type PaperChallengeEnrollment = {
  eventId: string;
  artworkId?: PaperChallengeArtworkId;
  eventType?: PaperChallengeEventType;
  startingBalance?: number;
  rankingDirection?: PaperChallengeRankingDirection;
  purchaseLimit?: number;
  eventStartAtMs: number;
  eventEndAtMs: number;
  joinedAtMs: number;
  accountId: string;
  accountName: string;
  startEquity: number | null;
  leaderboardAlias?: string;
  leaderboardOptedIn?: boolean;
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
  transactions?: PaperChallengeArchivedTransaction[];
  equityHistory?: Array<{ date: string; value: number }>;
  finalPositions?: PaperChallengeArchivedPosition[];
  finalRank?: number;
};

export type PaperChallengeArchivedPosition = {
  symbol: string;
  companyName: string;
  shares: number;
  positionType?: 'long' | 'short';
  avgCost: number;
  marketPrice: number;
  marketValue: number;
  unrealizedPnL: number;
};

export type PaperChallengeArchivedTransaction = {
  id?: string;
  symbol: string;
  action: 'BUY' | 'SELL' | 'SHORT_SELL' | 'BUY_TO_COVER' | 'DIVIDEND';
  shares?: number;
  price?: number;
  total?: number;
  date: string;
  realizedPnL?: number;
  fee?: number;
};

export type PaperChallengeMilestoneId = 'first-event' | 'positive-finish' | 'personal-best';

export const PAPER_CHALLENGE_MILESTONE_LABELS: Record<PaperChallengeMilestoneId, string> = {
  'first-event': 'FIRST EVENT',
  'positive-finish': 'IN THE GREEN',
  'personal-best': 'PERSONAL BEST',
};

export type PaperChallengeStore = {
  enrollment: PaperChallengeEnrollment | null;
  /** Separate slot allows Lightning Round and a regular event to overlap. */
  lightningEnrollment?: PaperChallengeEnrollment | null;
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
  }).map(({
    transactions,
    equityHistory,
    finalPositions,
    finalRank,
    eventType,
    startingBalance,
    rankingDirection,
    purchaseLimit,
    ...event
  }) => {
    const artworkId = normalizePaperChallengeArtworkId(event.artworkId);
    const savedEventType = eventType === 'lightning-round'
      || eventType === 'green-bull-championship'
      || eventType === 'bear-market-mayhem'
      || eventType === 'penny-stock-mayhem'
      || eventType === 'event-arena'
      ? eventType
      : undefined;
    // Leave legacy archives unchanged: their recorded startEquity remains the
    // baseline, and missing rules are never inferred from display artwork.
    const savedStartingBalance = typeof startingBalance === 'number'
      && Number.isFinite(startingBalance)
      && startingBalance > 0
      ? startingBalance
      : undefined;
    return {
      ...event,
      artworkId,
      ...(savedEventType ? { eventType: savedEventType } : {}),
      ...(savedStartingBalance !== undefined ? { startingBalance: savedStartingBalance } : {}),
      ...(rankingDirection === 'highest-return' || rankingDirection === 'lowest-return' ? { rankingDirection } : {}),
      ...(typeof purchaseLimit === 'number' && Number.isFinite(purchaseLimit) && purchaseLimit > 0
        ? { purchaseLimit }
        : {}),
      ...(Array.isArray(transactions) ? { transactions } : {}),
      ...(Array.isArray(equityHistory)
        ? {
            equityHistory: equityHistory.filter((point) =>
              !!point
              && typeof point.date === 'string'
              && Number.isFinite(Date.parse(point.date))
              && Number.isFinite(point.value),
            ).map((point) => ({ date: point.date, value: point.value }))
              .sort((a, b) => Date.parse(a.date) - Date.parse(b.date)),
          }
        : {}),
      ...(Array.isArray(finalPositions)
        ? {
            finalPositions: finalPositions.filter((position) =>
              !!position
              && typeof position.symbol === 'string'
              && typeof position.companyName === 'string'
              && Number.isFinite(position.shares)
              && position.shares > 0
              && Number.isFinite(position.avgCost)
              && position.avgCost >= 0
              && Number.isFinite(position.marketPrice)
              && position.marketPrice > 0
              && Number.isFinite(position.marketValue)
              && Number.isFinite(position.unrealizedPnL),
            ),
          }
        : {}),
      ...(Number.isInteger(finalRank) && (finalRank ?? 0) > 0 ? { finalRank } : {}),
    };
  });
  const enrollment = store.enrollment
    ? (() => {
        const artworkId = normalizePaperChallengeArtworkId(store.enrollment.artworkId);
        const eventType: PaperChallengeEventType = store.enrollment.eventType === 'lightning-round'
          || store.enrollment.eventType === 'green-bull-championship'
          || store.enrollment.eventType === 'bear-market-mayhem'
          || store.enrollment.eventType === 'penny-stock-mayhem'
          ? store.enrollment.eventType
          : 'event-arena';
        const savedStartingBalance = store.enrollment.startingBalance;
        const legacyStartingBalance = store.enrollment.startEquity;
        return {
          ...store.enrollment,
          artworkId,
          // Older enrollments were standard $100,000 events. Missing config
          // stays standard even when their saved display artwork is green.
          eventType,
          startingBalance: typeof savedStartingBalance === 'number'
            && Number.isFinite(savedStartingBalance)
            && savedStartingBalance > 0
            ? savedStartingBalance
            : typeof legacyStartingBalance === 'number'
              && Number.isFinite(legacyStartingBalance)
              && legacyStartingBalance > 0
              ? legacyStartingBalance
              : PAPER_CHALLENGE_STARTING_BALANCE,
          rankingDirection: store.enrollment.rankingDirection === 'lowest-return'
            ? 'lowest-return' as const
            : 'highest-return' as const,
          ...(typeof store.enrollment.purchaseLimit === 'number'
            && Number.isFinite(store.enrollment.purchaseLimit)
            && store.enrollment.purchaseLimit > 0
            ? { purchaseLimit: store.enrollment.purchaseLimit }
            : {}),
        };
      })()
    : null;
  const lightningEnrollment = store.lightningEnrollment
    ? {
        ...store.lightningEnrollment,
        artworkId: normalizePaperChallengeArtworkId(store.lightningEnrollment.artworkId),
        eventType: 'lightning-round' as const,
        startingBalance: LIGHTNING_ROUND_STARTING_BALANCE,
        rankingDirection: 'highest-return' as const,
      }
    : null;
  return {
    enrollment,
    ...(lightningEnrollment ? { lightningEnrollment } : {}),
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
    lightningEnrollment: parsed.lightningEnrollment ?? null,
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

export function getPaperChallengePersonalBestProgress(
  history: PaperChallengeSummary[],
  currentEventStartAtMs: number,
  currentReturnPercent: number | null,
): { bestReturnPercent: number; gapPercentPoints: number } | null {
  if (
    !Number.isFinite(currentEventStartAtMs)
    || currentReturnPercent === null
    || !Number.isFinite(currentReturnPercent)
  ) return null;

  const previousReturns = history
    .filter((event) => event.eventStartAtMs < currentEventStartAtMs)
    .map((event) => event.returnPercent)
    .filter(Number.isFinite);
  if (previousReturns.length === 0) return null;

  const bestReturnPercent = Math.max(...previousReturns);
  return {
    bestReturnPercent,
    gapPercentPoints: bestReturnPercent - currentReturnPercent,
  };
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
  // Lightning Round borrows an existing Event Arena account; it must never
  // provision a seeded portfolio of its own.
  if (enrollment.eventType === 'lightning-round' || isLightningRoundEventId(enrollment.eventId)) {
    return state;
  }
  if (state.accounts.some((account) => account.id === enrollment.accountId)) return state;

  const account: PaperAccount = {
    id: enrollment.accountId,
    name: enrollment.accountName,
    cash: enrollment.startingBalance ?? PAPER_CHALLENGE_STARTING_BALANCE,
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

export function shouldEnsurePaperChallengeAccount(
  enrollment: PaperChallengeEnrollment,
  nowMs = Date.now(),
): boolean {
  if (enrollment.eventType === 'lightning-round' || isLightningRoundEventId(enrollment.eventId)) return false;
  return enrollment.startEquity !== null || nowMs >= enrollment.eventStartAtMs;
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
  const lightning = isLightningRoundEventId(summary.eventId);
  const enrollment = lightning ? store.lightningEnrollment : store.enrollment;
  if (
    enrollment?.eventId !== summary.eventId
    || nowMs < enrollment.eventEndAtMs
  ) return store;

  const existingSummary = store.history.find((event) => event.eventId === summary.eventId);
  return {
    ...store,
    ...(lightning ? { lightningEnrollment: null } : { enrollment: null }),
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
  const lightning = isLightningRoundEventId(eventId);
  const enrollment = lightning ? store.lightningEnrollment : store.enrollment;
  if (
    !enrollment
    || enrollment.eventId !== eventId
    || enrollment.startEquity !== null
    || nowMs >= enrollment.eventStartAtMs
  ) return store;

  return {
    ...store,
    ...(lightning ? { lightningEnrollment: null } : { enrollment: null }),
  };
}

export type PaperChallengeReminder = {
  eventId: string;
  scheduledAtMs: number;
  title: string;
  body: string;
  kind: 'event-start' | 'event-midweek' | 'event-trade-reminder' | 'lightning-round-start';
};

function dateStringFromSerial(serial: number): string {
  return new Date(serial * DAY_MS).toISOString().slice(0, 10);
}

export function getPaperChallengeWindow(nowMs = Date.now()): PaperChallengeWindow {
  const regular = getRegularEventWindowForCurrentDate(nowMs);

  return {
    id: regular.eventId,
    startAtMs: regular.startAtMs,
    endAtMs: regular.endAtMs,
    phase: nowMs < regular.startAtMs ? 'upcoming' : nowMs <= regular.endAtMs ? 'active' : 'ended',
    ...getPaperChallengeConfiguration(getPaperChallengeArtworkId(regular.eventId)),
  };
}

/** Check a complete window against scheduled regular Event Arena windows. */
export function hasRegularPaperChallengeOverlap(startAtMs: number, endAtMs: number): boolean {
  return hasRegularEventWindowOverlap(startAtMs, endAtMs);
}

function zonedParts(
  timestamp: number,
  timeZone: string,
): { year: number; month: number; day: number; hour: number; minute: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestamp));
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    year: Number(value('year')),
    month: Number(value('month')),
    day: Number(value('day')),
    hour: Number(value('hour')),
    minute: Number(value('minute')),
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(value('weekday')),
  };
}

function zonedLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): number {
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = targetAsUtc;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const local = zonedParts(candidate, timeZone);
    candidate += targetAsUtc - Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  }
  const resolved = zonedParts(candidate, timeZone);
  if (
    resolved.year !== year || resolved.month !== month || resolved.day !== day
    || resolved.hour !== hour || resolved.minute !== minute
  ) throw new Error(`The scheduled local time does not exist in ${timeZone}.`);
  return candidate;
}

function localDateSerial(year: number, month: number, day: number): number {
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

function serialDate(serial: number): { year: number; month: number; day: number } {
  const date = new Date(serial * DAY_MS);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

export function isLightningRoundEventId(eventId: unknown): eventId is string {
  if (typeof eventId !== 'string' || !/^lightning-\d{4}-\d{2}-\d{2}$/.test(eventId)) return false;
  const dateText = eventId.slice('lightning-'.length);
  const date = new Date(`${dateText}T00:00:00.000Z`);
  return Number.isFinite(date.getTime())
    && date.toISOString().slice(0, 10) === dateText
    // Saturdays are retained for previously saved Lightning Round archives.
    && (date.getUTCDay() === 5 || date.getUTCDay() === 6);
}

export function getLatestLightningRoundAlias(
  history: Array<Pick<PaperChallengeSummary, 'eventId' | 'eventType' | 'eventStartAtMs' | 'leaderboardAlias'>>,
): string | null {
  let latest: (typeof history)[number] | null = null;
  for (const event of history) {
    if (
      (event.eventType !== 'lightning-round' && !isLightningRoundEventId(event.eventId))
      || typeof event.leaderboardAlias !== 'string'
      || !event.leaderboardAlias.trim()
      || !Number.isFinite(event.eventStartAtMs)
    ) continue;
    if (!latest || event.eventStartAtMs > latest.eventStartAtMs) latest = event;
  }
  return latest?.leaderboardAlias?.trim() ?? null;
}

export function isPaperChallengeAccountId(accountId: string): boolean {
  return accountId.startsWith('paper-event:') || accountId.startsWith('paper-lightning:');
}

function lightningWindowForDate(
  date: { year: number; month: number; day: number },
  timeZone: string,
  startHour: number,
  startMinute: number,
  phase: 'upcoming' | 'active',
): PaperChallengeWindow {
  const startAtMs = zonedLocalToUtc(
    date.year, date.month, date.day, startHour, startMinute, timeZone,
  );
  const localDate = `${date.year.toString().padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
  return {
    id: `lightning-${localDate}`,
    startAtMs,
    endAtMs: startAtMs + DAY_MS,
    phase,
    ...getPaperChallengeConfiguration('lightning-round-arena'),
  };
}

/** Return the next Friday off-week championship, or null if none is eligible. */
export function findLightningRoundWindow(
  nowMs = Date.now(),
): PaperChallengeWindow | null {
  const calendarError = getRegularEventCalendarError();
  if (calendarError) throw new Error(calendarError);
  const timeZone = LIGHTNING_ROUND_TIME_ZONE;
  const startHour = LIGHTNING_ROUND_START_HOUR;
  const startMinute = LIGHTNING_ROUND_START_MINUTE;
  if (
    !Number.isInteger(startHour) || startHour < 0 || startHour > 23
    || !Number.isInteger(startMinute) || startMinute < 0 || startMinute > 59
  ) throw new Error('Lightning Round start time is invalid.');
  const localNow = zonedParts(nowMs, timeZone);
  const daySerial = localDateSerial(localNow.year, localNow.month, localNow.day);
  const thisFridaySerial = daySerial + (localNow.weekday === 6
    ? -1
    : (5 - localNow.weekday + 7) % 7);
  const firstFridaySerial = Math.max(thisFridaySerial, getFirstLightningRoundCandidateDaySerial());
  for (let offset = 0; offset < 260; offset += 1) {
    const date = serialDate(firstFridaySerial + offset * 7);
    const candidate = lightningWindowForDate(date, timeZone, startHour, startMinute, 'upcoming');
    if (
      candidate.endAtMs <= nowMs
      || hasRegularPaperChallengeOverlap(candidate.startAtMs, candidate.endAtMs)
    ) continue;
    return {
      ...candidate,
      phase: nowMs >= candidate.startAtMs ? 'active' : 'upcoming',
    };
  }
  return null;
}

/** Friday off-week bonus championship; its duration is exactly 24 elapsed hours. */
export function getLightningRoundWindow(
  nowMs = Date.now(),
): PaperChallengeWindow {
  const window = findLightningRoundWindow(nowMs);
  if (window) return window;
  throw new Error('No eligible Lightning Round window was found.');
}

/** Select the current or next Lightning Round directly from prepared API records. */
export function findPreparedLightningRoundWindow(
  events: unknown[],
  nowMs = Date.now(),
): PaperChallengeWindow | null {
  const windows = parsePreparedLightningRoundWindows(events);
  const active = windows.find((event) => event.startAtMs <= nowMs && nowMs < event.endAtMs);
  if (active) return { ...active, phase: 'active' };
  const upcoming = windows.filter((event) => event.startAtMs > nowMs);
  upcoming.sort((a, b) => a.startAtMs - b.startAtMs);
  return upcoming[0] ?? null;
}

/** Select the official prepared event while its invitation is in its 72h/48h display window. */
export function findPreparedLightningRoundInvitationWindow(
  events: unknown[],
  nowMs = Date.now(),
): PaperChallengeWindow | null {
  if (!Number.isFinite(nowMs)) return null;
  const windows = parsePreparedLightningRoundWindows(events);
  const preparationMs = 72 * 60 * 60 * 1000;
  const postEventMs = 48 * 60 * 60 * 1000;
  const eligible = windows
    .filter((event) =>
      nowMs >= event.startAtMs - preparationMs
      && nowMs < event.endAtMs + postEventMs,
    )
    .sort((a, b) => a.startAtMs - b.startAtMs);
  const event = eligible[0];
  if (!event) return null;
  return {
    ...event,
    phase: nowMs < event.startAtMs ? 'upcoming' : nowMs < event.endAtMs ? 'active' : 'ended',
  };
}

function parsePreparedLightningRoundWindows(events: unknown[]): PaperChallengeWindow[] {
  const configuration = getPaperChallengeConfiguration(LIGHTNING_ROUND_ARTWORK_ID);
  return events.map((event) => {
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      throw new Error('The prepared Lightning Round schedule was invalid.');
    }
    const candidate = event as Record<string, unknown>;
    if (
      !isLightningRoundEventId(candidate.eventId)
      || candidate.eventType !== configuration.eventType
      || candidate.artworkId !== configuration.artworkId
      || candidate.startingBalance !== configuration.startingBalance
      || candidate.rankingDirection !== configuration.rankingDirection
      || typeof candidate.startAtMs !== 'number'
      || !Number.isFinite(candidate.startAtMs)
      || typeof candidate.endAtMs !== 'number'
      || !Number.isFinite(candidate.endAtMs)
      || candidate.endAtMs - candidate.startAtMs !== DAY_MS
    ) {
      throw new Error('The prepared Lightning Round schedule was invalid.');
    }
    return {
      id: candidate.eventId,
      startAtMs: candidate.startAtMs,
      endAtMs: candidate.endAtMs,
      ...configuration,
      phase: 'upcoming' as const,
    };
  });
}

export function getPaperChallengeEnrollments(store: PaperChallengeStore): PaperChallengeEnrollment[] {
  return [store.enrollment, store.lightningEnrollment ?? null]
    .filter((enrollment): enrollment is PaperChallengeEnrollment => !!enrollment);
}

export function getPaperChallengeEnrollmentForAccount(
  store: PaperChallengeStore,
  accountId: string,
): PaperChallengeEnrollment | null {
  return getPaperChallengeEnrollments(store).find((enrollment) => enrollment.accountId === accountId) ?? null;
}

export function updatePaperChallengeEnrollment(
  store: PaperChallengeStore,
  eventType: PaperChallengeEventType,
  update: (enrollment: PaperChallengeEnrollment) => PaperChallengeEnrollment,
): PaperChallengeStore {
  const key = eventType === 'lightning-round' ? 'lightningEnrollment' : 'enrollment';
  const enrollment = store[key] ?? null;
  return enrollment ? { ...store, [key]: update(enrollment) } : store;
}

export function getPaperChallengeReminders(nowMs = Date.now()): PaperChallengeReminder[] {
  if (getRegularEventCalendarError()) return [];
  let event = getPaperChallengeWindow(nowMs);
  if (event.phase === 'ended') event = getPaperChallengeWindow(event.endAtMs + 3 * DAY_MS + 1);
  const reminders: PaperChallengeReminder[] = [];
  for (let cycle = 0; cycle < 2; cycle += 1) {
    const eventReminders: PaperChallengeReminder[] = [
      {
        eventId: event.id,
        scheduledAtMs: event.startAtMs,
        title: 'Event Arena is open',
        body: `Your fresh $${(event.startingBalance ?? PAPER_CHALLENGE_STARTING_BALANCE).toLocaleString('en-US')} event portfolio is ready. Join or place your first trade.`,
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

  let lightningRound = findLightningRoundWindow(nowMs);
  for (let cycle = 0; cycle < 2 && lightningRound; cycle += 1) {
    reminders.push({
      eventId: lightningRound.id,
      scheduledAtMs: lightningRound.startAtMs,
      title: 'Lightning Round is open',
      body: 'The eligible off-week Lightning Round has started. Join with a fresh $100,000 paper account.',
      kind: 'lightning-round-start',
    });
    lightningRound = findLightningRoundWindow(lightningRound.endAtMs + 1);
  }
  const upcomingReminders = reminders.filter((reminder) => reminder.scheduledAtMs > nowMs);
  return upcomingReminders.sort((a, b) => a.scheduledAtMs - b.scheduledAtMs);
}

export function sortPaperChallengeHistory(
  history: PaperChallengeSummary[],
  mode: 'date' | 'top' | 'low' | 'positive' | 'negative',
): PaperChallengeSummary[] {
  const filtered = history.filter((event) =>
    mode === 'positive' ? event.returnPercent > 0
      : mode === 'negative' ? event.returnPercent < 0
        : true,
  );
  return [...filtered].sort((a, b) => {
    if (mode === 'top') return b.returnPercent - a.returnPercent || b.eventStartAtMs - a.eventStartAtMs;
    if (mode === 'low') return a.returnPercent - b.returnPercent || b.eventStartAtMs - a.eventStartAtMs;
    return b.eventStartAtMs - a.eventStartAtMs;
  });
}

export type LightningRoundSeasonSummary = {
  completedRounds: number;
  totalProfitLoss: number;
  startingEquity: number;
  returnPercent: number;
  bestRank: number | null;
};

/** Aggregate only completed Lightning Round records saved in the local event history. */
export function getLightningRoundSeasonSummary(
  history: PaperChallengeSummary[],
  nowMs = Date.now(),
): LightningRoundSeasonSummary | null {
  const completed = history.filter((event) =>
    (event.eventType === 'lightning-round' || isLightningRoundEventId(event.eventId))
    && Number.isFinite(event.completedAtMs)
    && event.completedAtMs <= nowMs
    && Number.isFinite(event.netProfit)
    && Number.isFinite(event.startEquity)
    && event.startEquity > 0,
  );
  if (completed.length === 0) return null;

  const totalProfitLoss = completed.reduce((total, event) => total + event.netProfit, 0);
  const startingEquity = completed.reduce((total, event) => total + event.startEquity, 0);
  const ranks = completed
    .map((event) => event.finalRank)
    .filter((rank): rank is number => Number.isInteger(rank) && rank! > 0);

  return {
    completedRounds: completed.length,
    totalProfitLoss,
    startingEquity,
    returnPercent: startingEquity > 0 ? (totalProfitLoss / startingEquity) * 100 : 0,
    bestRank: ranks.length > 0 ? Math.min(...ranks) : null,
  };
}

export function getPaperChallengeArchiveChartWidth(screenWidth: number): number {
  if (!Number.isFinite(screenWidth) || screenWidth <= 0) return 180;
  return Math.max(180, screenWidth - 68);
}

export function capturePaperChallengeBaseline(
  enrollment: PaperChallengeEnrollment,
  startEquity: number,
): PaperChallengeEnrollment {
  if (enrollment.startEquity !== null) return enrollment;
  return {
    ...enrollment,
    joinedAtMs: enrollment.eventStartAtMs,
    startEquity: enrollment.startingBalance ?? startEquity,
  };
}

export function buildPaperChallengeSummary(
  enrollment: PaperChallengeEnrollment & { startEquity: number },
  endEquity: number,
  transactions: Array<{
    id?: string;
    accountId: string;
    symbol: string;
    action: 'BUY' | 'SELL' | 'SHORT_SELL' | 'BUY_TO_COVER' | 'DIVIDEND';
    date: string;
    shares?: number;
    price?: number;
    total?: number;
    realizedPnL?: number;
    fee?: number;
  }>,
  completedAtMs = Date.now(),
  archive?: {
    equityHistory?: PaperAccountValueSnapshot[];
    finalPositions?: PaperChallengeArchivedPosition[];
    finalRank?: number;
  },
): PaperChallengeSummary {
  const eventTransactions = transactions.filter((transaction) => {
    const timestamp = Date.parse(transaction.date);
    return transaction.accountId === enrollment.accountId
      && timestamp >= enrollment.joinedAtMs
      && timestamp <= enrollment.eventEndAtMs;
  });
  const trades = eventTransactions.filter((transaction) =>
    transaction.action === 'BUY' || transaction.action === 'SELL'
      || transaction.action === 'SHORT_SELL' || transaction.action === 'BUY_TO_COVER');
  const buys = trades.filter((transaction) => transaction.action === 'BUY' || transaction.action === 'BUY_TO_COVER');
  const sells = trades.filter((transaction) => transaction.action === 'SELL' || transaction.action === 'SHORT_SELL');
  const realizedPnL = eventTransactions.reduce(
    (total, transaction) => total + (transaction.action === 'SELL' || transaction.action === 'BUY_TO_COVER'
      ? (transaction.realizedPnL ?? 0) - (transaction.fee ?? 0)
      : 0),
    0,
  );
  const startingBalance = enrollment.eventType === 'lightning-round'
    ? enrollment.startEquity
    : enrollment.startingBalance ?? enrollment.startEquity;
  if (!Number.isFinite(startingBalance) || (startingBalance ?? 0) <= 0) {
    throw new Error('A valid event starting equity is required to save results.');
  }
  const netProfit = endEquity - startingBalance;
  return {
    ...enrollment,
    startEquity: startingBalance,
    startingBalance,
    artworkId: normalizePaperChallengeArtworkId(enrollment.artworkId),
    eventType: enrollment.eventType ?? 'event-arena',
    rankingDirection: enrollment.rankingDirection ?? 'highest-return',
    endEquity,
    netProfit,
    returnPercent: startingBalance > 0 ? netProfit / startingBalance * 100 : 0,
    tradeCount: trades.length,
    buyCount: buys.length,
    sellCount: sells.length,
    symbolsTraded: [...new Set(trades.map((transaction) => transaction.symbol).filter(Boolean))].sort(),
    realizedPnL,
    completedAtMs,
    transactions: eventTransactions.map((transaction) => ({
      id: transaction.id,
      symbol: transaction.symbol,
      action: transaction.action,
      shares: transaction.shares,
      price: transaction.price,
      total: transaction.total,
      date: transaction.date,
      realizedPnL: transaction.realizedPnL,
      fee: transaction.fee,
    })),
    ...(archive?.equityHistory
      ? {
          equityHistory: archive.equityHistory
            .filter((snapshot) => snapshot.accountId === enrollment.accountId)
            .filter((snapshot) => {
              const timestamp = Date.parse(snapshot.date);
              return Number.isFinite(timestamp)
                && timestamp >= enrollment.eventStartAtMs
                && timestamp <= completedAtMs
                && Number.isFinite(snapshot.value);
            })
            .map(({ date, value }) => ({ date, value }))
            .sort((a, b) => Date.parse(a.date) - Date.parse(b.date)),
        }
      : {}),
    ...(archive?.finalPositions ? { finalPositions: archive.finalPositions } : {}),
    ...(Number.isInteger(archive?.finalRank) && (archive?.finalRank ?? 0) > 0
      ? { finalRank: archive!.finalRank }
      : {}),
  };
}
