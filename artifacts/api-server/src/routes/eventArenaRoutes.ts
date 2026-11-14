import { Router } from "express";
import {
  EVENT_ARENA_RETENTION_DAYS,
  purgeExpiredEventArenaEntries,
} from "../lib/eventArenaRetention.ts";

export { EVENT_ARENA_RETENTION_DAYS, purgeExpiredEventArenaEntries } from "../lib/eventArenaRetention.ts";

interface EventArenaDatabase {
  query(sql: string, values?: any[]): Promise<{ rows: any[] }>;
}

type Middleware = (req: any, res: any, next: any) => void;
type HoldingIdentifier = { symbol: string; companyName: string };
type EventSubmission = {
  installationId: string;
  alias: string;
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

function validInstallationId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 12 && value.length <= 128;
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

/** Only accept the scheduled biweekly Monday-to-Friday Event Arena windows. */
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
  const expected = expectedEventArenaWindow(eventId);
  return !!expected && startAtMs === expected.startAtMs && endAtMs === expected.endAtMs;
}

function parseSubmission(body: unknown): EventSubmission | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const value = body as Record<string, unknown>;
  const allowedKeys = new Set([
    "installationId",
    "alias",
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
  const startEquity = value.startEquity;
  const equity = value.equity;
  const returnPercent = value.returnPercent;
  const tradeCount = value.tradeCount;
  const holdings = value.holdings;
  if (
    !validInstallationId(value.installationId)
    || alias.length < 1
    || alias.length > 24
    || /[\u0000-\u001f\u007f]/.test(alias)
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
      Object.keys(holding).some((key) => key !== "symbol" && key !== "companyName")
      || typeof holding.symbol !== "string"
      || typeof holding.companyName !== "string"
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
      cleanHoldings.push({ symbol, companyName });
    }
  }

  return {
    installationId: value.installationId,
    alias,
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
        ? [{ symbol: item.symbol, companyName: item.companyName }]
        : []
    ))
    : [];
  const updatedAt = row.updated_at instanceof Date
    ? row.updated_at.toISOString()
    : row.updated_at;
  return {
    rank,
    alias: row.alias,
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
export function rankEventArenaEntries(rows: any[], requestingInstallationId: string | null = null) {
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
      b.returnPercent - a.returnPercent
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
    const expectedWindow = expectedEventArenaWindow(req.params.eventId);
    if (!expectedWindow) {
      res.status(400).json({ error: "A scheduled Event Arena window is required." });
      return;
    }
    try {
      await purgeExpiredEventArenaEntries(db);
      const headerInstallationId = req.get("x-event-arena-installation-id");
      const requestingInstallationId = validInstallationId(headerInstallationId)
        ? headerInstallationId
        : null;
      const { rows } = await db.query(
        `SELECT
           installation_id, alias, start_equity, equity, trade_count, holdings, updated_at
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
        entries: rankEventArenaEntries(rows, requestingInstallationId),
        updatedAt: new Date(now()).toISOString(),
      });
    } catch {
      res.status(500).json({ error: "Could not load the Event Arena leaderboard." });
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
      await purgeExpiredEventArenaEntries(db);
      const { rows } = await db.query(
        `INSERT INTO event_arena_leaderboard_entries
           (event_id, installation_id, alias, start_equity, equity, return_percent, trade_count, holdings, event_start_at, event_end_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,TO_TIMESTAMP($9 / 1000.0),TO_TIMESTAMP($10 / 1000.0),NOW())
         ON CONFLICT (event_id, installation_id) DO UPDATE SET
           alias=EXCLUDED.alias,
           start_equity=EXCLUDED.start_equity,
           equity=EXCLUDED.equity,
           return_percent=EXCLUDED.return_percent,
            trade_count=EXCLUDED.trade_count,
           holdings=EXCLUDED.holdings,
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
        ],
      );
      if (!rows[0]) {
        const existing = await db.query(
          `SELECT alias FROM event_arena_leaderboard_entries
           WHERE event_id=$1
             AND installation_id=$2
             AND event_end_at > NOW() - ($3 * INTERVAL '1 day')`,
          [req.params.eventId, submission.installationId, EVENT_ARENA_RETENTION_DAYS],
        );
        if (existing.rows[0] && existing.rows[0].alias !== submission.alias && now() >= submission.eventStartAtMs) {
          res.status(409).json({ error: "Your leaderboard alias is locked for this event." });
          return;
        }
        res.status(429).json({ error: "Please wait before updating your Event Arena score again." });
        return;
      }
      const updatedAt = rows[0].updated_at instanceof Date
        ? rows[0].updated_at.toISOString()
        : rows[0].updated_at;
      res.json({ ok: true, updatedAt });
    } catch {
      res.status(500).json({ error: "Could not save the Event Arena score." });
    }
  });

  router.delete("/event-arena/:eventId/leaderboard", requireSchema, async (req: any, res: any) => {
    if (!expectedEventArenaWindow(req.params.eventId) || !validInstallationId(req.query.installationId)) {
      res.status(400).json({ error: "A valid event and installation ID are required." });
      return;
    }
    try {
      await purgeExpiredEventArenaEntries(db);
      await db.query(
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
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Could not remove your Event Arena entry." });
    }
  });

  return router;
}
