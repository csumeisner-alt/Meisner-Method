import { Router } from "express";
import { randomUUID } from "node:crypto";
import {
  EVENT_ARENA_RETENTION_DAYS,
  purgeExpiredEventArenaEntries,
} from "../lib/eventArenaRetention.ts";
import {
  getRegularEventCalendarError,
  getFirstLightningRoundCandidateDaySerial,
  getRegularEventSequenceIndex,
  getRegularEventWindowForStartDate,
  hasRegularEventWindowOverlap,
} from "../../../mobile/lib/paperChallengeCalendar.ts";
import { fetchYahooChartPrice } from "../lib/marketPrice.ts";
import { calculateLightningRoundScore } from "../lib/lightningRoundScore.ts";
import {
  isMountainChampionshipTransferLocked,
  LIGHTNING_ROUND_PREPARATION_MS,
  MOUNTAIN_CHAMPIONSHIP_TRANSFER_LOCK_MESSAGE,
} from "../../../mobile/lib/paperChallenge.ts";

export { EVENT_ARENA_RETENTION_DAYS, purgeExpiredEventArenaEntries } from "../lib/eventArenaRetention.ts";

interface EventArenaDatabase {
  query(sql: string, values?: any[]): Promise<{ rows: any[] }>;
  connect?: () => Promise<{
    query(sql: string, values?: any[]): Promise<{ rows: any[] }>;
    release: () => void;
  }>;
}

type Middleware = (req: any, res: any, next: any) => void;
type HoldingIdentifier = {
  symbol: string;
  companyName: string;
  allocationPercent: number | null;
  marketValue?: number | null;
  assetType?: "stock" | "etf" | "unknown";
  side: "long" | "short";
};
type EventSubmission = {
  installationId: string;
  alias: string;
  eventType?: "event-arena" | "green-bull-championship" | "bear-market-mayhem" | "penny-stock-mayhem" | "mountain-championship" | "one-stock-challenge" | "lightning-round";
  artworkId?: typeof EVENT_ARTWORK_IDS[number] | "lightning-round-arena";
  startingBalance?: number;
  rankingDirection?: "highest-return" | "lowest-return";
  purchaseLimit?: number;
  cashBalance: number;
  appliedTransferIds: string[];
  startEquity: number;
  equity: number;
  returnPercent: number;
  tradeCount: number | null;
  holdings: HoldingIdentifier[];
  eventStartAtMs: number;
  eventEndAtMs: number;
};

const DAY_MS = 86_400_000;
const MAX_HOLDINGS = 100;
const EVENT_ARTWORK_IDS = [
  "stadium",
  "neon-nightclub",
  "mountain-summit",
  "red-showdown",
  "green-stock-exchange",
  "penny-stock-mayhem",
  "one-stock-challenge",
] as const;
const PRE_PENNY_EVENT_ARTWORK_IDS = EVENT_ARTWORK_IDS.slice(0, 5);
const PRE_ONE_STOCK_EVENT_ARTWORK_IDS = EVENT_ARTWORK_IDS.slice(0, 6);

type EventArenaConfiguration = {
  eventId: string;
  eventType: "event-arena" | "green-bull-championship" | "bear-market-mayhem" | "penny-stock-mayhem" | "mountain-championship" | "one-stock-challenge" | "lightning-round";
  artworkId: typeof EVENT_ARTWORK_IDS[number] | "lightning-round-arena";
  startingBalance: number;
  rankingDirection: "highest-return" | "lowest-return";
  purchaseLimit?: number;
  startAtMs: number;
  endAtMs: number;
};

function validInstallationId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 12 && value.length <= 128;
}

function validTransferId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 96
    && /^[A-Za-z0-9_-]+$/.test(value);
}

async function withTransaction<T>(
  db: EventArenaDatabase,
  run: (client: EventArenaDatabase) => Promise<T>,
): Promise<T> {
  const client = db.connect ? await db.connect() : null;
  const connection: EventArenaDatabase = client ?? db;
  await connection.query("BEGIN");
  try {
    const result = await run(connection);
    await connection.query("COMMIT");
    return result;
  } catch (error) {
    await connection.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client?.release();
  }
}

function zonedParts(timestamp: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(read("year")),
    month: Number(read("month")),
    day: Number(read("day")),
    hour: Number(read("hour")),
    minute: Number(read("minute")),
  };
}

function zonedLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
) {
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = target;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const local = zonedParts(candidate, timeZone);
    candidate += target - Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  }
  const local = zonedParts(candidate, timeZone);
  if (
    local.year !== year || local.month !== month || local.day !== day
    || local.hour !== hour || local.minute !== minute
  ) throw new Error(`The scheduled local time does not exist in ${timeZone}.`);
  return candidate;
}

