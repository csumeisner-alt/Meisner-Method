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
