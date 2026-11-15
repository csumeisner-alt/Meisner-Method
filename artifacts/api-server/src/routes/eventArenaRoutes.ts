import { Router } from "express";
import { randomUUID } from "node:crypto";
import {
  EVENT_ARENA_RETENTION_DAYS,
  purgeExpiredEventArenaEntries,
} from "../lib/eventArenaRetention.ts";

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
  side: "long" | "short";
};
type EventSubmission = {
  installationId: string;
  alias: string;
  eventType?: "event-arena" | "green-bull-championship" | "bear-market-mayhem" | "lightning-round";
  artworkId?: typeof EVENT_ARTWORK_IDS[number] | "lightning-round-arena";
  startingBalance?: number;
  rankingDirection?: "highest-return" | "lowest-return";
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
const EVENT_ANCHOR_DAY = Math.floor(Date.UTC(2026, 10, 16) / DAY_MS);
const MAX_HOLDINGS = 100;
const EVENT_ARTWORK_IDS = [
  "stadium",
  "neon-nightclub",
  "mountain-summit",
  "red-showdown",
  "green-stock-exchange",
] as const;

type EventArenaConfiguration = {
  eventId: string;
  eventType: "event-arena" | "green-bull-championship" | "bear-market-mayhem" | "lightning-round";
  artworkId: typeof EVENT_ARTWORK_IDS[number] | "lightning-round-arena";
  startingBalance: number;
  rankingDirection: "highest-return" | "lowest-return";
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

function easternParts(timestamp: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
  };
}

function easternLocalToUtc(year: number, month: number, day: number, hour: number, minute: number) {
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const local = easternParts(candidate);
    candidate += target - Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  }
  return candidate;
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

const LIGHTNING_ROUND_TIME_ZONE = process.env.LIGHTNING_ROUND_TIME_ZONE
  || process.env.EXPO_PUBLIC_LIGHTNING_ROUND_TIME_ZONE
  || "America/Denver";
const LIGHTNING_ROUND_START_HOUR = Number(
  process.env.LIGHTNING_ROUND_START_HOUR ?? process.env.EXPO_PUBLIC_LIGHTNING_ROUND_START_HOUR ?? 9,
);
const LIGHTNING_ROUND_START_MINUTE = Number(
  process.env.LIGHTNING_ROUND_START_MINUTE ?? process.env.EXPO_PUBLIC_LIGHTNING_ROUND_START_MINUTE ?? 0,
);
const LIGHTNING_ROUND_DAY_MS = 24 * 60 * 60 * 1000;

function expectedLightningRoundWindow(eventId: unknown) {
  if (typeof eventId !== "string" || !/^lightning-\d{4}-\d{2}-\d{2}$/.test(eventId)) return null;
  const dateText = eventId.slice("lightning-".length);
  const date = new Date(`${dateText}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime())
    || date.toISOString().slice(0, 10) !== dateText
    || date.getUTCDay() !== 6
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
  return { startAtMs, endAtMs: startAtMs + LIGHTNING_ROUND_DAY_MS };
}

function expectedEventArenaWindow(eventId: unknown) {
  if (typeof eventId !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(eventId)) return null;
  const [year, month, day] = eventId.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.toISOString().slice(0, 10) !== eventId
    || date.getUTCDay() !== 1
  ) return null;
  const daySerial = Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
  const daysSinceAnchor = daySerial - EVENT_ANCHOR_DAY;
  if (daysSinceAnchor < 0 || daysSinceAnchor % 14 !== 0) return null;

  const expectedStart = easternLocalToUtc(year, month, day, 9, 30);
  const friday = new Date(Date.UTC(year, month - 1, day + 4));
  const expectedEnd = easternLocalToUtc(
    friday.getUTCFullYear(),
    friday.getUTCMonth() + 1,
    friday.getUTCDate(),
    16,
    0,
  );
  return { startAtMs: expectedStart, endAtMs: expectedEnd };
}

function expectedScheduledEventWindow(eventId: unknown) {
  return expectedLightningRoundWindow(eventId) ?? expectedEventArenaWindow(eventId);
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
  if (!window) return null;
  const [year, month, day] = eventId.split("-").map(Number);
  const daySerial = Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
  const artworkId = EVENT_ARTWORK_IDS[
    Math.floor((daySerial - EVENT_ANCHOR_DAY) / 14) % EVENT_ARTWORK_IDS.length
  ];
  const isGreenBull = artworkId === "green-stock-exchange";
  const isBearMarket = artworkId === "red-showdown";
  return {
    eventId,
    eventType: isGreenBull
      ? "green-bull-championship"
      : isBearMarket ? "bear-market-mayhem" : "event-arena",
    artworkId,
    startingBalance: isGreenBull ? 500_000 : 100_000,
    rankingDirection: isBearMarket ? "lowest-return" : "highest-return",
    ...window,
  };
}

export function getLightningRoundScheduleIds(nowMs = Date.now()): string[] {
  const local = zonedParts(nowMs, LIGHTNING_ROUND_TIME_ZONE);
  const localSerial = Math.floor(Date.UTC(local.year, local.month - 1, local.day) / DAY_MS);
  const saturdaySerial = localSerial - ((new Date(localSerial * DAY_MS).getUTCDay() - 6 + 7) % 7);
  const saturday = new Date(saturdaySerial * DAY_MS);
  const firstId = `lightning-${saturday.toISOString().slice(0, 10)}`;
  const firstWindow = expectedLightningRoundWindow(firstId);
  const selectedSerial = firstWindow && nowMs >= firstWindow.endAtMs ? saturdaySerial + 7 : saturdaySerial;
  return [0, 7].map((offset) => {
    const date = new Date((selectedSerial + offset) * DAY_MS);
    return `lightning-${date.toISOString().slice(0, 10)}`;
  });
}

function savedEventArenaConfiguration(row: any, expected: EventArenaConfiguration): EventArenaConfiguration | null {
  const eventType = row.event_type;
  const artworkId = row.artwork_id;
  const startingBalance = Number(row.starting_balance);
  const rankingDirection = row.ranking_direction;
  const rowStartAtMs = row.event_start_at instanceof Date
    ? row.event_start_at.getTime()
    : new Date(row.event_start_at).getTime();
  const rowEndAtMs = row.event_end_at instanceof Date
    ? row.event_end_at.getTime()
    : new Date(row.event_end_at).getTime();
  const isCurrentConfiguration = eventType === expected.eventType
    && artworkId === expected.artworkId
    && startingBalance === expected.startingBalance
    && rankingDirection === expected.rankingDirection;
  // A pre-existing Red Showdown event remains a standard Event Arena event.
  const isLegacyRedConfiguration = artworkId === "red-showdown"
    && eventType === "event-arena"
    && startingBalance === 100_000
    && rankingDirection === "highest-return";
  if (
    row.event_id !== expected.eventId
    || rowStartAtMs !== expected.startAtMs
    || rowEndAtMs !== expected.endAtMs
    || (!isCurrentConfiguration && !isLegacyRedConfiguration)
  ) return null;
  return {
    eventId: expected.eventId,
    eventType,
    artworkId,
    startingBalance,
    rankingDirection,
    startAtMs: expected.startAtMs,
    endAtMs: expected.endAtMs,
  };
}

async function ensureEventArenaConfiguration(
  db: EventArenaDatabase,
  eventId: string,
): Promise<EventArenaConfiguration | null> {
  const expected = expectedEventArenaConfiguration(eventId);
  if (!expected) return null;
  const values = [
    expected.eventId,
    expected.eventType,
    expected.artworkId,
    expected.startingBalance,
    expected.rankingDirection,
    expected.startAtMs,
    expected.endAtMs,
  ];
  const { rows: inserted } = await db.query(
    `INSERT INTO event_arena_events
      (event_id, event_type, artwork_id, starting_balance, ranking_direction, event_start_at, event_end_at)
     VALUES ($1,$2,$3,$4,$5,TO_TIMESTAMP($6 / 1000.0),TO_TIMESTAMP($7 / 1000.0))
     ON CONFLICT (event_id) DO NOTHING
     RETURNING event_id, event_type, artwork_id, starting_balance, ranking_direction, event_start_at, event_end_at`,
    values,
  );
  const row = inserted[0] ?? (await db.query(
    `SELECT event_id, event_type, artwork_id, starting_balance, ranking_direction, event_start_at, event_end_at
     FROM event_arena_events WHERE event_id=$1`,
    [eventId],
  )).rows[0];
  if (!row) return null;
  return savedEventArenaConfiguration(row, expected);
}

export async function prepareLightningRoundEvents(
  db: EventArenaDatabase,
  nowMs = Date.now(),
): Promise<EventArenaConfiguration[]> {
  const eventIds = getLightningRoundScheduleIds(nowMs);
  const events = await Promise.all(eventIds.map((eventId) => ensureEventArenaConfiguration(db, eventId)));
  if (events.some((event) => !event)) {
    throw new Error("A Lightning Round schedule conflicts with a saved event.");
  }
  return events as EventArenaConfiguration[];
}

/** Accept only the independent weekly Lightning Round and regular scheduled windows. */
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
      && eventType !== "lightning-round")
    || (artworkId !== undefined
      && !EVENT_ARTWORK_IDS.includes(artworkId as typeof EVENT_ARTWORK_IDS[number])
      && artworkId !== "lightning-round-arena")
    || (startingBalance !== undefined && (typeof startingBalance !== "number"
      || !Number.isFinite(startingBalance) || startingBalance <= 0))
    || (rankingDirection !== undefined
      && rankingDirection !== "highest-return"
      && rankingDirection !== "lowest-return")
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
        !["symbol", "companyName", "allocationPercent", "side"].includes(key))
      || typeof holding.symbol !== "string"
      || typeof holding.companyName !== "string"
      || (holding.allocationPercent !== null
        && (typeof holding.allocationPercent !== "number"
          || !Number.isFinite(holding.allocationPercent)
          || holding.allocationPercent < 0))
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
) {
  const router = Router();

  router.post("/event-arena/lightning-round/prepare", requireSchema, async (_req: any, res: any) => {
    try {
      const events = await prepareLightningRoundEvents(db, now());
      res.json({ events });
    } catch {
      res.status(500).json({ error: "Could not prepare the upcoming Lightning Round events." });
    }
  });

  router.post("/event-arena/:eventId/config", requireSchema, async (req: any, res: any) => {
    const expected = expectedEventArenaConfiguration(req.params.eventId);
    if (!expected) {
      res.status(400).json({ error: "A scheduled Event Arena window is required." });
      return;
    }
    try {
      const configuration = await ensureEventArenaConfiguration(db, req.params.eventId);
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
    const expectedWindow = expectedScheduledEventWindow(req.params.eventId);
    if (!expectedWindow) {
      res.status(400).json({ error: "A scheduled Event Arena window is required." });
      return;
    }
    try {
      const configuration = await ensureEventArenaConfiguration(db, req.params.eventId);
      if (!configuration) {
        res.status(409).json({ error: "This event already has a different saved configuration." });
        return;
      }
      await purgeExpiredEventArenaEntries(db);
      const headerInstallationId = req.get("x-event-arena-installation-id");
      const requestingInstallationId = validInstallationId(headerInstallationId)
        ? headerInstallationId
        : null;
      const { rows } = await db.query(
        `SELECT
           installation_id, participant_token, alias, start_equity, equity, trade_count, holdings, updated_at
         FROM event_arena_leaderboard_entries
         WHERE event_id=$1
           AND is_active=TRUE
           AND event_start_at=TO_TIMESTAMP($2 / 1000.0)
           AND event_end_at=TO_TIMESTAMP($3 / 1000.0)
           AND event_end_at > NOW() - ($4 * INTERVAL '1 day')`,
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
      const configuration = await ensureEventArenaConfiguration(db, req.params.eventId);
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
      ) {
        res.status(400).json({ error: "The score does not match this event's saved configuration." });
        return;
      }
      await purgeExpiredEventArenaEntries(db);
      const outcome = await withTransaction(db, async (client) => {
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
          submission.installationId,
          submission.alias,
          submission.startEquity,
          submission.equity,
          submission.returnPercent,
          submission.tradeCount,
          JSON.stringify(submission.holdings),
          submission.eventStartAtMs,
          submission.eventEndAtMs,
          submission.cashBalance,
          submission.appliedTransferIds,
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
        const { rows: currentParticipants } = await client.query(
          `SELECT installation_id, participant_token, alias, start_equity, equity, trade_count, holdings, updated_at
           FROM event_arena_leaderboard_entries
           WHERE event_id=$1
             AND is_active=TRUE
             AND event_start_at=TO_TIMESTAMP($2 / 1000.0)
             AND event_end_at=TO_TIMESTAMP($3 / 1000.0)`,
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
      } else {
        res.json({ ok: true, updatedAt: outcome.updatedAt });
      }
    } catch {
      res.status(500).json({ error: "Could not save the Event Arena score." });
    }
  });

  router.delete("/event-arena/:eventId/leaderboard", requireSchema, async (req: any, res: any) => {
    if (!expectedScheduledEventWindow(req.params.eventId) || !validInstallationId(req.query.installationId)) {
      res.status(400).json({ error: "A valid event and installation ID are required." });
      return;
    }
    try {
      await purgeExpiredEventArenaEntries(db);
      await withTransaction(db, async (client) => {
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
      });
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Could not remove your Event Arena entry." });
    }
  });

  router.post("/event-arena/:eventId/transfers", requireSchema, async (req: any, res: any) => {
    const eventId = req.params.eventId;
    const expectedWindow = expectedEventArenaWindow(eventId);
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
        if (now() < expectedWindow.startAtMs || now() >= expectedWindow.endAtMs) {
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