const LIGHTNING_ROUND_TIME_ZONE = "America/Denver";
const LIGHTNING_ROUND_START_HOUR = 7;
const LIGHTNING_ROUND_START_MINUTE = 30;
const LIGHTNING_ROUND_DAY_MS = 24 * 60 * 60 * 1000;
function expectedLightningRoundWindow(eventId: unknown) {
  if (typeof eventId !== "string" || !/^lightning-\d{4}-\d{2}-\d{2}$/.test(eventId)) return null;
  const dateText = eventId.slice("lightning-".length);
  const date = new Date(`${dateText}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime())
    || date.toISOString().slice(0, 10) !== dateText
    || date.getUTCDay() !== 5
    || Math.floor(date.getTime() / DAY_MS) < getFirstLightningRoundCandidateDaySerial()
    || !Number.isInteger(LIGHTNING_ROUND_START_HOUR)
    || LIGHTNING_ROUND_START_HOUR < 0
    || LIGHTNING_ROUND_START_HOUR > 23
    || !Number.isInteger(LIGHTNING_ROUND_START_MINUTE)
    || LIGHTNING_ROUND_START_MINUTE < 0
    || LIGHTNING_ROUND_START_MINUTE > 59
  ) return null;
  const startAtMs = zonedLocalToUtc(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    LIGHTNING_ROUND_START_HOUR,
    LIGHTNING_ROUND_START_MINUTE,
    LIGHTNING_ROUND_TIME_ZONE,
  );
  const endAtMs = startAtMs + LIGHTNING_ROUND_DAY_MS;
  if (hasScheduledRegularEventOverlap(startAtMs, endAtMs)) return null;
  return { startAtMs, endAtMs };
}

function expectedEventArenaWindow(eventId: unknown) {
  return getRegularEventWindowForStartDate(eventId);
}

function expectedScheduledEventWindow(eventId: unknown) {
  return expectedLightningRoundWindow(eventId) ?? expectedEventArenaWindow(eventId);
}

function rejectInvalidRegularEventCalendar(res: any): boolean {
  const error = getRegularEventCalendarError();
  if (!error) return false;
  res.status(503).json({ error });
  return true;
}

export function expectedEventArenaConfiguration(eventId: string): EventArenaConfiguration | null {
  const lightningWindow = expectedLightningRoundWindow(eventId);
  if (lightningWindow) {
    return {
      eventId,
      eventType: "lightning-round",
      artworkId: "lightning-round-arena",
      startingBalance: 100_000,
      rankingDirection: "highest-return",
      ...lightningWindow,
    };
  }
  const window = expectedEventArenaWindow(eventId);
  const sequenceIndex = getRegularEventSequenceIndex(eventId);
  if (!window || sequenceIndex === null) return null;
  const artworkId = EVENT_ARTWORK_IDS[
    sequenceIndex % EVENT_ARTWORK_IDS.length
  ];
  const isGreenBull = artworkId === "green-stock-exchange";
  const isNeonNightclub = artworkId === "neon-nightclub";
  const isBearMarket = artworkId === "red-showdown";
  const isPennyStockMayhem = artworkId === "penny-stock-mayhem";
  const isOneStockChallenge = artworkId === "one-stock-challenge";
  const isMountainChampionship = artworkId === "mountain-summit";
  return {
    eventId,
    eventType: isGreenBull
      ? "green-bull-championship"
      : isBearMarket ? "bear-market-mayhem"
        : isPennyStockMayhem ? "penny-stock-mayhem"
          : isMountainChampionship ? "mountain-championship"
            : isOneStockChallenge ? "one-stock-challenge" : "event-arena",
    artworkId,
    startingBalance: isGreenBull ? 500_000 : isNeonNightclub ? 250_000 : 100_000,
    rankingDirection: isBearMarket ? "lowest-return" : "highest-return",
    ...(isPennyStockMayhem ? { purchaseLimit: 20 } : {}),
    ...window,
  };
}

/** Resolve previous rotations so already saved event IDs stay immutable. */
function previousRegularEventArenaConfigurations(eventId: string): EventArenaConfiguration[] {
  const window = expectedEventArenaWindow(eventId);
  const sequenceIndex = getRegularEventSequenceIndex(eventId);
  if (!window || sequenceIndex === null) return [];
  return [PRE_ONE_STOCK_EVENT_ARTWORK_IDS, PRE_PENNY_EVENT_ARTWORK_IDS].map((rotation) => {
    const artworkId = rotation[sequenceIndex % rotation.length];
    const isGreenBull = artworkId === "green-stock-exchange";
    const isBearMarket = artworkId === "red-showdown";
    const isMountainChampionship = artworkId === "mountain-summit";
    return {
      eventId,
      eventType: isGreenBull
        ? "green-bull-championship"
        : isBearMarket ? "bear-market-mayhem"
          : isMountainChampionship ? "mountain-championship" : "event-arena",
      artworkId,
      startingBalance: isGreenBull ? 500_000 : 100_000,
      rankingDirection: isBearMarket ? "lowest-return" : "highest-return",
      ...window,
    };
  });
}

export function getLightningRoundScheduleIds(nowMs = Date.now(), fromEventId?: string | null): string[] {
  const local = zonedParts(nowMs, LIGHTNING_ROUND_TIME_ZONE);
  const localSerial = Math.floor(Date.UTC(local.year, local.month - 1, local.day) / DAY_MS);
  const today = new Date(localSerial * DAY_MS);
  const currentFridaySerial = localSerial + (today.getUTCDay() === 6
    ? -1
    : (5 - today.getUTCDay() + 7) % 7);
  const fromDate = typeof fromEventId === "string" && /^lightning-\d{4}-\d{2}-\d{2}$/.test(fromEventId)
    ? new Date(`${fromEventId.slice("lightning-".length)}T00:00:00.000Z`)
    : null;
  const fromSerial = fromDate
    && Number.isFinite(fromDate.getTime())
    && fromDate.toISOString().slice(0, 10) === fromEventId?.slice("lightning-".length)
    && fromDate.getUTCDay() === 5
    ? Math.floor(fromDate.getTime() / DAY_MS)
    : null;
  // If the worker has never prepared a round, recover the recent couple of
  // weeks. Otherwise continue from its last started round to fill any gap.
  const firstFridaySerial = Math.max(
    fromSerial ?? Math.max(getFirstLightningRoundCandidateDaySerial(), currentFridaySerial - 14),
    getFirstLightningRoundCandidateDaySerial(),
  );
  const lastSerial = currentFridaySerial + 21;
  const eventIds: string[] = [];
  for (let serial = firstFridaySerial; serial <= lastSerial; serial += 7) {
    const date = new Date(serial * DAY_MS);
    const eventId = `lightning-${date.toISOString().slice(0, 10)}`;
    if (expectedLightningRoundWindow(eventId)) eventIds.push(eventId);
  }
  return eventIds;
}

/** A regular competition takes priority whenever its scheduled window intersects. */
export function hasScheduledRegularEventOverlap(startAtMs: number, endAtMs: number): boolean {
  return hasRegularEventWindowOverlap(startAtMs, endAtMs);
}

function savedEventArenaConfiguration(row: any, expected: EventArenaConfiguration): EventArenaConfiguration | null {
  const eventType = row.event_type;
  const artworkId = row.artwork_id;
  const startingBalance = Number(row.starting_balance);
  const rankingDirection = row.ranking_direction;
  const purchaseLimit = row.purchase_limit == null ? undefined : Number(row.purchase_limit);
  const rowStartAtMs = row.event_start_at instanceof Date
    ? row.event_start_at.getTime()
    : new Date(row.event_start_at).getTime();
  const rowEndAtMs = row.event_end_at instanceof Date
    ? row.event_end_at.getTime()
    : new Date(row.event_end_at).getTime();
  const isCurrentConfiguration = eventType === expected.eventType
    && artworkId === expected.artworkId
    && startingBalance === expected.startingBalance
    && rankingDirection === expected.rankingDirection
    && purchaseLimit === expected.purchaseLimit;
  const previousConfigurations = previousRegularEventArenaConfigurations(expected.eventId);
  const previous = previousConfigurations.find((candidate) =>
    eventType === candidate.eventType
    && artworkId === candidate.artworkId
    && startingBalance === candidate.startingBalance
    && rankingDirection === candidate.rankingDirection
    && purchaseLimit === undefined,
  );
  const isPreviousConfiguration = !!previous;
  // A pre-existing Red Showdown event remains a standard Event Arena event.
  const isLegacyRedConfiguration = artworkId === "red-showdown"
    && eventType === "event-arena"
    && startingBalance === 100_000
    && rankingDirection === "highest-return"
    && purchaseLimit === undefined;
  const isLegacyMountainConfiguration = expected.eventType === "mountain-championship"
    && eventType === "event-arena"
    && artworkId === "mountain-summit"
    && startingBalance === 100_000
    && rankingDirection === "highest-return"
    && purchaseLimit === undefined;
  if (
    row.event_id !== expected.eventId
    || rowStartAtMs !== expected.startAtMs
    || rowEndAtMs !== expected.endAtMs
    || (!isCurrentConfiguration && !isPreviousConfiguration && !isLegacyRedConfiguration && !isLegacyMountainConfiguration)
  ) return null;
  const normalizeLegacyMountainType = isLegacyMountainConfiguration;
  return {
    eventId: expected.eventId,
    eventType: normalizeLegacyMountainType ? expected.eventType : eventType,
    artworkId,
    startingBalance,
    rankingDirection,
    ...(purchaseLimit !== undefined ? { purchaseLimit } : {}),
    startAtMs: expected.startAtMs,
    endAtMs: expected.endAtMs,
  };
}

async function ensureEventArenaConfiguration(
  db: EventArenaDatabase,
  eventId: string,
  nowMs = Date.now(),
): Promise<EventArenaConfiguration | null> {
  const expected = expectedEventArenaConfiguration(eventId);
  if (!expected) return null;
  const values = [
    expected.eventId,
    expected.eventType,
    expected.artworkId,
    expected.startingBalance,
    expected.rankingDirection,
    expected.purchaseLimit ?? null,
    expected.startAtMs,
    expected.endAtMs,
  ];
  const { rows: inserted } = await db.query(
    `INSERT INTO event_arena_events
      (event_id, event_type, artwork_id, starting_balance, ranking_direction, purchase_limit, event_start_at, event_end_at)
     VALUES ($1,$2,$3,$4,$5,$6,TO_TIMESTAMP($7 / 1000.0),TO_TIMESTAMP($8 / 1000.0))
     ON CONFLICT (event_id) DO NOTHING
     RETURNING event_id, event_type, artwork_id, starting_balance, ranking_direction, purchase_limit, event_start_at, event_end_at`,
    values,
  );
  let row = inserted[0] ?? (await db.query(
     `SELECT event_id, event_type, artwork_id, starting_balance, ranking_direction, purchase_limit, event_start_at, event_end_at
     FROM event_arena_events WHERE event_id=$1`,
    [eventId],
  )).rows[0];
  if (!row) return null;

  const rowStartAtMs = row.event_start_at instanceof Date
    ? row.event_start_at.getTime()
    : new Date(row.event_start_at).getTime();
  const isUnstartedNeonNightclubConfig = expected.artworkId === "neon-nightclub"
    && nowMs < expected.startAtMs
    && row.event_id === expected.eventId
    && row.event_type === "event-arena"
    && row.artwork_id === "neon-nightclub"
    && Number(row.starting_balance) === 100_000
    && row.ranking_direction === "highest-return"
    && row.purchase_limit == null
    && rowStartAtMs === expected.startAtMs;
  if (isUnstartedNeonNightclubConfig) {
    const { rows: promotedRows } = await db.query(
      `UPDATE event_arena_events
       SET starting_balance=$2
       WHERE event_id=$1
         AND event_type='event-arena'
         AND artwork_id='neon-nightclub'
         AND starting_balance=100000
         AND ranking_direction='highest-return'
         AND purchase_limit IS NULL
         AND event_start_at > TO_TIMESTAMP($3 / 1000.0)
       RETURNING event_id, event_type, artwork_id, starting_balance, ranking_direction, purchase_limit, event_start_at, event_end_at`,
      [eventId, expected.startingBalance, nowMs],
    );
    if (promotedRows[0]) row = promotedRows[0];
    else {
      row = (await db.query(
        `SELECT event_id, event_type, artwork_id, starting_balance, ranking_direction, purchase_limit, event_start_at, event_end_at
         FROM event_arena_events WHERE event_id=$1`,
        [eventId],
      )).rows[0];
    }
  }
  if (!row) return null;
  return savedEventArenaConfiguration(row, expected);
}

export async function prepareLightningRoundEvents(
  db: EventArenaDatabase,
  nowMs = Date.now(),
): Promise<EventArenaConfiguration[]> {
  const calendarError = getRegularEventCalendarError();
  if (calendarError) throw new Error(calendarError);
  const { rows } = await db.query(
    `SELECT event_id
     FROM event_arena_events
     WHERE event_type='lightning-round' AND event_start_at <= TO_TIMESTAMP($1 / 1000.0)
     ORDER BY event_start_at DESC
     LIMIT 1`,
    [nowMs],
  );
  const latestStartedEventId = typeof rows[0]?.event_id === "string" ? rows[0].event_id : null;
  const scheduledIds = getLightningRoundScheduleIds(nowMs, latestStartedEventId);
  const events = await Promise.all(scheduledIds.map((eventId) => ensureEventArenaConfiguration(db, eventId, nowMs)));
  if (events.some((event) => !event)) {
    throw new Error("A Lightning Round schedule conflicts with a saved event.");
  }
  return events as EventArenaConfiguration[];
}

export const LIGHTNING_ROUND_UNAVAILABLE_MESSAGE =
  "No eligible Lightning Round dates are available because every upcoming Friday overlaps a regular Event Arena event.";

/** Accept only eligible Lightning Round and regular scheduled windows. */
export function isValidEventArenaWindow(
  eventId: unknown,
  startAtMs: unknown,
  endAtMs: unknown,
): eventId is string {
  if (
    typeof startAtMs !== "number"
    || !Number.isFinite(startAtMs)
    || typeof endAtMs !== "number"
    || !Number.isFinite(endAtMs)
  ) return false;
  const expected = expectedScheduledEventWindow(eventId);
  return !!expected && startAtMs === expected.startAtMs && endAtMs === expected.endAtMs;
}

function parseSubmission(body: unknown): EventSubmission | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const value = body as Record<string, unknown>;
  const allowedKeys = new Set([
    "installationId",
    "alias",
    "eventType",
    "artworkId",
    "startingBalance",
    "rankingDirection",
    "purchaseLimit",
    "cashBalance",
    "appliedTransferIds",
    "startEquity",
    "equity",
    "returnPercent",
    "tradeCount",
    "holdings",
    "eventStartAtMs",
    "eventEndAtMs",
  ]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) return null;

  const alias = typeof value.alias === "string" ? value.alias.trim() : "";
  const eventType = value.eventType;
  const artworkId = value.artworkId;
  const startingBalance = value.startingBalance;
  const rankingDirection = value.rankingDirection;
  const purchaseLimit = value.purchaseLimit;
  const startEquity = value.startEquity;
  const equity = value.equity;
  const returnPercent = value.returnPercent;
  const tradeCount = value.tradeCount;
  const holdings = value.holdings;
  const cashBalance = value.cashBalance;
  const appliedTransferIds = value.appliedTransferIds ?? [];
  if (
    !validInstallationId(value.installationId)
    || alias.length < 1
    || alias.length > 24
    || /[\u0000-\u001f\u007f]/.test(alias)
    || (eventType !== undefined
      && eventType !== "event-arena"
      && eventType !== "green-bull-championship"
      && eventType !== "bear-market-mayhem"
      && eventType !== "penny-stock-mayhem"
      && eventType !== "mountain-championship"
      && eventType !== "one-stock-challenge"
      && eventType !== "lightning-round")
    || (artworkId !== undefined
      && !EVENT_ARTWORK_IDS.includes(artworkId as typeof EVENT_ARTWORK_IDS[number])
      && artworkId !== "lightning-round-arena")
    || (startingBalance !== undefined && (typeof startingBalance !== "number"
      || !Number.isFinite(startingBalance) || startingBalance <= 0))
    || (rankingDirection !== undefined
      && rankingDirection !== "highest-return"
      && rankingDirection !== "lowest-return")
    || (purchaseLimit !== undefined && (typeof purchaseLimit !== "number"
      || !Number.isFinite(purchaseLimit) || purchaseLimit <= 0))
    || (cashBalance !== undefined && (typeof cashBalance !== "number"
      || !Number.isFinite(cashBalance) || cashBalance < 0 || cashBalance > 10_000_000))
    || !Array.isArray(appliedTransferIds)
    || appliedTransferIds.length > 500
    || appliedTransferIds.some((id) => !validTransferId(id))
    || typeof startEquity !== "number"
    || !Number.isFinite(startEquity)
    || startEquity <= 0
    || startEquity > 1_000_000
    || typeof equity !== "number"
    || !Number.isFinite(equity)
    || equity < 0
    || equity > 10_000_000
    || typeof returnPercent !== "number"
    || !Number.isFinite(returnPercent)
    || Math.abs(returnPercent) > 100_000
    || Math.abs(returnPercent - ((equity - startEquity) / startEquity) * 100) > 0.02
    || (tradeCount !== undefined && tradeCount !== null
      && (typeof tradeCount !== "number" || !Number.isInteger(tradeCount) || tradeCount < 0 || tradeCount > 100_000))
    || !Array.isArray(holdings)
    || holdings.length > MAX_HOLDINGS
    || typeof value.eventStartAtMs !== "number"
    || typeof value.eventEndAtMs !== "number"
  ) return null;

  const cleanHoldings: HoldingIdentifier[] = [];
  const seenSymbols = new Set<string>();
  for (const rawHolding of holdings) {
    if (!rawHolding || typeof rawHolding !== "object" || Array.isArray(rawHolding)) return null;
    const holding = rawHolding as Record<string, unknown>;
    if (
      Object.keys(holding).some((key) =>
        !["symbol", "companyName", "allocationPercent", "marketValue", "assetType", "side"].includes(key))
      || typeof holding.symbol !== "string"
      || typeof holding.companyName !== "string"
      || (holding.allocationPercent !== null
        && (typeof holding.allocationPercent !== "number"
          || !Number.isFinite(holding.allocationPercent)
          || holding.allocationPercent < 0))
      || (holding.marketValue !== undefined
        && holding.marketValue !== null
        && (typeof holding.marketValue !== "number"
          || !Number.isFinite(holding.marketValue)
          || holding.marketValue < 0))
      || (holding.assetType !== undefined
        && holding.assetType !== "stock"
        && holding.assetType !== "etf"
        && holding.assetType !== "unknown")
      || (holding.side !== "long" && holding.side !== "short")
    ) return null;
    const symbol = holding.symbol.trim().toUpperCase();
    const companyName = holding.companyName.trim();
    if (
      !/^[A-Z0-9.^=-]{1,15}$/.test(symbol)
      || companyName.length < 1
      || companyName.length > 120
      || /[\u0000-\u001f\u007f]/.test(companyName)
    ) return null;
    if (!seenSymbols.has(symbol)) {
      seenSymbols.add(symbol);
      cleanHoldings.push({
        symbol,
        companyName,
        allocationPercent: holding.allocationPercent as number | null,
        ...(holding.marketValue !== undefined
          ? { marketValue: holding.marketValue as number | null }
          : {}),
        ...(holding.assetType !== undefined ? { assetType: holding.assetType } : {}),
        side: holding.side,
      });
    }
  }

  return {
    installationId: value.installationId,
    alias,
    ...(eventType !== undefined ? { eventType } : {}),
    ...(typeof artworkId === "string" ? { artworkId: artworkId as EventSubmission["artworkId"] } : {}),
    ...(startingBalance !== undefined ? { startingBalance } : {}),
    ...(rankingDirection !== undefined ? { rankingDirection } : {}),
    ...(purchaseLimit !== undefined ? { purchaseLimit } : {}),
    cashBalance: typeof cashBalance === "number" ? cashBalance : startEquity,
    appliedTransferIds: [...new Set(appliedTransferIds as string[])],
    startEquity,
    equity,
    // Score returns are self-reported but must be internally consistent.
    returnPercent: ((equity - startEquity) / startEquity) * 100,
    tradeCount: typeof tradeCount === "number" ? tradeCount : null,
    holdings: cleanHoldings,
    eventStartAtMs: value.eventStartAtMs,
    eventEndAtMs: value.eventEndAtMs,
  };
}

function publicEntry(row: any, rank: number, isCurrentUser: boolean) {
  let holdings: unknown = row.holdings;
  if (typeof holdings === "string") {
    try { holdings = JSON.parse(holdings); } catch { holdings = []; }
  }
  const cleanHoldings = Array.isArray(holdings)
    ? holdings.flatMap((item: any) => (
      item
      && typeof item.symbol === "string"
      && typeof item.companyName === "string"
        && (item.side === undefined || item.side === "long" || item.side === "short")
        ? [{
          symbol: item.symbol,
          companyName: item.companyName,
          allocationPercent: typeof item.allocationPercent === "number"
            && Number.isFinite(item.allocationPercent)
            && item.allocationPercent >= 0
            ? item.allocationPercent
            : null,
          marketValue: typeof item.marketValue === "number"
            && Number.isFinite(item.marketValue)
            && item.marketValue >= 0
            ? item.marketValue
            : null,
          assetType: item.assetType === "stock" || item.assetType === "etf" || item.assetType === "unknown"
            ? item.assetType
            : undefined,
          // Older persisted entries were created from positive-share positions only.
          side: item.side === "short" ? "short" : "long",
        }]
        : []
    ))
    : [];
  const updatedAt = row.updated_at instanceof Date
    ? row.updated_at.toISOString()
    : row.updated_at;
  return {
    rank,
    alias: row.alias,
    participantToken: row.participant_token,
    startEquity: Number(row.start_equity),
    equity: Number(row.equity),
    profitLoss: Number(row.equity) - Number(row.start_equity),
    returnPercent: ((Number(row.equity) - Number(row.start_equity)) / Number(row.start_equity)) * 100,
    tradeCount: Number.isInteger(Number(row.trade_count)) && row.trade_count != null
      ? Number(row.trade_count)
      : null,
    cashBalance: Number.isFinite(Number(row.cash_balance)) ? Number(row.cash_balance) : 0,
    holdings: cleanHoldings,
    updatedAt,
    isCurrentUser,
  };
}

function compareText(a: unknown, b: unknown) {
  const left = String(a ?? "");
  const right = String(b ?? "");
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Rank by percentage return derived from submitted equity and starting equity.
 * Equal returns sort by newest update, alias, then private installation ID.
 * The final key is never included in public entries.
 */
export function rankEventArenaEntries(
  rows: any[],
  requestingInstallationId: string | null = null,
  rankingDirection: "highest-return" | "lowest-return" = "highest-return",
) {
  return rows
    .map((row) => ({
      row,
      startEquity: Number(row.start_equity),
      equity: Number(row.equity),
      updatedAtMs: row.updated_at instanceof Date
        ? row.updated_at.getTime()
        : new Date(row.updated_at).getTime(),
    }))
    .filter(({ row, startEquity, equity }) =>
      typeof row.alias === "string"
      && Number.isFinite(startEquity)
      && startEquity > 0
      && Number.isFinite(equity)
      && equity >= 0,
    )
    .map((entry) => ({
      ...entry,
      returnPercent: ((entry.equity - entry.startEquity) / entry.startEquity) * 100,
    }))
    .sort((a, b) =>
      (rankingDirection === "highest-return"
        ? b.returnPercent - a.returnPercent
        : a.returnPercent - b.returnPercent)
      || b.updatedAtMs - a.updatedAtMs
      || compareText(a.row.alias, b.row.alias)
      || compareText(a.row.installation_id, b.row.installation_id),
    )
    .map(({ row }, index) => publicEntry(
      row,
      index + 1,
      Boolean(requestingInstallationId && row.installation_id === requestingInstallationId),
    ));
}

export function createEventArenaRouter(
  db: EventArenaDatabase,
  requireSchema: Middleware,
  now: () => number = Date.now,
  fetchLightningPrice: (symbol: string) => Promise<number | null> = fetchYahooChartPrice,
) {
  const router = Router();

  router.post("/event-arena/lightning-round/prepare", requireSchema, async (_req: any, res: any) => {
    if (rejectInvalidRegularEventCalendar(res)) return;
    try {
      const events = await prepareLightningRoundEvents(db, now());
      res.json({
        events,
        available: events.length > 0,
        ...(events.length > 0 ? {} : { message: LIGHTNING_ROUND_UNAVAILABLE_MESSAGE }),
      });
    } catch {
      res.status(500).json({ error: "Could not prepare the upcoming Lightning Round events." });
    }
  });

  router.post("/event-arena/lightning-round/:eventId/leave", requireSchema, async (req: any, res: any) => {
    const installationId = req.get("x-event-arena-installation-id");
    const configuration = expectedLightningRoundWindow(req.params.eventId);
    if (!validInstallationId(installationId) || !configuration) {
      res.status(400).json({ error: "A scheduled Lightning Round and valid installation ID are required." });
      return;
    }
    if (now() >= configuration.startAtMs) {
      res.status(409).json({ error: "Lightning Round registration is closed." });
      return;
    }
    try {
      let registrationClosed = false;
      let removed = false;
      await withTransaction(db, async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [req.params.eventId]);
        if (now() >= configuration.startAtMs) {
          registrationClosed = true;
          return;
        }
        const { rows } = await client.query(
          `SELECT account_id FROM event_arena_lightning_participants
           WHERE event_id=$1 AND installation_id=$2 AND status='queued'
           FOR UPDATE`,
          [req.params.eventId, installationId],
        );
        if (now() >= configuration.startAtMs) {
          registrationClosed = true;
          return;
        }
        const accountId = rows[0]?.account_id;
        if (!accountId) return;
        await client.query(
          `UPDATE paper_orders SET status='cancelled',rejection_reason='Lightning Round enrollment cancelled'
           WHERE user_id=$1 AND account_id=$2 AND lightning_round_event_id=$3 AND status='pending'`,
          [installationId, accountId, req.params.eventId],
        );
        await client.query(
          `DELETE FROM event_arena_lightning_participants
           WHERE event_id=$1 AND installation_id=$2 AND status='queued'`,
          [req.params.eventId, installationId],
        );
        removed = true;
      });
      if (registrationClosed) {
        res.status(409).json({ error: "Lightning Round registration is closed." });
        return;
      }
      res.json({ ok: true, eventId: req.params.eventId, removed });
    } catch {
      res.status(500).json({ error: "Could not leave the Lightning Round." });
    }
  });

  router.put("/event-arena/reminder-preference", requireSchema, async (req: any, res: any) => {
    const installationId = req.get("x-event-arena-installation-id");
    const enabled = req.body?.enabled;
    if (!validInstallationId(installationId) || typeof enabled !== "boolean") {
      res.status(400).json({ error: "A valid installation ID and enabled boolean are required." });
      return;
    }
    try {
      await db.query(
        `INSERT INTO event_arena_reminder_preferences (installation_id, enabled, updated_at)
         VALUES ($1,$2,NOW())
         ON CONFLICT (installation_id) DO UPDATE
         SET enabled=EXCLUDED.enabled, updated_at=NOW()`,
        [installationId, enabled],
      );
      res.json({ enabled });
    } catch {
      res.status(500).json({ error: "Could not update Event Arena reminder settings." });
    }
  });

  router.delete("/event-arena/lightning-round/:eventId/participant", requireSchema, async (req: any, res: any) => {
    const installationId = req.get("x-event-arena-installation-id");
    const configuration = expectedLightningRoundWindow(req.params.eventId);
    if (!validInstallationId(installationId) || !configuration) {
      res.status(400).json({ error: "A scheduled Lightning Round and valid installation ID are required." });
      return;
    }
    try {
      await db.query(
        `DELETE FROM event_arena_lightning_participants
         WHERE event_id=$1 AND installation_id=$2 AND status='queued' AND event_start_at > NOW()`,
        [req.params.eventId, installationId],
      );
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Could not remove your Lightning Round entry." });
    }
  });

  router.put("/event-arena/lightning-round/:eventId/state", requireSchema, async (req: any, res: any) => {
    const installationId = req.get("x-event-arena-installation-id");
    const configuration = expectedLightningRoundWindow(req.params.eventId);
    if (!validInstallationId(installationId) || !configuration) {
      res.status(400).json({ error: "A scheduled Lightning Round and valid installation ID are required." });
      return;
    }
    const currentTime = now();
    if (
      currentTime < configuration.startAtMs - LIGHTNING_ROUND_PREPARATION_MS
      || currentTime >= configuration.startAtMs
    ) {
      res.status(409).json({ error: "Lightning Round account preparation is closed." });
      return;
    }
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? req.body as Record<string, any>
      : null;
    const account = body?.account;
    const alias = typeof body?.alias === "string" ? body.alias.trim() : "";
    const accountId = typeof account?.id === "string" ? account.id : "";
    const positions = body?.positions;
    const transactions = body?.transactions;
    const orders = body?.orders;
    const lots = body?.lots;
    const arraysValid = [positions, transactions, orders, lots].every((value) =>
      Array.isArray(value) && value.length <= 2_000,
    );
    const invalidCurrentEventOrder = Array.isArray(orders) && orders.some((order: any) =>
      order?.lightningRoundEventId === req.params.eventId
      && (
        !["pending", "cancelled"].includes(order.status)
        || order.orderType !== "market"
        || order.side !== "buy"
        || Boolean(order.intent)
        || typeof order.symbol !== "string"
        || !/^[A-Z0-9.^=-]{1,15}$/.test(order.symbol)
        || !Number.isFinite(order.shares)
        || order.shares <= 0
      ),
    );
    if (
      !account || typeof account !== "object" || Array.isArray(account)
      || accountId.length < 1 || accountId.length > 200
      || typeof account.name !== "string" || account.name.length > 120
      || typeof account.cash !== "number" || !Number.isFinite(account.cash) || account.cash < 0
      || alias.length < 1 || alias.length > 24 || /[\u0000-\u001f\u007f]/.test(alias)
      || !arraysValid
      || [...positions, ...transactions, ...orders, ...lots].some((item: any) =>
        !item || typeof item !== "object" || item.accountId !== accountId,
      )
      || invalidCurrentEventOrder
    ) {
      res.status(400).json({ error: "The Lightning Round account snapshot is invalid." });
      return;
    }

    try {
      const savedConfiguration = await ensureEventArenaConfiguration(db, req.params.eventId, now());
      if (!savedConfiguration || savedConfiguration.startAtMs !== configuration.startAtMs) {
        res.status(409).json({ error: "This Lightning Round schedule does not match its saved configuration." });
        return;
      }
      let preparationClosed = false;
      await withTransaction(db, async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [req.params.eventId]);
        if (now() >= configuration.startAtMs) {
          preparationClosed = true;
          return;
        }
        await client.query(
          `INSERT INTO event_arena_lightning_participants
            (event_id,installation_id,account_id,alias,status,failure_reason,event_start_at,event_end_at,updated_at)
           VALUES ($1,$2,$3,$4,'queued',NULL,TO_TIMESTAMP($5 / 1000.0),TO_TIMESTAMP($6 / 1000.0),NOW())
           ON CONFLICT (event_id,installation_id) DO UPDATE SET
             account_id=EXCLUDED.account_id,alias=EXCLUDED.alias,status='queued',
             failure_reason=NULL,updated_at=NOW()
           WHERE event_arena_lightning_participants.status='queued'`,
          [
            req.params.eventId, installationId, accountId, alias,
            configuration.startAtMs, configuration.endAtMs,
          ],
        );
        await client.query(
          `INSERT INTO paper_accounts
            (id,user_id,name,cash,short_collateral,short_collateral_ratio,created_at,unsettled_items,last_dividend_credit)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
           ON CONFLICT (id,user_id) DO UPDATE SET
             name=EXCLUDED.name,cash=EXCLUDED.cash,short_collateral=EXCLUDED.short_collateral,
             short_collateral_ratio=EXCLUDED.short_collateral_ratio,
             unsettled_items=EXCLUDED.unsettled_items,last_dividend_credit=EXCLUDED.last_dividend_credit`,
          [
            accountId, installationId, account.name, account.cash,
            Number.isFinite(account.shortCollateral) ? account.shortCollateral : 0,
            Number.isFinite(account.shortCollateralRatio) ? account.shortCollateralRatio : 1.5,
            account.createdAt ?? new Date(currentTime).toISOString(),
            JSON.stringify(Array.isArray(account.unsettledItems) ? account.unsettledItems : []),
            account.lastDividendCredit ?? null,
          ],
        );
        await client.query("DELETE FROM paper_positions WHERE user_id=$1 AND account_id=$2", [installationId, accountId]);
        for (const position of positions) {
          await client.query(
            `INSERT INTO paper_positions
              (id,user_id,account_id,symbol,company_name,shares,avg_cost,position_type,collateral_per_share,
               opened_at,dividend_yield,dividend_rate,expense_ratio,sector)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
            [
              position.id, installationId, accountId, position.symbol, position.companyName ?? "",
              position.shares, position.avgCost, position.positionType === "short" ? "short" : "long",
              position.collateralPerShare ?? null, position.openedAt, position.dividendYield ?? 0,
              position.dividendRate ?? 0, position.expenseRatio ?? 0, position.sector ?? "",
            ],
          );
        }
        await client.query(
          "DELETE FROM paper_transactions WHERE user_id=$1 AND account_id=$2 AND lightning_round_event_id IS NULL",
          [installationId, accountId],
        );
        for (const transaction of transactions.filter((item: any) => !item.lightningRoundEventId)) {
          await client.query(
            `INSERT INTO paper_transactions
              (id,user_id,account_id,symbol,company_name,action,shares,price,total,date,realized_pnl,fee,
               cash_delta,short_collateral_delta,lightning_round_event_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
            [
              transaction.id, installationId, accountId, transaction.symbol, transaction.companyName ?? "",
              transaction.action, transaction.shares, transaction.price, transaction.total, transaction.date,
              transaction.realizedPnL ?? null, transaction.fee ?? 0, transaction.cashDelta ?? null,
              transaction.shortCollateralDelta ?? null, null,
            ],
          );
        }
        await client.query(
          "DELETE FROM paper_orders WHERE user_id=$1 AND account_id=$2 AND lightning_round_event_id IS NULL",
          [installationId, accountId],
        );
        await client.query(
          "DELETE FROM paper_orders WHERE user_id=$1 AND account_id=$2 AND lightning_round_event_id=$3",
          [installationId, accountId, req.params.eventId],
        );
        for (const order of orders.filter((item: any) =>
          !item.lightningRoundEventId || item.lightningRoundEventId === req.params.eventId,
        )) {
          await client.query(
            `INSERT INTO paper_orders
              (id,user_id,account_id,symbol,company_name,order_type,side,intent,short_collateral_ratio,
               shares,limit_price,stop_price,trail_pct,trail_abs,trail_ref,status,filled_price,filled_at,
               placed_at,lightning_round_event_id,rejection_reason,asset_type,dividend_yield,dividend_rate,
               expense_ratio,sector)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)`,
            [
              order.id, installationId, accountId, order.symbol, order.companyName ?? "",
              order.orderType, order.side, order.intent ?? null, order.shortCollateralRatio ?? null,
              order.shares, order.limitPrice ?? null, order.stopPrice ?? null, order.trailPct ?? null,
              order.trailAbs ?? null, order.trailRef ?? null, order.status, order.filledPrice ?? null,
              order.filledAt ?? null, order.placedAt, order.lightningRoundEventId ?? null,
              order.rejectionReason ?? null, order.assetType ?? null, order.dividendYield ?? 0,
              order.dividendRate ?? 0, order.expenseRatio ?? 0, order.sector ?? null,
            ],
          );
        }
        await client.query("DELETE FROM paper_lots WHERE user_id=$1 AND account_id=$2", [installationId, accountId]);
        for (const lot of lots) {
          await client.query(
            `INSERT INTO paper_lots (id,user_id,account_id,symbol,shares,cost,purchased_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [lot.id, installationId, accountId, lot.symbol, lot.shares, lot.cost, lot.purchasedAt],
          );
        }
      });
      if (preparationClosed) {
        res.status(409).json({ error: "Lightning Round account preparation is closed." });
        return;
      }
      res.json({ ok: true, eventId: req.params.eventId, accountId });
    } catch {
      res.status(500).json({ error: "Could not save the Lightning Round account snapshot." });
    }
  });

  router.get("/event-arena/lightning-round/:eventId/state", requireSchema, async (req: any, res: any) => {
    const installationId = req.get("x-event-arena-installation-id");
    if (!validInstallationId(installationId) || !expectedLightningRoundWindow(req.params.eventId)) {
      res.status(400).json({ error: "A scheduled Lightning Round and valid installation ID are required." });
      return;
    }
    try {
      const { rows: participants } = await db.query(
        `SELECT event_id,installation_id,account_id,alias,status,failure_reason,final_result
         FROM event_arena_lightning_participants WHERE event_id=$1 AND installation_id=$2`,
        [req.params.eventId, installationId],
      );
      const participant = participants[0];
      if (!participant || participant.installation_id !== installationId) {
        res.status(404).json({ error: "Lightning Round participation was not found." });
        return;
      }
      const accountId = participant.account_id;
      const [accounts, positions, transactions, orders, lots] = await Promise.all([
        db.query(
          `SELECT id,name,cash,short_collateral,short_collateral_ratio,created_at,unsettled_items,last_dividend_credit
           FROM paper_accounts WHERE id=$1 AND user_id=$2`,
          [accountId, installationId],
        ),
        db.query(
          `SELECT id,account_id,symbol,company_name,shares,position_type,collateral_per_share,avg_cost,opened_at,
                  dividend_yield,dividend_rate,expense_ratio,sector
           FROM paper_positions WHERE account_id=$1 AND user_id=$2`,
          [accountId, installationId],
        ),
        db.query(
          `SELECT id,account_id,symbol,company_name,action,shares,price,total,date,realized_pnl,fee,
                  cash_delta,short_collateral_delta,lightning_round_event_id
           FROM paper_transactions WHERE account_id=$1 AND user_id=$2 ORDER BY date ASC`,
          [accountId, installationId],
        ),
        db.query(
          `SELECT id,account_id,symbol,company_name,order_type,side,intent,short_collateral_ratio,shares,
                  limit_price,stop_price,trail_pct,trail_abs,trail_ref,status,filled_price,filled_at,placed_at,
                  lightning_round_event_id,rejection_reason,asset_type,dividend_yield,dividend_rate,expense_ratio,sector
           FROM paper_orders WHERE account_id=$1 AND user_id=$2 ORDER BY placed_at ASC`,
          [accountId, installationId],
        ),
        db.query(
          `SELECT id,account_id,symbol,shares,cost,purchased_at
           FROM paper_lots WHERE account_id=$1 AND user_id=$2 ORDER BY purchased_at ASC`,
          [accountId, installationId],
        ),
      ]);
      const iso = (value: any) => value instanceof Date ? value.toISOString() : value;
      res.json({
        participant: {
          eventId: participant.event_id,
          accountId,
          alias: participant.alias,
          status: participant.status,
          failureReason: participant.failure_reason ?? null,
          finalResult: participant.final_result ?? null,
        },
        account: accounts.rows[0] ? {
          id: accounts.rows[0].id,
          name: accounts.rows[0].name,
          cash: Number(accounts.rows[0].cash),
          shortCollateral: Number(accounts.rows[0].short_collateral ?? 0),
          shortCollateralRatio: Number(accounts.rows[0].short_collateral_ratio ?? 1.5),
          createdAt: iso(accounts.rows[0].created_at),
          unsettledItems: accounts.rows[0].unsettled_items ?? [],
          lastDividendCredit: iso(accounts.rows[0].last_dividend_credit),
        } : null,
        positions: positions.rows.map((row: any) => ({
          id: row.id, accountId: row.account_id, symbol: row.symbol, companyName: row.company_name ?? "",
          shares: Number(row.shares), positionType: row.position_type, collateralPerShare: row.collateral_per_share == null ? undefined : Number(row.collateral_per_share),
          avgCost: Number(row.avg_cost), openedAt: iso(row.opened_at), dividendYield: Number(row.dividend_yield ?? 0),
          dividendRate: Number(row.dividend_rate ?? 0), expenseRatio: Number(row.expense_ratio ?? 0), sector: row.sector ?? "",
        })),
        transactions: transactions.rows.map((row: any) => ({
          id: row.id, accountId: row.account_id, symbol: row.symbol, companyName: row.company_name ?? "",
          action: row.action, shares: Number(row.shares), price: Number(row.price), total: Number(row.total),
          date: iso(row.date), realizedPnL: row.realized_pnl == null ? undefined : Number(row.realized_pnl),
          fee: Number(row.fee ?? 0), cashDelta: row.cash_delta == null ? undefined : Number(row.cash_delta),
          shortCollateralDelta: row.short_collateral_delta == null ? undefined : Number(row.short_collateral_delta),
          lightningRoundEventId: row.lightning_round_event_id ?? undefined,
        })),
        orders: orders.rows.map((row: any) => ({
          id: row.id, accountId: row.account_id, symbol: row.symbol, companyName: row.company_name ?? "",
          orderType: row.order_type, side: row.side, ...(row.intent ? { intent: row.intent } : {}),
          shortCollateralRatio: row.short_collateral_ratio == null ? undefined : Number(row.short_collateral_ratio),
          shares: Number(row.shares), limitPrice: row.limit_price == null ? undefined : Number(row.limit_price),
          stopPrice: row.stop_price == null ? undefined : Number(row.stop_price), trailPct: row.trail_pct == null ? undefined : Number(row.trail_pct),
          trailAbs: row.trail_abs == null ? undefined : Number(row.trail_abs), trailRef: row.trail_ref == null ? undefined : Number(row.trail_ref),
          status: row.status, filledPrice: row.filled_price == null ? undefined : Number(row.filled_price),
          filledAt: iso(row.filled_at), placedAt: iso(row.placed_at),
          lightningRoundEventId: row.lightning_round_event_id ?? undefined,
          rejectionReason: row.rejection_reason ?? undefined,
          assetType: row.asset_type ?? undefined,
          dividendYield: row.dividend_yield == null ? undefined : Number(row.dividend_yield),
          dividendRate: row.dividend_rate == null ? undefined : Number(row.dividend_rate),
          expenseRatio: row.expense_ratio == null ? undefined : Number(row.expense_ratio),
          sector: row.sector ?? undefined,
        })),
        lots: lots.rows.map((row: any) => ({
          id: row.id, accountId: row.account_id, symbol: row.symbol, shares: Number(row.shares),
          cost: Number(row.cost), purchasedAt: iso(row.purchased_at),
        })),
      });
    } catch {
      res.status(500).json({ error: "Could not load Lightning Round execution results." });
    }
  });

  router.post("/event-arena/:eventId/config", requireSchema, async (req: any, res: any) => {
    if (rejectInvalidRegularEventCalendar(res)) return;
    const expected = expectedEventArenaConfiguration(req.params.eventId);
    if (!expected) {
      res.status(400).json({ error: "A scheduled Event Arena window is required." });
      return;
    }
    try {
      const configuration = await ensureEventArenaConfiguration(db, req.params.eventId, now());
      if (!configuration) {
        res.status(409).json({ error: "This event already has a different saved configuration." });
        return;
      }
      res.json(configuration);
    } catch {
      res.status(500).json({ error: "Could not save the Event Arena configuration." });
    }
  });

  router.get("/event-arena/leaderboard-weeks", requireSchema, async (_req: any, res: any) => {
    if (rejectInvalidRegularEventCalendar(res)) return;
    try {
      await purgeExpiredEventArenaEntries(db);
      const { rows } = await db.query(
        `SELECT
           event_id,
           MIN(event_start_at) AS start_at,
           MAX(event_end_at) AS end_at,
           COUNT(*)::int AS participant_count
         FROM event_arena_leaderboard_entries
         WHERE is_active=TRUE
           AND event_end_at <= NOW()
           AND event_end_at > NOW() - ($1 * INTERVAL '1 day')
         GROUP BY event_id
         HAVING COUNT(*) > 0
         ORDER BY MAX(event_end_at) DESC`,
        [EVENT_ARENA_RETENTION_DAYS],
      );
      const weeks = rows.flatMap((row) => {
        const expected = expectedEventArenaWindow(row.event_id);
        const startAtMs = expected && new Date(row.start_at).getTime();
        const endAtMs = expected && new Date(row.end_at).getTime();
        const participantCount = Number(row.participant_count);
        if (
          !expected
          || startAtMs !== expected.startAtMs
          || endAtMs !== expected.endAtMs
          || expected.endAtMs > now()
          || !Number.isInteger(participantCount)
          || participantCount < 1
        ) return [];
        return [{
          id: row.event_id,
          startAtMs,
          endAtMs,
          participantCount,
        }];
      });
      res.json({ weeks, updatedAt: new Date(now()).toISOString() });
    } catch {
      res.status(500).json({ error: "Could not load completed Event Arena weeks." });
    }
  });

  router.get("/event-arena/:eventId/leaderboard", requireSchema, async (req: any, res: any) => {
    if (rejectInvalidRegularEventCalendar(res)) return;
    const expectedWindow = expectedScheduledEventWindow(req.params.eventId);
    if (!expectedWindow) {
      res.status(400).json({ error: "A scheduled Event Arena window is required." });
      return;
    }
    try {
      const configuration = await ensureEventArenaConfiguration(db, req.params.eventId, now());
      if (!configuration) {
        res.status(409).json({ error: "This event already has a different saved configuration." });
        return;
      }
      await purgeExpiredEventArenaEntries(db);
      const headerInstallationId = req.get("x-event-arena-installation-id");
      const requestingInstallationId = validInstallationId(headerInstallationId)
        ? headerInstallationId
        : null;
      const lightningOnlyEntered = configuration.eventType === "lightning-round"
        ? ` AND EXISTS (
             SELECT 1 FROM event_arena_lightning_participants AS participant
             WHERE participant.event_id=event_arena_leaderboard_entries.event_id
               AND participant.installation_id=event_arena_leaderboard_entries.installation_id
               AND participant.status='entered'
           )`
        : "";
      const { rows } = await db.query(
        `SELECT
           installation_id, participant_token, alias, start_equity, equity, cash_balance, trade_count, holdings, updated_at
         FROM event_arena_leaderboard_entries
         WHERE event_id=$1
           AND is_active=TRUE
           AND event_start_at=TO_TIMESTAMP($2 / 1000.0)
           AND event_end_at=TO_TIMESTAMP($3 / 1000.0)
           AND event_end_at > NOW() - ($4 * INTERVAL '1 day')
           ${lightningOnlyEntered}`,
        [
          req.params.eventId,
          expectedWindow.startAtMs,
          expectedWindow.endAtMs,
          EVENT_ARENA_RETENTION_DAYS,
        ],
      );
      res.json({
        entries: rankEventArenaEntries(rows, requestingInstallationId, configuration.rankingDirection),
        updatedAt: new Date(now()).toISOString(),
      });
    } catch {
      res.status(500).json({ error: "Could not load the Event Arena leaderboard." });
    }
  });

  router.get("/event-arena/:eventId/leaderboard/history", requireSchema, async (req: any, res: any) => {
    if (rejectInvalidRegularEventCalendar(res)) return;
    const expectedWindow = expectedScheduledEventWindow(req.params.eventId);
    const requestingInstallationId = req.get("x-event-arena-installation-id");
    if (!expectedWindow || !validInstallationId(requestingInstallationId)) {
      res.status(400).json({ error: "A scheduled event and valid installation ID are required." });
      return;
    }
    try {
      await purgeExpiredEventArenaEntries(db);
      const { rows } = await db.query(
        `WITH participant_history AS (
           SELECT
             snapshots.captured_at,
             snapshots.snapshot_id,
             snapshots.rank,
             snapshots.return_percent,
             NTILE(120) OVER (ORDER BY snapshots.captured_at, snapshots.snapshot_id) AS bucket
           FROM event_arena_leaderboard_snapshots AS snapshots
           JOIN event_arena_leaderboard_entries AS participant
             ON participant.event_id=snapshots.event_id
             AND participant.participant_token=snapshots.participant_token
           WHERE snapshots.event_id=$1
             AND participant.installation_id=$2
             AND participant.is_active=TRUE
             AND participant.event_start_at=TO_TIMESTAMP($3 / 1000.0)
             AND participant.event_end_at=TO_TIMESTAMP($4 / 1000.0)
             AND snapshots.event_start_at=TO_TIMESTAMP($3 / 1000.0)
             AND snapshots.event_end_at=TO_TIMESTAMP($4 / 1000.0)
             AND snapshots.event_end_at > NOW() - ($5 * INTERVAL '1 day')
         )
         SELECT DISTINCT ON (bucket) captured_at, rank, return_percent
         FROM participant_history
         ORDER BY bucket, captured_at DESC, snapshot_id DESC`,
        [
          req.params.eventId,
          requestingInstallationId,
          expectedWindow.startAtMs,
          expectedWindow.endAtMs,
          EVENT_ARENA_RETENTION_DAYS,
        ],
      );
      res.json({
        snapshots: rows.map((row) => ({
          capturedAt: row.captured_at instanceof Date ? row.captured_at.toISOString() : row.captured_at,
          rank: Number(row.rank),
          returnPercent: Number(row.return_percent),
        })),
      });
    } catch {
      res.status(500).json({ error: "Could not load your Event Arena history." });
    }
  });

  router.post("/event-arena/:eventId/leaderboard", requireSchema, async (req: any, res: any) => {
    if (rejectInvalidRegularEventCalendar(res)) return;
    const submission = parseSubmission(req.body);
    if (!submission) {
      res.status(400).json({ error: "The Event Arena score submission is invalid." });
      return;
    }
    if (!isValidEventArenaWindow(req.params.eventId, submission.eventStartAtMs, submission.eventEndAtMs)) {
      res.status(400).json({ error: "A scheduled Event Arena window is required." });
      return;
    }
    if (now() > submission.eventEndAtMs) {
      res.status(410).json({ error: "This Event Arena window has ended." });
      return;
    }
    try {
      const configuration = await ensureEventArenaConfiguration(db, req.params.eventId, now());
      if (!configuration) {
        res.status(409).json({ error: "This event already has a different saved configuration." });
        return;
      }
      if (
        submission.startEquity !== configuration.startingBalance
        || (submission.eventType !== undefined && submission.eventType !== configuration.eventType)
        || (submission.artworkId !== undefined && submission.artworkId !== configuration.artworkId)
        || (submission.startingBalance !== undefined
          && submission.startingBalance !== configuration.startingBalance)
        || (submission.rankingDirection !== undefined
          && submission.rankingDirection !== configuration.rankingDirection)
        || submission.purchaseLimit !== configuration.purchaseLimit
      ) {
        res.status(400).json({ error: "The score does not match this event's saved configuration." });
        return;
      }
      if (configuration.eventType === "one-stock-challenge"
        && (submission.holdings.length > 1 || submission.holdings.some((holding) =>
          holding.side !== "long" || (holding.assetType !== "stock" && holding.assetType !== "etf"),
        ))) {
        res.status(400).json({ error: "The One-Stock Challenge leaderboard accepts only one verified long stock or ETF holding." });
        return;
      }
      let verifiedSubmission = submission;
      if (configuration.eventType === "lightning-round") {
        const { rows: participantRows } = await db.query(
          `SELECT status,failure_reason,account_id FROM event_arena_lightning_participants
           WHERE event_id=$1 AND installation_id=$2`,
          [req.params.eventId, submission.installationId],
        );
        const participant = participantRows[0];
        if (participant?.status !== "entered") {
          res.status(409).json({
            error: participant?.failure_reason
              || "Your Lightning Round order has not filled, so you are not entered yet.",
          });
          return;
        }
        const accountId = participantRows[0].account_id;
        if (!accountId) {
          res.status(409).json({ error: "The Lightning Round shared account is unavailable." });
          return;
        }
        const { rows: scopedActivity } = await db.query(
          `SELECT symbol,company_name,action,shares,price,total,fee,date
           FROM paper_transactions
           WHERE user_id=$1 AND account_id=$2 AND lightning_round_event_id=$3
             AND date >= TO_TIMESTAMP($4 / 1000.0) AND date <= TO_TIMESTAMP($5 / 1000.0)
           ORDER BY date ASC,id ASC`,
          [
            submission.installationId,
            accountId,
            req.params.eventId,
            configuration.startAtMs,
            configuration.endAtMs,
          ],
        );
        if (scopedActivity.length === 0) {
          res.status(409).json({ error: "No opening fill was found for this Lightning Round." });
          return;
        }
        const symbols = [...new Set(scopedActivity.map((row) => String(row.symbol)))];
        const priceResults = await Promise.all(symbols.map(async (symbol) => {
          try {
            return [symbol, await fetchLightningPrice(symbol)] as const;
          } catch {
            return [symbol, null] as const;
          }
        }));
        const prices: Record<string, number> = {};
        for (const [symbol, price] of priceResults) {
          if (price != null && Number.isFinite(price) && price > 0) prices[symbol] = price;
        }
        const score = calculateLightningRoundScore(
          scopedActivity.map((row) => ({
            symbol: String(row.symbol),
            company_name: row.company_name,
            action: String(row.action),
            shares: Number(row.shares),
            price: Number(row.price),
            total: Number(row.total),
            fee: row.fee == null ? null : Number(row.fee),
            date: row.date instanceof Date ? row.date.toISOString() : row.date,
          })),
          prices,
          configuration.startingBalance,
        );
        if (!score) {
          res.status(503).json({ error: "The event-only Lightning Round score is unavailable until all held symbols have valid prices." });
          return;
        }
        verifiedSubmission = {
          ...submission,
          startEquity: score.startEquity,
          equity: score.equity,
          cashBalance: score.cashBalance,
          returnPercent: score.returnPercent,
          tradeCount: score.tradeCount,
          holdings: score.holdings,
        };
      }
      await purgeExpiredEventArenaEntries(db);
      const outcome = await withTransaction(db, async (client) => {
        if (configuration.eventType === "lightning-round") {
          await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [req.params.eventId]);
          if (now() >= submission.eventEndAtMs) return { status: "ended" as const };
        }
        await client.query(
          `SELECT installation_id
           FROM event_arena_leaderboard_entries
           WHERE event_id=$1 AND installation_id=$2
           FOR UPDATE`,
          [req.params.eventId, submission.installationId],
        );
        const { rows } = await client.query(
          `INSERT INTO event_arena_leaderboard_entries
            (event_id, installation_id, alias, start_equity, equity, return_percent, trade_count, holdings, event_start_at, event_end_at, updated_at, cash_balance)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,TO_TIMESTAMP($9 / 1000.0),TO_TIMESTAMP($10 / 1000.0),NOW(),
             $11 + COALESCE((SELECT SUM(CASE WHEN recipient_installation_id=$2 THEN amount ELSE -amount END)
               FROM event_arena_cash_transfers
               WHERE event_id=$1 AND (sender_installation_id=$2 OR recipient_installation_id=$2)
                 AND transfer_ref <> ALL($12::text[])),0))
         ON CONFLICT (event_id, installation_id) DO UPDATE SET
           alias=EXCLUDED.alias,
           start_equity=EXCLUDED.start_equity,
           equity=EXCLUDED.equity,
           return_percent=EXCLUDED.return_percent,
            trade_count=EXCLUDED.trade_count,
           holdings=EXCLUDED.holdings,
            cash_balance=EXCLUDED.cash_balance,
           is_active=TRUE,
           updated_at=NOW()
         WHERE (
           event_arena_leaderboard_entries.event_start_at > NOW()
           OR event_arena_leaderboard_entries.alias = EXCLUDED.alias
         )
         AND event_arena_leaderboard_entries.updated_at <= NOW() - INTERVAL '15 seconds'
         RETURNING alias, start_equity, equity, return_percent, trade_count, holdings, updated_at`,
        [
          req.params.eventId,
          verifiedSubmission.installationId,
          verifiedSubmission.alias,
          verifiedSubmission.startEquity,
          verifiedSubmission.equity,
          verifiedSubmission.returnPercent,
          verifiedSubmission.tradeCount,
          JSON.stringify(verifiedSubmission.holdings),
          verifiedSubmission.eventStartAtMs,
          verifiedSubmission.eventEndAtMs,
          verifiedSubmission.cashBalance,
          verifiedSubmission.appliedTransferIds,
        ],
      );
        if (!rows[0]) {
          const existing = await client.query(
            `SELECT alias FROM event_arena_leaderboard_entries
             WHERE event_id=$1
               AND installation_id=$2
               AND event_end_at > NOW() - ($3 * INTERVAL '1 day')`,
            [req.params.eventId, submission.installationId, EVENT_ARENA_RETENTION_DAYS],
          );
          if (existing.rows[0] && existing.rows[0].alias !== submission.alias && now() >= submission.eventStartAtMs) {
            return { status: "alias" as const };
          }
          return { status: "rate-limit" as const };
        }
        if (configuration.eventType === "lightning-round") {
          await client.query(
            `UPDATE event_arena_lightning_participants
             SET leaderboard_opted_in=TRUE
             WHERE event_id=$1 AND installation_id=$2`,
            [req.params.eventId, submission.installationId],
          );
        }
        const { rows: currentParticipants } = await client.query(
          `SELECT installation_id, participant_token, alias, start_equity, equity, trade_count, holdings, updated_at
           FROM event_arena_leaderboard_entries
           WHERE event_id=$1
             AND is_active=TRUE
             AND event_start_at=TO_TIMESTAMP($2 / 1000.0)
             AND event_end_at=TO_TIMESTAMP($3 / 1000.0)
             ${configuration.eventType === "lightning-round"
               ? `AND EXISTS (
                    SELECT 1 FROM event_arena_lightning_participants AS participant
                    WHERE participant.event_id=event_arena_leaderboard_entries.event_id
                      AND participant.installation_id=event_arena_leaderboard_entries.installation_id
                      AND participant.status='entered'
                      AND participant.leaderboard_opted_in=TRUE
                  )`
               : ""}`,
          [req.params.eventId, submission.eventStartAtMs, submission.eventEndAtMs],
        );
        const rankedSnapshots = rankEventArenaEntries(
          currentParticipants,
          null,
          configuration.rankingDirection,
        )
          .map((entry) => ({
            participantToken: entry.participantToken,
            rank: entry.rank,
            returnPercent: entry.returnPercent,
          }));
        if (rankedSnapshots.length > 0) {
          await client.query(
            `INSERT INTO event_arena_leaderboard_snapshots
              (event_id, participant_token, event_start_at, event_end_at, captured_at, rank, return_percent)
             SELECT $1, snapshot.participant_token,
               TO_TIMESTAMP($5 / 1000.0), TO_TIMESTAMP($6 / 1000.0), NOW(),
               snapshot.rank, snapshot.return_percent
             FROM UNNEST($2::text[], $3::integer[], $4::double precision[])
               AS snapshot(participant_token, rank, return_percent)
             LEFT JOIN LATERAL (
               SELECT snapshot_id, rank, return_percent
               FROM event_arena_leaderboard_snapshots
               WHERE event_id=$1 AND participant_token=snapshot.participant_token
               ORDER BY captured_at DESC, snapshot_id DESC
               LIMIT 1
             ) AS previous ON TRUE
             WHERE previous.snapshot_id IS NULL
               OR previous.rank IS DISTINCT FROM snapshot.rank
               OR previous.return_percent IS DISTINCT FROM snapshot.return_percent`,
            [
              req.params.eventId,
              rankedSnapshots.map((snapshot) => snapshot.participantToken),
              rankedSnapshots.map((snapshot) => snapshot.rank),
              rankedSnapshots.map((snapshot) => snapshot.returnPercent),
              submission.eventStartAtMs,
              submission.eventEndAtMs,
            ],
          );
        }
        const updatedAt = rows[0].updated_at instanceof Date
          ? rows[0].updated_at.toISOString()
          : rows[0].updated_at;
        return { status: "ok" as const, updatedAt };
      });
      if (outcome.status === "alias") {
        res.status(409).json({ error: "Your leaderboard alias is locked for this event." });
      } else if (outcome.status === "rate-limit") {
        res.status(429).json({ error: "Please wait before updating your Event Arena score again." });
      } else if (outcome.status === "ended") {
        res.status(410).json({ error: "This Lightning Round has ended." });
      } else {
        res.json({ ok: true, updatedAt: outcome.updatedAt });
      }
    } catch {
      res.status(500).json({ error: "Could not save the Event Arena score." });
    }
  });

  router.delete("/event-arena/:eventId/leaderboard", requireSchema, async (req: any, res: any) => {
    if (rejectInvalidRegularEventCalendar(res)) return;
    if (!expectedScheduledEventWindow(req.params.eventId) || !validInstallationId(req.query.installationId)) {
      res.status(400).json({ error: "A valid event and installation ID are required." });
      return;
    }
    try {
      await purgeExpiredEventArenaEntries(db);
      await withTransaction(db, async (client) => {
        if (req.params.eventId.startsWith("lightning-")) {
          await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [req.params.eventId]);
        }
        const { rows } = await client.query(
          `SELECT participant_token FROM event_arena_leaderboard_entries
           WHERE event_id=$1 AND installation_id=$2 AND is_active=TRUE
           FOR UPDATE`,
          [req.params.eventId, req.query.installationId],
        );
        if (rows[0]?.participant_token) {
          await client.query(
            `DELETE FROM event_arena_leaderboard_snapshots
             WHERE event_id=$1 AND participant_token=$2`,
            [req.params.eventId, rows[0].participant_token],
          );
        }
        await client.query(
          `UPDATE event_arena_leaderboard_entries
           SET is_active=FALSE,
               start_equity=0,
               equity=0,
               return_percent=0,
               trade_count=NULL,
               holdings='[]'::jsonb,
               updated_at=NOW()
           WHERE event_id=$1 AND installation_id=$2 AND is_active=TRUE`,
          [req.params.eventId, req.query.installationId],
        );
        if (req.params.eventId.startsWith("lightning-")) {
          await client.query(
            `UPDATE event_arena_lightning_participants
             SET leaderboard_opted_in=FALSE
             WHERE event_id=$1 AND installation_id=$2`,
            [req.params.eventId, req.query.installationId],
          );
        }
      });
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Could not remove your Event Arena entry." });
    }
  });

  router.post("/event-arena/:eventId/transfers", requireSchema, async (req: any, res: any) => {
    if (rejectInvalidRegularEventCalendar(res)) return;
    const eventId = req.params.eventId;
    const expectedWindow = expectedEventArenaWindow(eventId);
    const expectedConfiguration = expectedEventArenaConfiguration(eventId);
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const senderInstallationId = body.installationId;
    const recipientParticipantToken = body.recipientParticipantToken;
    const idempotencyKey = body.idempotencyKey;
    const amount = body.amount;
    const availableCash = body.availableCash;
    if (
      !expectedWindow
      || !validInstallationId(senderInstallationId)
      || typeof recipientParticipantToken !== "string"
      || recipientParticipantToken.length < 16
      || recipientParticipantToken.length > 96
      || !validTransferId(idempotencyKey)
      || typeof amount !== "number"
      || !Number.isFinite(amount)
      || amount < 0.01
      || amount > 1_000_000
      || typeof availableCash !== "number"
      || !Number.isFinite(availableCash)
      || availableCash < 0
      || availableCash > 10_000_000
    ) {
      res.status(400).json({ error: "The Event Arena cash transfer is invalid." });
      return;
    }
    const transferNow = now();
    if (expectedConfiguration && isMountainChampionshipTransferLocked(
      expectedConfiguration.eventType,
      eventId,
      expectedConfiguration.endAtMs,
      transferNow,
    )) {
      res.status(409).json({ error: MOUNTAIN_CHAMPIONSHIP_TRANSFER_LOCK_MESSAGE });
      return;
    }
    try {
      await purgeExpiredEventArenaEntries(db);
      const result = await withTransaction(db, async (client) => {
        const previous = await client.query(
          `SELECT transfer_ref, sender_alias, recipient_alias, amount, created_at
           FROM event_arena_cash_transfers
           WHERE event_id=$1 AND sender_installation_id=$2 AND idempotency_key=$3`,
          [eventId, senderInstallationId, idempotencyKey],
        );
        if (previous.rows[0]) return { status: "ok" as const, row: previous.rows[0] };
        if (transferNow < expectedWindow.startAtMs || transferNow >= expectedWindow.endAtMs) {
          return { status: "inactive" as const };
        }

        const senderResult = await client.query(
          `SELECT alias, cash_balance
           FROM event_arena_leaderboard_entries
           WHERE event_id=$1 AND installation_id=$2 AND is_active=TRUE
             AND event_start_at=TO_TIMESTAMP($3 / 1000.0)
             AND event_end_at=TO_TIMESTAMP($4 / 1000.0)
             AND event_end_at > NOW() - ($5 * INTERVAL '1 day')
           FOR UPDATE`,
          [eventId, senderInstallationId, expectedWindow.startAtMs, expectedWindow.endAtMs, EVENT_ARENA_RETENTION_DAYS],
        );
        if (!senderResult.rows[0]) return { status: "sender" as const };

        const afterSenderLock = await client.query(
          `SELECT transfer_ref, sender_alias, recipient_alias, amount, created_at
           FROM event_arena_cash_transfers
           WHERE event_id=$1 AND sender_installation_id=$2 AND idempotency_key=$3`,
          [eventId, senderInstallationId, idempotencyKey],
        );
        if (afterSenderLock.rows[0]) return { status: "ok" as const, row: afterSenderLock.rows[0] };

        const recipientResult = await client.query(
          `SELECT installation_id, alias, cash_balance
           FROM event_arena_leaderboard_entries
           WHERE event_id=$1 AND participant_token=$2 AND is_active=TRUE
             AND event_start_at=TO_TIMESTAMP($3 / 1000.0)
             AND event_end_at=TO_TIMESTAMP($4 / 1000.0)
             AND event_end_at > NOW() - ($5 * INTERVAL '1 day')
           FOR UPDATE`,
          [eventId, recipientParticipantToken, expectedWindow.startAtMs, expectedWindow.endAtMs, EVENT_ARENA_RETENTION_DAYS],
        );
        if (!recipientResult.rows[0]) return { status: "recipient" as const };
        if (recipientResult.rows[0].installation_id === senderInstallationId) return { status: "self" as const };
        if (amount > availableCash + 1e-8 || amount > Number(senderResult.rows[0].cash_balance) + 1e-8) {
          return { status: "funds" as const };
        }

        const inserted = await client.query(
          `INSERT INTO event_arena_cash_transfers
             (event_id, transfer_ref, idempotency_key, sender_installation_id, recipient_installation_id,
              sender_alias, recipient_alias, amount, event_start_at, event_end_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TO_TIMESTAMP($9 / 1000.0),TO_TIMESTAMP($10 / 1000.0))
           RETURNING transfer_ref, sender_alias, recipient_alias, amount, created_at`,
          [eventId, randomTransferRef(), idempotencyKey, senderInstallationId,
            recipientResult.rows[0].installation_id, senderResult.rows[0].alias,
            recipientResult.rows[0].alias, amount, expectedWindow.startAtMs, expectedWindow.endAtMs],
        );
        await client.query(
          `UPDATE event_arena_leaderboard_entries SET cash_balance=cash_balance-$3
           WHERE event_id=$1 AND installation_id=$2`,
          [eventId, senderInstallationId, amount],
        );
        await client.query(
          `UPDATE event_arena_leaderboard_entries SET cash_balance=cash_balance+$3
           WHERE event_id=$1 AND installation_id=$2`,
          [eventId, recipientResult.rows[0].installation_id, amount],
        );
        return { status: "ok" as const, row: inserted.rows[0] };
      });

      if (result.status === "sender") {
        res.status(403).json({ error: "Join this event and opt in before sending cash." });
      } else if (result.status === "recipient") {
        res.status(404).json({ error: "That participant is no longer eligible for this event." });
      } else if (result.status === "self") {
        res.status(400).json({ error: "You cannot send cash to yourself." });
      } else if (result.status === "funds") {
        res.status(409).json({ error: "The transfer exceeds your available Event Arena cash." });
      } else if (result.status === "inactive") {
        res.status(410).json({ error: "Cash transfers are available only while this event is active." });
      } else {
        const row = result.row;
        res.json({
          ok: true,
          transfer: {
            id: row.transfer_ref,
            eventId,
            senderAlias: row.sender_alias,
            recipientAlias: row.recipient_alias,
            amount: Number(row.amount),
            createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
          },
        });
      }
    } catch {
      res.status(500).json({ error: "Could not send Event Arena cash. Retry using the same transfer request." });
    }
  });

  router.post("/event-arena/:eventId/transfers/read", requireSchema, async (req: any, res: any) => {
    if (rejectInvalidRegularEventCalendar(res)) return;
    const expectedWindow = expectedEventArenaWindow(req.params.eventId);
    const installationId = req.get("x-event-arena-installation-id");
    const transferIds = req.body?.transferIds;
    if (
      !expectedWindow
      || !validInstallationId(installationId)
      || !Array.isArray(transferIds)
      || transferIds.length < 1
      || transferIds.length > 100
      || transferIds.some((id: unknown) => typeof id !== "string" || id.length < 1 || id.length > 128)
    ) {
      res.status(400).json({ error: "A valid event, installation ID, and transfer list are required." });
      return;
    }
    try {
      await purgeExpiredEventArenaEntries(db);
      await db.query(
        `UPDATE event_arena_cash_transfers SET read_at=COALESCE(read_at,NOW())
         WHERE event_id=$1 AND recipient_installation_id=$2 AND transfer_ref=ANY($3::text[])
           AND event_end_at > NOW() - ($4 * INTERVAL '1 day')`,
        [req.params.eventId, installationId, transferIds, EVENT_ARENA_RETENTION_DAYS],
      );
      res.json({ markedRead: transferIds.length });
    } catch {
      res.status(500).json({ error: "Could not save the Event Arena cash receipt." });
    }
  });

  router.get("/event-arena/:eventId/transfers", requireSchema, async (req: any, res: any) => {
    if (rejectInvalidRegularEventCalendar(res)) return;
    const expectedWindow = expectedEventArenaWindow(req.params.eventId);
    const installationId = req.get("x-event-arena-installation-id");
    if (!expectedWindow || !validInstallationId(installationId)) {
      res.status(400).json({ error: "A valid event and installation ID are required." });
      return;
    }
    const markRead = req.get("x-event-arena-mark-read") === "true";
    try {
      await purgeExpiredEventArenaEntries(db);
      if (markRead) {
        await db.query(
          `UPDATE event_arena_cash_transfers SET read_at=COALESCE(read_at,NOW())
           WHERE event_id=$1 AND recipient_installation_id=$2
             AND event_end_at > NOW() - ($3 * INTERVAL '1 day')`,
          [req.params.eventId, installationId, EVENT_ARENA_RETENTION_DAYS],
        );
      }
      const { rows } = await db.query(
        `SELECT transfer_ref, sender_alias, amount, created_at, read_at
         FROM event_arena_cash_transfers
         WHERE event_id=$1 AND recipient_installation_id=$2
           AND event_end_at > NOW() - ($3 * INTERVAL '1 day')
         ORDER BY created_at DESC`,
        [req.params.eventId, installationId, EVENT_ARENA_RETENTION_DAYS],
      );
      const sent = await db.query(
        `SELECT transfer_ref, recipient_alias, amount, created_at
         FROM event_arena_cash_transfers
         WHERE event_id=$1 AND sender_installation_id=$2
           AND event_end_at > NOW() - ($3 * INTERVAL '1 day')
         ORDER BY created_at DESC`,
        [req.params.eventId, installationId, EVENT_ARENA_RETENTION_DAYS],
      );
      res.json({
        notifications: rows.map((row) => ({
          id: row.transfer_ref,
          eventId: req.params.eventId,
          senderAlias: row.sender_alias,
          amount: Number(row.amount),
          createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
          readAt: row.read_at instanceof Date ? row.read_at.toISOString() : row.read_at ?? null,
        })),
        sentTransfers: sent.rows.map((row) => ({
          id: row.transfer_ref,
          eventId: req.params.eventId,
          recipientAlias: row.recipient_alias,
          amount: Number(row.amount),
          createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
        })),
      });
    } catch {
      res.status(500).json({ error: "Could not load Event Arena cash notifications." });
    }
  });

  return router;
}

function randomTransferRef() {
  return randomUUID();
}
