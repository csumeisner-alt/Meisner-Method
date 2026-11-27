import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import express from "express";
import pg from "pg";
import {
  createEventArenaRouter,
  expectedEventArenaConfiguration,
  getLightningRoundScheduleIds,
  hasScheduledRegularEventOverlap,
  isValidEventArenaWindow,
  LIGHTNING_ROUND_UNAVAILABLE_MESSAGE,
  prepareLightningRoundEvents,
  rankEventArenaEntries,
} from "./eventArenaRoutes.ts";
import {
  getRegularEventCalendarError,
  getRegularEventPreparationStartAtMs,
  REGULAR_EVENT_CALENDAR,
} from "../../../mobile/lib/paperChallengeCalendar.ts";
import {
  EVENT_ARENA_RETENTION_DAYS,
  purgeExpiredEventArenaEntries,
} from "../lib/eventArenaRetention.ts";

const eventId = "2026-11-16";
const startAtMs = Date.parse("2026-11-16T14:30:00.000Z");
const endAtMs = Date.parse("2026-11-20T21:00:00.000Z");
const installationId = "installation-id-123456";
const databaseUrl = process.env["DATABASE_URL"];
const { Pool } = pg;
type TestDatabase = {
  query: (sql: string, values?: any[]) => Promise<{ rows: any[] }>;
  connect?: () => Promise<{
    query: (sql: string, values?: any[]) => Promise<{ rows: any[] }>;
    release: () => void;
  }>;
};

function validSubmission(overrides: Record<string, unknown> = {}) {
  const eventStartAtMs = typeof overrides.eventStartAtMs === "number"
    ? overrides.eventStartAtMs
    : startAtMs;
  const eventIdForStart = Number.isFinite(eventStartAtMs)
    ? new Date(eventStartAtMs).toISOString().slice(0, 10)
    : eventId;
  const configuration = expectedEventArenaConfiguration(eventIdForStart);
  return {
    installationId,
    alias: "MarketFox",
    eventType: configuration?.eventType ?? "event-arena",
    artworkId: configuration?.artworkId ?? "stadium",
    startingBalance: configuration?.startingBalance ?? 100_000,
    rankingDirection: configuration?.rankingDirection ?? "highest-return",
    ...(configuration?.purchaseLimit != null ? { purchaseLimit: configuration.purchaseLimit } : {}),
    cashBalance: 100_000,
    appliedTransferIds: [],
    startEquity: 100_000,
    equity: 101_250,
    returnPercent: 1.25,
    tradeCount: 3,
    holdings: [{ symbol: "AAPL", companyName: "Apple Inc.", allocationPercent: 12.5, side: "long" }],
    eventStartAtMs: startAtMs,
    eventEndAtMs: endAtMs,
    ...overrides,
  };
}

async function withApi(
  database: TestDatabase | TestDatabase["query"],
  run: (baseUrl: string) => Promise<void>,
  currentTime: number | (() => number) = Date.parse("2026-11-18T17:00:00.000Z"),
  existingConfigurations = new Map<string, any>(),
  fetchLightningPrice?: (symbol: string) => Promise<number | null>,
) {
  const app = express();
  app.use(express.json());
  const savedConfigurations = existingConfigurations;
  const db = typeof database === "function"
    ? {
        query: async (sql: string, values?: any[]) => {
          if (sql.includes("WHERE event_type='lightning-round'")) {
            const cutoff = Number(values?.[0]);
            const row = [...savedConfigurations.values()]
              .filter((item) => item.event_type === "lightning-round"
                && item.event_start_at.getTime() <= cutoff)
              .sort((a, b) => b.event_start_at.getTime() - a.event_start_at.getTime())[0];
            return { rows: row ? [{ event_id: row.event_id }] : [] };
          }
          if (sql.startsWith("INSERT INTO event_arena_events")) {
            const expected = expectedEventArenaConfiguration(String(values?.[0]));
            assert.ok(expected);
            const row = {
              event_id: expected.eventId,
              event_type: expected.eventType,
              artwork_id: expected.artworkId,
              starting_balance: expected.startingBalance,
              ranking_direction: expected.rankingDirection,
              purchase_limit: expected.purchaseLimit ?? null,
              event_start_at: new Date(expected.startAtMs),
              event_end_at: new Date(expected.endAtMs),
            };
            if (savedConfigurations.has(expected.eventId)) return { rows: [] };
            savedConfigurations.set(expected.eventId, row);
            return { rows: [row] };
          }
          if (sql.startsWith("UPDATE event_arena_events")) {
            const eventId = String(values?.[0]);
            const row = savedConfigurations.get(eventId);
            if (
              row
              && row.event_type === "event-arena"
              && row.artwork_id === "neon-nightclub"
              && Number(row.starting_balance) === 100_000
              && row.ranking_direction === "highest-return"
              && row.purchase_limit == null
              && row.event_start_at.getTime() > Number(values?.[2])
            ) {
              row.starting_balance = Number(values?.[1]);
              savedConfigurations.set(eventId, row);
              return { rows: [row] };
            }
            return { rows: [] };
          }
          if (sql.includes("FROM event_arena_events WHERE event_id=$1")) {
            const row = savedConfigurations.get(String(values?.[0]));
            return { rows: row ? [row] : [] };
          }
          return database(sql, values);
        },
      }
    : database;
  app.use(createEventArenaRouter(
    db,
    (_req, _res, next) => next(),
    () => typeof currentTime === "function" ? currentTime() : currentTime,
    fetchLightningPrice,
  ));
  const server = app.listen(0);
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

async function ensureEventArenaTables(pool: InstanceType<typeof Pool>) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_arena_events (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      artwork_id TEXT NOT NULL,
      starting_balance DOUBLE PRECISION NOT NULL,
      ranking_direction TEXT NOT NULL,
      purchase_limit DOUBLE PRECISION,
      event_start_at TIMESTAMPTZ NOT NULL,
      event_end_at TIMESTAMPTZ NOT NULL,
      finalized_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query("ALTER TABLE event_arena_events ADD COLUMN IF NOT EXISTS purchase_limit DOUBLE PRECISION");
  await pool.query("ALTER TABLE event_arena_events ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_arena_leaderboard_entries (
      event_id TEXT NOT NULL,
      installation_id TEXT NOT NULL,
      participant_token TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      alias TEXT NOT NULL,
      start_equity DOUBLE PRECISION NOT NULL,
      equity DOUBLE PRECISION NOT NULL,
      cash_balance DOUBLE PRECISION NOT NULL DEFAULT 100000,
      valuation_snapshot JSONB,
      valuation_snapshot_updated_at TIMESTAMPTZ,
      return_percent DOUBLE PRECISION NOT NULL,
      trade_count INTEGER,
      holdings JSONB NOT NULL DEFAULT '[]'::jsonb,
      event_start_at TIMESTAMPTZ NOT NULL,
      event_end_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      PRIMARY KEY (event_id, installation_id)
    )
  `);
  await pool.query(
    "ALTER TABLE event_arena_leaderboard_entries ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE",
  );
  await pool.query(
    "ALTER TABLE event_arena_leaderboard_entries ADD COLUMN IF NOT EXISTS trade_count INTEGER",
  );
  await pool.query(
    "ALTER TABLE event_arena_leaderboard_entries ADD COLUMN IF NOT EXISTS participant_token TEXT",
  );
  await pool.query(
    "UPDATE event_arena_leaderboard_entries SET participant_token=gen_random_uuid()::text WHERE participant_token IS NULL",
  );
  await pool.query(
    "ALTER TABLE event_arena_leaderboard_entries ALTER COLUMN participant_token SET DEFAULT gen_random_uuid()::text",
  );
  await pool.query(
    "ALTER TABLE event_arena_leaderboard_entries ALTER COLUMN participant_token SET NOT NULL",
  );
  await pool.query(
    "ALTER TABLE event_arena_leaderboard_entries ADD COLUMN IF NOT EXISTS cash_balance DOUBLE PRECISION NOT NULL DEFAULT 100000",
  );
  await pool.query(
    "ALTER TABLE event_arena_leaderboard_entries ADD COLUMN IF NOT EXISTS valuation_snapshot JSONB",
  );
  await pool.query(
    "ALTER TABLE event_arena_leaderboard_entries ADD COLUMN IF NOT EXISTS valuation_snapshot_updated_at TIMESTAMPTZ",
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_arena_leaderboard_snapshots (
      snapshot_id BIGSERIAL PRIMARY KEY,
      event_id TEXT NOT NULL,
      participant_token TEXT NOT NULL,
      event_start_at TIMESTAMPTZ NOT NULL,
      event_end_at TIMESTAMPTZ NOT NULL,
      captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      rank INTEGER NOT NULL,
      return_percent DOUBLE PRECISION NOT NULL,
      is_final BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);
  await pool.query(
    "ALTER TABLE event_arena_leaderboard_snapshots ADD COLUMN IF NOT EXISTS is_final BOOLEAN NOT NULL DEFAULT FALSE",
  );
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS event_arena_participant_token_idx
    ON event_arena_leaderboard_entries (event_id, participant_token)
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS event_arena_final_snapshot_idx
    ON event_arena_leaderboard_snapshots (event_id, participant_token)
    WHERE is_final=TRUE
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_arena_cash_transfers (
      event_id TEXT NOT NULL,
      transfer_ref TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      sender_installation_id TEXT NOT NULL,
      recipient_installation_id TEXT NOT NULL,
      sender_alias TEXT NOT NULL,
      recipient_alias TEXT NOT NULL,
      amount DOUBLE PRECISION NOT NULL CHECK (amount > 0),
      event_start_at TIMESTAMPTZ NOT NULL,
      event_end_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      read_at TIMESTAMPTZ,
      PRIMARY KEY (event_id, transfer_ref),
      UNIQUE (event_id, sender_installation_id, idempotency_key)
    )
  `);
}

function createTransferDatabase(additionalEventIds: string[] = []) {
  const participants = [
    { eventId, installationId, participantToken: "sender-participant-token-1", alias: "MarketFox", cashBalance: 1_000, active: true },
    { eventId, installationId: "recipient-installation-123", participantToken: "recipient-participant-token-1", alias: "BlueWhale", cashBalance: 500, active: true },
    { eventId: "2026-11-30", installationId: "recipient-installation-123", participantToken: "other-event-token-123456", alias: "BlueWhale", cashBalance: 700, active: true },
    ...additionalEventIds.flatMap((id) => [
      { eventId: id, installationId, participantToken: `sender-${id}-participant-token`, alias: "MarketFox", cashBalance: 1_000, active: true },
      { eventId: id, installationId: "recipient-installation-123", participantToken: `recipient-${id}-participant-token`, alias: "BlueWhale", cashBalance: 500, active: true },
    ]),
  ];
  const transfers: any[] = [];
  const query = async (sql: string, values?: any[]) => {
    if (sql.startsWith("DELETE FROM event_arena_")) return { rows: [] };
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [] };
    if (sql.includes("WHERE event_id=$1 AND sender_installation_id=$2 AND idempotency_key=$3")) {
      const row = transfers.find((item) => item.eventId === values?.[0]
        && item.senderInstallationId === values?.[1] && item.idempotencyKey === values?.[2]);
      return { rows: row ? [{
        transfer_ref: row.id,
        sender_alias: row.senderAlias,
        recipient_alias: row.recipientAlias,
        amount: row.amount,
        created_at: row.createdAt,
      }] : [] };
    }
    if (sql.includes("SELECT alias, cash_balance")) {
      const row = participants.find((item) => item.eventId === values?.[0]
        && item.installationId === values?.[1] && item.active);
      return { rows: row ? [{ alias: row.alias, cash_balance: row.cashBalance }] : [] };
    }
    if (sql.includes("SELECT installation_id, alias, cash_balance")) {
      const row = participants.find((item) => item.eventId === values?.[0]
        && item.participantToken === values?.[1] && item.active);
      return { rows: row ? [{
        installation_id: row.installationId,
        alias: row.alias,
        cash_balance: row.cashBalance,
      }] : [] };
    }
    if (sql.startsWith("INSERT INTO event_arena_cash_transfers")) {
      const [targetEventId, id, idempotencyKey, senderInstallationId, recipientInstallationId, senderAlias, recipientAlias, amount] = values ?? [];
      const row = {
        eventId: targetEventId,
        id,
        idempotencyKey,
        senderInstallationId,
        recipientInstallationId,
        senderAlias,
        recipientAlias,
        amount,
        createdAt: new Date("2026-11-18T17:00:00.000Z"),
        readAt: null,
      };
      transfers.push(row);
      return { rows: [{
        transfer_ref: id,
        sender_alias: senderAlias,
        recipient_alias: recipientAlias,
        amount,
        created_at: row.createdAt,
      }] };
    }
    if (sql.includes("SET cash_balance=cash_balance-$3") || sql.includes("SET cash_balance=cash_balance+$3")) {
      const participant = participants.find((item) => item.eventId === values?.[0]
        && item.installationId === values?.[1]);
      if (participant) participant.cashBalance += sql.includes("cash_balance-$3")
        ? -Number(values?.[2])
        : Number(values?.[2]);
      return { rows: [] };
    }
    if (sql.startsWith("UPDATE event_arena_cash_transfers SET read_at")) {
      const selectedIds = sql.includes("transfer_ref=ANY") ? values?.[2] as string[] : null;
      for (const row of transfers) {
        if (
          row.eventId === values?.[0]
          && row.recipientInstallationId === values?.[1]
          && (!selectedIds || selectedIds.includes(row.id))
        ) {
          row.readAt ??= new Date("2026-11-18T18:00:00.000Z");
        }
      }
      return { rows: [] };
    }
    if (sql.includes("SELECT transfer_ref, recipient_alias, amount, created_at")) {
      assert.match(sql, /WHERE event_id=\$1 AND sender_installation_id=\$2[\s\S]*event_end_at > NOW\(\) - \(\$3 \* INTERVAL '1 day'\)/);
      assert.ok([eventId, "2026-11-30"].includes(String(values?.[0])));
      assert.ok(["recipient-installation-123", installationId].includes(String(values?.[1])));
      assert.equal(values?.[2], 30);
      return {
        rows: transfers.filter((item) => item.eventId === values?.[0]
          && item.senderInstallationId === values?.[1]).map((row) => ({
          transfer_ref: row.id,
          recipient_alias: row.recipientAlias,
          amount: row.amount,
          created_at: row.createdAt,
        })),
      };
    }
    if (sql.includes("SELECT transfer_ref, sender_alias, amount, created_at, read_at")) {
      assert.match(sql, /WHERE event_id=\$1 AND recipient_installation_id=\$2[\s\S]*event_end_at > NOW\(\) - \(\$3 \* INTERVAL '1 day'\)/);
      assert.equal(values?.[2], 30);
      return {
        rows: transfers.filter((item) => item.eventId === values?.[0]
          && item.recipientInstallationId === values?.[1]).map((row) => ({
          transfer_ref: row.id,
          sender_alias: row.senderAlias,
          amount: row.amount,
          created_at: row.createdAt,
          read_at: row.readAt,
        })),
      };
    }
    throw new Error(`Unhandled transfer test query: ${sql}`);
  };
  return { participants, transfers, query };
}

function transferRequest(overrides: Record<string, unknown> = {}) {
  return {
    installationId,
    recipientParticipantToken: "recipient-participant-token-1",
    amount: 250,
    availableCash: 300,
    idempotencyKey: "transfer-request-123",
    ...overrides,
  };
}

test("only scheduled biweekly windows and exact Eastern market hours are accepted", () => {
  assert.equal(isValidEventArenaWindow(eventId, startAtMs, endAtMs), true);
  assert.equal(isValidEventArenaWindow(eventId, startAtMs + 60_000, endAtMs), false);
  assert.equal(isValidEventArenaWindow("2026-11-23", startAtMs, endAtMs), false);
  assert.equal(isValidEventArenaWindow("2026-11-16", Number.NaN, endAtMs), false);
});

test("overlapping regular-event calendar settings are rejected before scheduling", async () => {
  const calendar = REGULAR_EVENT_CALENDAR as unknown as {
    cadenceDays: number;
    durationDays: number;
  };
  const originalDurationDays = calendar.durationDays;
  let databaseQueries = 0;
  try {
    assert.equal(getRegularEventCalendarError(), null);
    for (const durationDays of [calendar.cadenceDays, calendar.cadenceDays + 1]) {
      calendar.durationDays = durationDays;
      assert.equal(getRegularEventCalendarError(),
        "Event Arena is unavailable because regular competitions overlap. The event duration must be shorter than the schedule cadence.");
      assert.equal(expectedEventArenaConfiguration("2026-11-16"), null);
      assert.equal(expectedEventArenaConfiguration("lightning-2026-11-27"), null);
      await withApi(async () => {
        databaseQueries += 1;
        return { rows: [] };
      }, async (baseUrl) => {
        const configResponse = await fetch(`${baseUrl}/event-arena/2026-11-16/config`, {
          method: "POST",
        });
        assert.equal(configResponse.status, 503);
        assert.deepEqual(await configResponse.json(), { error: getRegularEventCalendarError() });

        const prepareResponse = await fetch(`${baseUrl}/event-arena/lightning-round/prepare`, {
          method: "POST",
        });
        assert.equal(prepareResponse.status, 503);
        assert.deepEqual(await prepareResponse.json(), { error: getRegularEventCalendarError() });
      });
    }
    assert.equal(databaseQueries, 0);
  } finally {
    calendar.durationDays = originalDurationDays;
  }
});

test("Lightning Round preparation explains when every candidate date is unavailable", async () => {
  const calendar = REGULAR_EVENT_CALENDAR as unknown as {
    cadenceDays: number;
    durationDays: number;
  };
  const originalCadenceDays = calendar.cadenceDays;
  const originalDurationDays = calendar.durationDays;
  let insertQueries = 0;
  try {
    calendar.cadenceDays = 7;
    calendar.durationDays = 6;
    assert.equal(getRegularEventCalendarError(), null);
    assert.deepEqual(getLightningRoundScheduleIds(Date.parse("2026-11-21T15:00:00.000Z")), []);
    await withApi(async (sql) => {
      if (sql.startsWith("INSERT INTO event_arena_events")) insertQueries += 1;
      return { rows: [] };
    }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/event-arena/lightning-round/prepare`, {
        method: "POST",
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        events: [],
        available: false,
        message: LIGHTNING_ROUND_UNAVAILABLE_MESSAGE,
      });
      assert.equal(insertQueries, 0);
    }, Date.parse("2026-11-21T15:00:00.000Z"));
  } finally {
    calendar.cadenceDays = originalCadenceDays;
    calendar.durationDays = originalDurationDays;
  }
});

test("Lightning Round schedules only clear Friday 7:30 a.m. Denver windows", async () => {
  const overlappingFriday = expectedEventArenaConfiguration("lightning-2026-11-20");
  assert.equal(overlappingFriday, null);
  const first = expectedEventArenaConfiguration("lightning-2026-11-27");
  assert.deepEqual(first, {
    eventId: "lightning-2026-11-27",
    eventType: "lightning-round",
    artworkId: "lightning-round-arena",
    startingBalance: 100_000,
    rankingDirection: "highest-return",
    startAtMs: Date.parse("2026-11-27T14:30:00.000Z"),
    endAtMs: Date.parse("2026-11-28T14:30:00.000Z"),
  });
  assert.equal(first.endAtMs - first.startAtMs, 24 * 60 * 60 * 1000);
  assert.equal(isValidEventArenaWindow(first.eventId, first.startAtMs, first.endAtMs), true);
  assert.equal(isValidEventArenaWindow("lightning-2026-11-28", first.startAtMs, first.endAtMs), false);
  assert.equal(isValidEventArenaWindow(first.eventId, first.startAtMs, first.endAtMs - 1), false);
  assert.equal(expectedEventArenaConfiguration("lightning-2026-12-04"), null);
  assert.equal(hasScheduledRegularEventOverlap(
    Date.parse("2026-11-20T14:30:00.000Z"),
    Date.parse("2026-11-21T14:30:00.000Z"),
  ), true);
  assert.equal(hasScheduledRegularEventOverlap(
    Date.parse("2026-11-20T21:00:00.000Z"),
    Date.parse("2026-11-21T21:00:00.000Z"),
  ), false);
  assert.equal(hasScheduledRegularEventOverlap(
    Date.parse("2026-11-15T14:30:00.000Z"),
    Date.parse("2026-11-16T14:30:00.000Z"),
  ), false);
  assert.equal(hasScheduledRegularEventOverlap(
    Date.parse("2026-11-15T14:30:00.000Z"),
    Date.parse("2026-11-16T14:30:00.001Z"),
  ), true);

  const beforeDaylightSaving = expectedEventArenaConfiguration("lightning-2027-03-05");
  const afterDaylightSaving = expectedEventArenaConfiguration("lightning-2027-03-19");
  assert.equal(beforeDaylightSaving?.startAtMs, Date.parse("2027-03-05T14:30:00.000Z"));
  assert.equal(beforeDaylightSaving?.endAtMs, Date.parse("2027-03-06T14:30:00.000Z"));
  assert.equal(afterDaylightSaving?.startAtMs, Date.parse("2027-03-19T13:30:00.000Z"));
  assert.equal(afterDaylightSaving?.endAtMs, Date.parse("2027-03-20T13:30:00.000Z"));
  assert.deepEqual(getLightningRoundScheduleIds(Date.parse("2026-11-21T15:59:59.000Z")), [
    "lightning-2026-11-27",
    "lightning-2026-12-11",
  ]);
  assert.deepEqual(getLightningRoundScheduleIds(Date.parse("2026-11-22T16:00:00.000Z")), [
    "lightning-2026-11-27",
    "lightning-2026-12-11",
  ]);

  let invalidWindowQueries = 0;
  await withApi(async () => {
    invalidWindowQueries += 1;
    return { rows: [] };
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/event-arena/lightning-2026-11-20/config`, {
      method: "POST",
    });
    assert.equal(response.status, 400);
  });
  assert.equal(invalidWindowQueries, 0);

  await withApi(async () => ({ rows: [] }), async (baseUrl) => {
    const prepare = () => fetch(`${baseUrl}/event-arena/lightning-round/prepare`, { method: "POST" });
    const firstPrepare = await prepare();
    const secondPrepare = await prepare();
    assert.equal(firstPrepare.status, 200);
    assert.equal(secondPrepare.status, 200);
    const firstBody = await firstPrepare.json() as any;
    const secondBody = await secondPrepare.json() as any;
    assert.deepEqual(firstBody, secondBody);
    assert.equal(firstBody.events.length, 2);
    assert.ok(firstBody.events.every((event: any) => event.eventType === "lightning-round"));
    assert.deepEqual(firstBody.events.map((event: any) => event.eventId), [
      "lightning-2026-11-27",
      "lightning-2026-12-11",
    ]);
  }, Date.parse("2026-11-21T15:00:00.000Z"));
});

test("Lightning Round preparation recovers missed runs without duplicating or changing saved events", async () => {
  const saved = new Map<string, any>();
  const db: TestDatabase = {
    query: async (sql, values) => {
      if (sql.includes("WHERE event_type='lightning-round'")) {
        const cutoff = Number(values?.[0]);
        const latest = [...saved.values()]
          .filter((row) => row.event_type === "lightning-round" && row.event_start_at.getTime() <= cutoff)
          .sort((a, b) => b.event_start_at.getTime() - a.event_start_at.getTime())[0];
        return { rows: latest ? [{ event_id: latest.event_id }] : [] };
      }
      if (sql.startsWith("INSERT INTO event_arena_events")) {
        const configuration = expectedEventArenaConfiguration(String(values?.[0]));
        assert.ok(configuration);
        if (saved.has(configuration.eventId)) return { rows: [] };
        const row = {
          event_id: configuration.eventId,
          event_type: configuration.eventType,
          artwork_id: configuration.artworkId,
          starting_balance: configuration.startingBalance,
          ranking_direction: configuration.rankingDirection,
          purchase_limit: configuration.purchaseLimit ?? null,
          event_start_at: new Date(configuration.startAtMs),
          event_end_at: new Date(configuration.endAtMs),
        };
        saved.set(configuration.eventId, row);
        return { rows: [row] };
      }
      if (sql.includes("FROM event_arena_events WHERE event_id=$1")) {
        const row = saved.get(String(values?.[0]));
        return { rows: row ? [row] : [] };
      }
      throw new Error(`Unexpected schedule test query: ${sql}`);
    },
  };

  // First run occurs after the first eligible round has already ended.
  const recovered = await prepareLightningRoundEvents(db, Date.parse("2026-11-29T18:00:00.000Z"));
  assert.deepEqual(recovered.map((event) => event.eventId), [
    "lightning-2026-11-27",
    "lightning-2026-12-11",
    "lightning-2026-12-25",
  ]);
  const firstSaved = [...saved.entries()].map(([id, row]) => [id, { ...row }]);

  const repeatedRuns = await Promise.all([
    prepareLightningRoundEvents(db, Date.parse("2026-11-29T18:00:00.000Z")),
    prepareLightningRoundEvents(db, Date.parse("2026-11-29T18:00:00.000Z")),
  ]);
  assert.deepEqual(repeatedRuns[0], recovered);
  assert.deepEqual(repeatedRuns[1], recovered);
  assert.equal(saved.size, 3);

  const later = await prepareLightningRoundEvents(db, Date.parse("2026-12-20T18:00:00.000Z"));
  assert.deepEqual(later.map((event) => event.eventId), [
    "lightning-2026-12-11",
    "lightning-2026-12-25",
    "lightning-2027-01-08",
  ]);
  assert.equal(saved.size, 4);
  for (const [id, row] of firstSaved) assert.deepEqual(saved.get(id), row);
});

test("event artwork resolves to an immutable championship configuration", async () => {
  assert.deepEqual(expectedEventArenaConfiguration("2026-11-16"), {
    eventId: "2026-11-16",
    eventType: "event-arena",
    artworkId: "stadium",
    startingBalance: 100_000,
    rankingDirection: "highest-return",
    startAtMs,
    endAtMs,
  });
  const greenEvent = expectedEventArenaConfiguration("2027-01-11");
  assert.equal(greenEvent?.eventType, "green-bull-championship");
  assert.equal(greenEvent?.artworkId, "green-stock-exchange");
  assert.equal(greenEvent?.startingBalance, 500_000);
  assert.equal(greenEvent?.rankingDirection, "highest-return");
  const bearEvent = expectedEventArenaConfiguration("2026-12-28");
  assert.equal(bearEvent?.eventType, "bear-market-mayhem");
  assert.equal(bearEvent?.artworkId, "red-showdown");
  assert.equal(bearEvent?.startingBalance, 100_000);
  assert.equal(bearEvent?.rankingDirection, "lowest-return");
  const pennyEvent = expectedEventArenaConfiguration("2027-01-25");
  assert.equal(pennyEvent?.eventType, "penny-stock-mayhem");
  assert.equal(pennyEvent?.artworkId, "penny-stock-mayhem");
  assert.equal(pennyEvent?.startingBalance, 100_000);
  assert.equal(pennyEvent?.rankingDirection, "highest-return");
  assert.equal(pennyEvent?.purchaseLimit, 20);
  const oneStockEvent = expectedEventArenaConfiguration("2027-02-08");
  assert.equal(oneStockEvent?.eventType, "one-stock-challenge");
  assert.equal(oneStockEvent?.artworkId, "one-stock-challenge");
  assert.equal(oneStockEvent?.startingBalance, 100_000);
  assert.equal(oneStockEvent?.rankingDirection, "highest-return");
  assert.equal(oneStockEvent?.purchaseLimit, undefined);
  const mountainEvent = expectedEventArenaConfiguration("2026-12-14");
  assert.equal(mountainEvent?.eventType, "mountain-championship");
  assert.equal(mountainEvent?.artworkId, "mountain-summit");
  assert.equal(mountainEvent?.startingBalance, 100_000);
  assert.equal(mountainEvent?.rankingDirection, "highest-return");
  const neonEvent = expectedEventArenaConfiguration("2026-11-30");
  assert.equal(neonEvent?.eventType, "event-arena");
  assert.equal(neonEvent?.artworkId, "neon-nightclub");
  assert.equal(neonEvent?.startingBalance, 250_000);
  assert.equal(new Date(pennyEvent!.startAtMs).toISOString(), "2027-01-25T14:30:00.000Z");
  assert.equal(new Date(pennyEvent!.endAtMs).toISOString(), "2027-01-29T21:00:00.000Z");

  await withApi(async () => ({ rows: [] }), async (baseUrl) => {
    const save = () => fetch(`${baseUrl}/event-arena/2027-01-11/config`, { method: "POST" });
    const first = await save();
    const firstConfiguration = await first.json();
    const second = await save();
    assert.equal(first.status, 200);
    assert.deepEqual(firstConfiguration, await second.json());
    assert.deepEqual(firstConfiguration, greenEvent);

    const pennyResponse = await fetch(`${baseUrl}/event-arena/2027-01-25/config`, { method: "POST" });
    assert.equal(pennyResponse.status, 200);
    assert.deepEqual(await pennyResponse.json(), pennyEvent);
  });
});

test("unstarted Neon Nightclub configurations increase to $250,000 without changing started events", async () => {
  const expected = expectedEventArenaConfiguration("2026-11-30");
  assert.ok(expected);
  const makeSavedNeonConfig = () => ({
    event_id: expected.eventId,
    event_type: "event-arena",
    artwork_id: "neon-nightclub",
    starting_balance: 100_000,
    ranking_direction: "highest-return",
    purchase_limit: null,
    event_start_at: new Date(expected.startAtMs),
    event_end_at: new Date(expected.endAtMs),
  });
  const upcoming = new Map([[expected.eventId, makeSavedNeonConfig()]]);
  await withApi(async () => ({ rows: [] }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/event-arena/${expected.eventId}/config`, { method: "POST" });
    assert.equal(response.status, 200);
    const config = await response.json() as any;
    assert.equal(config.artworkId, "neon-nightclub");
    assert.equal(config.startingBalance, 250_000);
    assert.equal(upcoming.get(expected.eventId)?.starting_balance, 250_000);
  }, expected.startAtMs - 86_400_000, upcoming);

  const alreadyStarted = new Map([[expected.eventId, makeSavedNeonConfig()]]);
  await withApi(async () => ({ rows: [] }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/event-arena/${expected.eventId}/config`, { method: "POST" });
    assert.equal(response.status, 200);
    const config = await response.json() as any;
    assert.equal(config.startingBalance, 100_000);
    assert.equal(alreadyStarted.get(expected.eventId)?.starting_balance, 100_000);
  }, expected.startAtMs + 1, alreadyStarted);
});

test("a previously saved Mountain configuration resolves to its stable event type", async () => {
  const expected = expectedEventArenaConfiguration("2026-12-14");
  assert.ok(expected);
  const existing = new Map([[expected.eventId, {
    event_id: expected.eventId,
    event_type: "event-arena",
    artwork_id: "mountain-summit",
    starting_balance: 100_000,
    ranking_direction: "highest-return",
    event_start_at: new Date(expected.startAtMs),
    event_end_at: new Date(expected.endAtMs),
  }]]);
  await withApi(async () => ({ rows: [] }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/event-arena/${expected.eventId}/config`, { method: "POST" });
    assert.equal(response.status, 200);
    const result = await response.json() as any;
    assert.equal(result.eventType, "mountain-championship");
    assert.equal(result.artworkId, "mountain-summit");
  }, Date.parse("2026-12-10T17:00:00.000Z"), existing);
});

test("Mountain Championship transfers are rejected across preparation and competition boundaries", async () => {
  const mountain = expectedEventArenaConfiguration("2026-12-14");
  assert.ok(mountain);
  const preparationStart = getRegularEventPreparationStartAtMs(mountain.eventId);
  assert.ok(preparationStart);
  const db = createTransferDatabase([mountain.eventId]);
  const beforeBalances = db.participants
    .filter((participant) => participant.eventId === mountain.eventId)
    .map((participant) => participant.cashBalance);
  for (const [time, expectedStatus] of [
    [preparationStart - 1, 410],
    [preparationStart, 409],
    [mountain.startAtMs, 409],
    [mountain.endAtMs - 1, 409],
    [mountain.endAtMs, 410],
    [mountain.endAtMs + 1, 410],
  ]) {
    await withApi(db.query, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/event-arena/${mountain.eventId}/transfers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(transferRequest()),
      });
      assert.equal(response.status, expectedStatus, `transfer response at ${new Date(time).toISOString()}`);
      if (expectedStatus === 409) {
        assert.deepEqual(await response.json(), {
          error: "Cash transfers are disabled during the Mountain Championship preparation period and competition.",
        });
      }
    }, time);
  }

  db.transfers.push({
    eventId: mountain.eventId,
    id: "old-transfer-ref-123",
    idempotencyKey: "transfer-request-123",
    senderInstallationId: installationId,
    recipientInstallationId: "recipient-installation-123",
    senderAlias: "MarketFox",
    recipientAlias: "BlueWhale",
    amount: 100,
    createdAt: new Date("2026-12-16T17:00:00.000Z"),
    readAt: null,
  });
  await withApi(db.query, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/event-arena/${mountain.eventId}/transfers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(transferRequest()),
    });
    assert.equal(response.status, 409, "a preexisting idempotency record cannot bypass the lock");
  }, mountain.startAtMs + 60_000);

  assert.equal(db.transfers.length, 1, "an idempotent retry is rejected rather than returned as success");
  assert.deepEqual(
    db.participants.filter((participant) => participant.eventId === mountain.eventId)
      .map((participant) => participant.cashBalance),
    beforeBalances,
  );
});

test("cash transfers remain available for Green Bull, Red Bear, and Penny Stock events", async () => {
  const unaffectedEvents = [
    "2026-12-28",
    "2027-01-11",
    "2027-01-25",
  ].map((id) => expectedEventArenaConfiguration(id));
  assert.ok(unaffectedEvents.every((event) => event));
  const db = createTransferDatabase(unaffectedEvents.map((event) => event!.eventId));

  for (const event of unaffectedEvents) {
    assert.ok(event);
    const senderToken = `sender-${event.eventId}-participant-token`;
    await withApi(db.query, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/event-arena/${event.eventId}/transfers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(transferRequest({
          recipientParticipantToken: `recipient-${event.eventId}-participant-token`,
          idempotencyKey: `transfer-${event.eventId.replaceAll("-", "")}`,
        })),
      });
      assert.equal(response.status, 200, `${event.eventType} remains transferable`);
    }, event.startAtMs + 60_000);
    const balances = db.participants
      .filter((participant) => participant.eventId === event.eventId)
      .map((participant) => participant.cashBalance);
    assert.deepEqual(balances, [750, 750], `${event.eventType} still transfers cash normally (${senderToken})`);
  }
});

test("Bear Market ranks the lowest return first while standard and Green Bull stay highest-first", () => {
  const returns = [-35, -22, -10, 5];
  const rows = returns.map((returnPercent, index) => ({
    installation_id: `install-${index}`,
    alias: `Trader${index}`,
    start_equity: 100_000,
    equity: 100_000 * (1 + returnPercent / 100),
    updated_at: new Date(`2026-11-18T17:0${index}:00.000Z`),
  }));
  assert.deepEqual(
    rankEventArenaEntries(rows, null, "lowest-return").map((entry) => entry.returnPercent),
    [-35, -22, -10, 5],
  );
  assert.deepEqual(
    rankEventArenaEntries(rows, null, "highest-return").map((entry) => entry.returnPercent),
    [5, -10, -22, -35],
  );
  const ties = [
    { ...rows[0], installation_id: "z-id", alias: "Same", equity: 90_000 },
    { ...rows[1], installation_id: "a-id", alias: "Same", equity: 90_000, updated_at: rows[0]?.updated_at },
  ];
  assert.deepEqual(
    rankEventArenaEntries(ties, "a-id", "lowest-return").map((entry) => entry.isCurrentUser),
    [true, false],
  );
});

test("a Red Showdown configuration saved before Bear Market Mayhem keeps its original rules", async () => {
  const expected = expectedEventArenaConfiguration("2026-12-28");
  assert.ok(expected);
  const existing = new Map([[expected.eventId, {
    event_id: expected.eventId,
    event_type: "event-arena",
    artwork_id: "red-showdown",
    starting_balance: 100_000,
    ranking_direction: "highest-return",
    event_start_at: new Date(expected.startAtMs),
    event_end_at: new Date(expected.endAtMs),
  }]]);
  await withApi(async () => ({ rows: [] }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/event-arena/${expected.eventId}/config`, { method: "POST" });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ...expected,
      eventType: "event-arena",
      rankingDirection: "highest-return",
    });
  }, Date.parse("2026-12-20T17:00:00.000Z"), existing);
});

test("Bear Market score submissions validate against the saved baseline and snapshot lowest-first ranks", async () => {
  const redEvent = expectedEventArenaConfiguration("2026-12-28");
  assert.ok(redEvent);
  const snapshotValues: unknown[][] = [];
  await withApi(async (sql, values) => {
    if (sql.startsWith("DELETE") || ["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [] };
    if (sql.startsWith("SELECT installation_id\n")) return { rows: [] };
    if (sql.startsWith("INSERT INTO event_arena_leaderboard_entries")) {
      return { rows: [{ updated_at: new Date("2026-12-30T17:00:00.000Z") }] };
    }
    if (sql.includes("SELECT installation_id, participant_token, alias")) {
      return { rows: [-35, -22, -10, 5].map((returnPercent, index) => ({
        installation_id: `red-install-${index}`,
        participant_token: `red-token-${index}`,
        alias: `Bear${index}`,
        start_equity: 100_000,
        equity: 100_000 * (1 + returnPercent / 100),
        updated_at: new Date(`2026-12-30T17:0${index}:00.000Z`),
      })) };
    }
    if (sql.startsWith("INSERT INTO event_arena_leaderboard_snapshots")) {
      snapshotValues.push(values ?? []);
      return { rows: [] };
    }
    return { rows: [] };
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/event-arena/${redEvent.eventId}/leaderboard`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validSubmission({
        eventType: "bear-market-mayhem",
        artworkId: "red-showdown",
        startingBalance: 100_000,
        rankingDirection: "lowest-return",
        startEquity: 100_000,
        equity: 65_000,
        returnPercent: -35,
        eventStartAtMs: redEvent.startAtMs,
        eventEndAtMs: redEvent.endAtMs,
      })),
    });
    assert.equal(response.status, 200);
  }, Date.parse("2026-12-30T18:00:00.000Z"));
  assert.equal(snapshotValues.length, 1);
  assert.deepEqual(snapshotValues[0]?.[1], ["red-token-0", "red-token-1", "red-token-2", "red-token-3"]);
  assert.deepEqual(snapshotValues[0]?.[2], [1, 2, 3, 4]);
  assert.deepEqual(snapshotValues[0]?.[3], [-35, -22, -10, 5]);
});

test("Green Bull scores must start with $500,000 and report a zero initial return", async () => {
  const insertedScores: any[][] = [];
  await withApi(async (sql, values) => {
    if (sql.startsWith("DELETE")) return { rows: [] };
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [] };
    if (sql.startsWith("SELECT installation_id")) return { rows: [] };
    if (sql.startsWith("INSERT INTO event_arena_leaderboard_entries")) {
      insertedScores.push(values ?? []);
      return { rows: [{ updated_at: new Date("2027-01-13T17:00:00.000Z") }] };
    }
    if (sql.includes("SELECT installation_id, participant_token, alias")) return { rows: [] };
    return { rows: [] };
  }, async (baseUrl) => {
    const submit = (overrides: Record<string, unknown>) => fetch(
      `${baseUrl}/event-arena/2027-01-11/leaderboard`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validSubmission({
          eventType: "green-bull-championship",
          artworkId: "green-stock-exchange",
          startingBalance: 500_000,
          startEquity: 500_000,
          equity: 500_000,
          returnPercent: 0,
          cashBalance: 500_000,
          eventStartAtMs: Date.parse("2027-01-11T14:30:00.000Z"),
          eventEndAtMs: Date.parse("2027-01-15T21:00:00.000Z"),
          ...overrides,
        })),
      },
    );
    const wrongBaseline = await submit({ startEquity: 100_000, startingBalance: 100_000 });
    assert.equal(wrongBaseline.status, 400);
    assert.equal(insertedScores.length, 0);

    const initialScore = await submit({});
    assert.equal(initialScore.status, 200);
    assert.equal(insertedScores.length, 1);
    assert.equal(insertedScores[0]?.[3], 500_000);
    assert.equal(insertedScores[0]?.[4], 500_000);
    assert.equal(insertedScores[0]?.[5], 0);
  }, Date.parse("2027-01-13T17:00:00.000Z"));
});

test("cash transfers are event scoped and an idempotent retry never moves cash twice", async () => {
  const db = createTransferDatabase();
  await withApi(db.query, async (baseUrl) => {
    const send = () => fetch(`${baseUrl}/event-arena/${eventId}/transfers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(transferRequest()),
    });
    const firstResponse = await send();
    assert.equal(firstResponse.status, 200);
    const first = await firstResponse.json() as any;
    assert.equal(first.transfer.senderAlias, "MarketFox");
    assert.equal(first.transfer.recipientAlias, "BlueWhale");
    assert.equal(first.transfer.amount, 250);
    assert.equal(JSON.stringify(first).includes(installationId), false);

    const retryResponse = await send();
    assert.equal(retryResponse.status, 200);
    const retry = await retryResponse.json() as any;
    assert.equal(retry.transfer.id, first.transfer.id);
    assert.equal(db.transfers.length, 1);
    assert.equal(db.participants[0].cashBalance, 750);
    assert.equal(db.participants[1].cashBalance, 750);
    assert.equal(db.participants[2].cashBalance, 700);
  });
});

test(
  "concurrent database-backed retries share one transfer while a score update reconciles cash",
  { skip: !databaseUrl && "DATABASE_URL is not configured" },
  async () => {
    assert.ok(databaseUrl);
    const applicationName = `event-arena-test-${randomUUID()}`;
    const pool = new Pool({ connectionString: databaseUrl, max: 6, application_name: applicationName });
    const senderInstallationId = `arena-sender-${randomUUID()}`;
    const recipientInstallationId = `arena-recipient-${randomUUID()}`;
    const senderToken = `sender-token-${randomUUID()}`;
    const recipientToken = `recipient-token-${randomUUID()}`;
    const idempotencyKey = `transfer-${randomUUID().replaceAll("-", "")}`;
    const installations = [senderInstallationId, recipientInstallationId];

    try {
      await ensureEventArenaTables(pool);
      const { rows: idempotencyIndexes } = await pool.query(
        `SELECT indexdef FROM pg_indexes
         WHERE tablename='event_arena_cash_transfers'
           AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
           AND indexdef LIKE '%(event_id, sender_installation_id, idempotency_key)%'`,
      );
      assert.ok(idempotencyIndexes.length > 0, "the database should enforce sender-scoped idempotency keys");
      await pool.query(
        `INSERT INTO event_arena_leaderboard_entries
          (event_id, installation_id, participant_token, alias, start_equity, equity,
           cash_balance, return_percent, trade_count, holdings, event_start_at, event_end_at, updated_at)
         VALUES
          ($1,$2,$3,'MarketFox',1000,1000,1000,0,0,'[]'::jsonb,
           TO_TIMESTAMP($4 / 1000.0),TO_TIMESTAMP($5 / 1000.0),NOW() - INTERVAL '1 minute'),
          ($1,$6,$7,'BlueWhale',500,500,500,0,0,'[]'::jsonb,
           TO_TIMESTAMP($4 / 1000.0),TO_TIMESTAMP($5 / 1000.0),NOW() - INTERVAL '1 minute')`,
        [eventId, senderInstallationId, senderToken, startAtMs, endAtMs, recipientInstallationId, recipientToken],
      );

      await withApi(pool, async (baseUrl) => {
        const sendTransfer = () => fetch(`${baseUrl}/event-arena/${eventId}/transfers`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(transferRequest({
            installationId: senderInstallationId,
            recipientParticipantToken: recipientToken,
            idempotencyKey,
            amount: 250,
            availableCash: 1000,
          })),
        });
        const updateScore = () => fetch(`${baseUrl}/event-arena/${eventId}/leaderboard`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(validSubmission({
            installationId: senderInstallationId,
            cashBalance: 1000,
            appliedTransferIds: [],
          })),
        });

        const blocker = await pool.connect();
        await blocker.query("BEGIN");
        await blocker.query(
          `SELECT installation_id FROM event_arena_leaderboard_entries
           WHERE event_id=$1 AND installation_id=$2 FOR UPDATE`,
          [eventId, senderInstallationId],
        );
        const responsesPromise = Promise.all([
          sendTransfer(),
          sendTransfer(),
          updateScore(),
        ]);
        try {
          const waitDeadline = Date.now() + 5_000;
          let waitingRequests = 0;
          while (Date.now() < waitDeadline && waitingRequests < 3) {
            const { rows } = await pool.query(
              `SELECT COUNT(*)::int AS count
               FROM pg_stat_activity
               WHERE application_name=$1
                 AND pid <> pg_backend_pid()
                 AND wait_event_type='Lock'
                 AND query LIKE '%FOR UPDATE%'`,
              [applicationName],
            );
            waitingRequests = rows[0]?.count ?? 0;
            if (waitingRequests < 3) await sleep(10);
          }
          assert.equal(waitingRequests, 3, "both retries and the score update should be blocked on the sender row");
        } finally {
          await blocker.query("ROLLBACK");
          blocker.release();
        }
        const [firstResponse, retryResponse, scoreResponse] = await responsesPromise;
        assert.equal(firstResponse.status, 200);
        assert.equal(retryResponse.status, 200);
        assert.equal(scoreResponse.status, 200);
        const [first, retry] = await Promise.all([
          firstResponse.json() as Promise<any>,
          retryResponse.json() as Promise<any>,
        ]);
        assert.equal(first.transfer.id, retry.transfer.id);

        const { rows: transfers } = await pool.query(
          `SELECT transfer_ref, amount FROM event_arena_cash_transfers
           WHERE event_id=$1 AND sender_installation_id=$2 AND idempotency_key=$3`,
          [eventId, senderInstallationId, idempotencyKey],
        );
        assert.equal(transfers.length, 1);
        assert.equal(transfers[0].transfer_ref, first.transfer.id);
        assert.equal(Number(transfers[0].amount), 250);

        const { rows: balances } = await pool.query(
          `SELECT installation_id, cash_balance FROM event_arena_leaderboard_entries
           WHERE event_id=$1 AND installation_id = ANY($2::text[])`,
          [eventId, installations],
        );
        assert.deepEqual(
          Object.fromEntries(balances.map((row: any) => [row.installation_id, Number(row.cash_balance)])),
          { [senderInstallationId]: 750, [recipientInstallationId]: 750 },
        );
      });
    } finally {
      try {
        await pool.query(
          "DELETE FROM event_arena_cash_transfers WHERE event_id=$1 AND sender_installation_id=$2",
          [eventId, senderInstallationId],
        );
        await pool.query(
          "DELETE FROM event_arena_leaderboard_entries WHERE event_id=$1 AND installation_id = ANY($2::text[])",
          [eventId, installations],
        );
      } finally {
        await pool.end();
      }
    }
  },
);

test("cash transfers reject self, ineligible recipients, insufficient cash, and inactive windows", async () => {
  const db = createTransferDatabase();
  await withApi(db.query, async (baseUrl) => {
    const send = (event: string, body: Record<string, unknown>) => fetch(`${baseUrl}/event-arena/${event}/transfers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal((await send(eventId, transferRequest({
      recipientParticipantToken: "sender-participant-token-1",
    }))).status, 400);
    assert.equal((await send(eventId, transferRequest({
      recipientParticipantToken: "not-an-event-participant-token",
    }))).status, 404);
    assert.equal((await send(eventId, transferRequest({ amount: 301, availableCash: 300 }))).status, 409);
    assert.equal(db.transfers.length, 0);
  });
  await withApi(db.query, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/event-arena/${eventId}/transfers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(transferRequest()),
    });
    assert.equal(response.status, 410);
  }, startAtMs - 1);
  await withApi(db.query, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/event-arena/${eventId}/transfers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(transferRequest()),
    });
    assert.equal(response.status, 410);
  }, endAtMs + 1);
  await withApi(db.query, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/event-arena/${eventId}/transfers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(transferRequest()),
    });
    assert.equal(response.status, 410);
  }, endAtMs);
  assert.equal(db.transfers.length, 0);
});

test("cash inbox returns only incoming transfers for its event and opening marks them read", async () => {
  const db = createTransferDatabase();
  await withApi(db.query, async (baseUrl) => {
    const sent = await fetch(`${baseUrl}/event-arena/${eventId}/transfers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(transferRequest()),
    });
    assert.equal(sent.status, 200);

    const inboxUrl = `${baseUrl}/event-arena/${eventId}/transfers`;
    const unopened = await fetch(inboxUrl, {
      headers: { "X-Event-Arena-Installation-Id": "recipient-installation-123" },
    });
    const unread = await unopened.json() as any;
    assert.equal(unread.notifications.length, 1);
    assert.equal(unread.notifications[0].senderAlias, "MarketFox");
    assert.equal(unread.notifications[0].readAt, null);
    assert.deepEqual(unread.sentTransfers, []);

    const opened = await fetch(inboxUrl, {
      headers: {
        "X-Event-Arena-Installation-Id": "recipient-installation-123",
        "X-Event-Arena-Mark-Read": "true",
      },
    });
    const read = await opened.json() as any;
    assert.equal(read.notifications.length, 1);
    assert.equal(read.notifications[0].eventId, eventId);
    assert.equal(typeof read.notifications[0].readAt, "string");

    const senderHistoryResponse = await fetch(inboxUrl, {
      headers: { "X-Event-Arena-Installation-Id": installationId },
    });
    const senderHistory = await senderHistoryResponse.json() as any;
    assert.deepEqual(senderHistory.sentTransfers, [{
      id: db.transfers[0].id,
      eventId,
      recipientAlias: "BlueWhale",
      amount: 250,
      createdAt: "2026-11-18T17:00:00.000Z",
    }]);
    assert.equal(JSON.stringify(senderHistory).includes(installationId), false);
    assert.equal(JSON.stringify(senderHistory).includes("recipient-installation-123"), false);

    const otherEvent = await fetch(`${baseUrl}/event-arena/2026-11-30/transfers`, {
      headers: { "X-Event-Arena-Installation-Id": installationId },
    });
    const otherEventHistory = await otherEvent.json() as any;
    assert.deepEqual(otherEventHistory.notifications, []);
    assert.deepEqual(otherEventHistory.sentTransfers, []);
  });
});

test("cash receipt acknowledgement marks only the transfers shown to the recipient", async () => {
  const db = createTransferDatabase();
  await withApi(db.query, async (baseUrl) => {
    const inboxUrl = `${baseUrl}/event-arena/${eventId}/transfers`;
    const send = async (idempotencyKey: string) => fetch(inboxUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(transferRequest({ idempotencyKey })),
    });
    assert.equal((await send("cash-first")).status, 200);
    assert.equal((await send("cash-second")).status, 200);
    const unreadResponse = await fetch(inboxUrl, {
      headers: { "X-Event-Arena-Installation-Id": "recipient-installation-123" },
    });
    const unread = await unreadResponse.json() as any;
    const acknowledgedId = unread.notifications[0].id;

    const acknowledged = await fetch(`${inboxUrl}/read`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Event-Arena-Installation-Id": "recipient-installation-123",
      },
      body: JSON.stringify({ transferIds: [acknowledgedId] }),
    });
    assert.equal(acknowledged.status, 200);
    const refreshed = await fetch(inboxUrl, {
      headers: { "X-Event-Arena-Installation-Id": "recipient-installation-123" },
    });
    const result = await refreshed.json() as any;
    assert.equal(result.notifications.filter((item: any) => item.readAt === null).length, 1);
    assert.equal(result.notifications.find((item: any) => item.id === acknowledgedId).readAt !== null, true);
  });
});

test("retained completed cash history stays private after leaderboard opt-out", async () => {
  const db = createTransferDatabase();
  db.participants.forEach((participant) => { participant.active = false; });
  db.transfers.push({
    eventId,
    id: "past-transfer-ref-123",
    senderInstallationId: installationId,
    recipientInstallationId: "recipient-installation-123",
    senderAlias: "MarketFox",
    recipientAlias: "BlueWhale",
    amount: 125,
    createdAt: new Date("2026-11-19T15:00:00.000Z"),
    readAt: null,
  });

  await withApi(db.query, async (baseUrl) => {
    const pastEventUrl = `${baseUrl}/event-arena/${eventId}/transfers`;
    const senderResponse = await fetch(pastEventUrl, {
      headers: { "X-Event-Arena-Installation-Id": installationId },
    });
    const senderHistory = await senderResponse.json() as any;
    assert.equal(senderHistory.notifications.length, 0);
    assert.deepEqual(senderHistory.sentTransfers, [{
      id: "past-transfer-ref-123",
      eventId,
      recipientAlias: "BlueWhale",
      amount: 125,
      createdAt: "2026-11-19T15:00:00.000Z",
    }]);

    const recipientResponse = await fetch(pastEventUrl, {
      headers: { "X-Event-Arena-Installation-Id": "recipient-installation-123" },
    });
    const recipientHistory = await recipientResponse.json() as any;
    assert.equal(recipientHistory.sentTransfers.length, 0);
    assert.equal(recipientHistory.notifications.length, 1);
    assert.equal(recipientHistory.notifications[0].senderAlias, "MarketFox");
    assert.equal(recipientHistory.notifications[0].readAt, null);

    const anotherEventResponse = await fetch(`${baseUrl}/event-arena/2026-11-30/transfers`, {
      headers: { "X-Event-Arena-Installation-Id": installationId },
    });
    const anotherEventHistory = await anotherEventResponse.json() as any;
    assert.deepEqual(anotherEventHistory.notifications, []);
    assert.deepEqual(anotherEventHistory.sentTransfers, []);
    assert.equal(JSON.stringify(senderHistory).includes(installationId), false);
    assert.equal(JSON.stringify(recipientHistory).includes("recipient-installation-123"), false);
  }, Date.parse("2026-12-01T17:00:00.000Z"));
});

test("expired public entries and their alias locks are deleted after the retention period", async () => {
  let cleanupCalls = 0;
  await purgeExpiredEventArenaEntries({
    async query(sql, values) {
      cleanupCalls += 1;
      assert.match(sql, /^DELETE FROM event_arena_(leaderboard_entries|cash_transfers|leaderboard_snapshots)/);
      assert.match(sql, /event_end_at <= NOW\(\) - \(\$1 \* INTERVAL '1 day'\)/);
      assert.deepEqual(values, [30]);
      assert.doesNotMatch(sql, /is_active/);
      assert.doesNotMatch(sql, /paper_accounts|paper_positions|paper_transactions/);
      return { rows: [] };
    },
  });
  assert.equal(EVENT_ARENA_RETENTION_DAYS, 30);
  assert.equal(cleanupCalls, 3);
});

test("submission rejects private fields, inconsistent scores, malformed holdings, and oversized payloads", async () => {
  for (const payload of [
    validSubmission({ transactions: [] }),
    validSubmission({ returnPercent: 99 }),
    validSubmission({ holdings: [{ symbol: "AAPL", companyName: "Apple", shares: 1 }] }),
    validSubmission({ holdings: [{ symbol: "AAPL", companyName: "Apple", allocationPercent: -1, side: "long" }] }),
    validSubmission({ holdings: [{ symbol: "AAPL", companyName: "Apple", allocationPercent: 1, side: "sideways" }] }),
    validSubmission({ holdings: Array.from({ length: 101 }, (_, index) => ({ symbol: `S${index}`, companyName: "Company" })) }),
    validSubmission({ alias: "  " }),
  ]) {
    let calls = 0;
    await withApi(async () => { calls += 1; return { rows: [] }; }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/event-arena/${eventId}/leaderboard`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      assert.equal(response.status, 400);
    });
    assert.equal(calls, 0);
  }
});

test("valid anonymous submission stores only event-scoped score and public holding summary", async () => {
  let storedValues: any[] | undefined;
  let privateSnapshotValues: any[] | undefined;
  await withApi(async (sql, values) => {
    if (sql.startsWith("DELETE")) return { rows: [] };
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [] };
    if (sql.startsWith("SELECT installation_id")) return { rows: [] };
    if (sql.startsWith("UPDATE event_arena_leaderboard_entries") && sql.includes("valuation_snapshot")) {
      privateSnapshotValues = values;
      return { rows: [] };
    }
    assert.match(sql, /ON CONFLICT \(event_id, installation_id\)/);
    assert.match(sql, /updated_at <= NOW\(\)[\s\S]*CASE WHEN \$13::boolean THEN 3 ELSE 15 END/);
    assert.match(sql, /event_start_at > NOW\(\)[\s\S]*alias = EXCLUDED\.alias/);
    assert.match(sql, /trade_count=EXCLUDED\.trade_count/);
    storedValues = values;
    return { rows: [{ alias: "MarketFox", start_equity: 100_000, equity: 101_250, return_percent: 1.25, trade_count: 3, holdings: [{ symbol: "AAPL", companyName: "Apple Inc.", allocationPercent: 12.5, side: "long" }], updated_at: new Date("2026-11-18T17:00:00.000Z") }] };
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/event-arena/${eventId}/leaderboard`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validSubmission({
        forceRefresh: true,
        valuationSnapshot: {
          unsettledCash: 120,
          shortCollateral: 0,
          positions: [{ symbol: "AAPL", companyName: "Apple Inc.", shares: 12, assetType: "stock", side: "long" }],
        },
      })),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, updatedAt: "2026-11-18T17:00:00.000Z" });
  });
  assert.equal(storedValues?.[0], eventId);
  assert.equal(storedValues?.[1], installationId);
  assert.equal(storedValues?.[6], 3);
  assert.deepEqual(JSON.parse(storedValues?.[7]), [{ symbol: "AAPL", companyName: "Apple Inc.", allocationPercent: 12.5, side: "long" }]);
  assert.equal(storedValues?.[12], true);
  assert.deepEqual(privateSnapshotValues?.slice(0, 2), [eventId, installationId]);
  assert.deepEqual(JSON.parse(privateSnapshotValues?.[2]), {
    unsettledCash: 120,
    shortCollateral: 0,
    positions: [{ symbol: "AAPL", companyName: "Apple Inc.", shares: 12, assetType: "stock", side: "long" }],
  });
});

test("Penny Stock Mayhem submissions must match the saved exclusive purchase limit", async () => {
  const pennyEvent = expectedEventArenaConfiguration("2027-01-25");
  assert.ok(pennyEvent);
  for (const { purchaseLimit, status } of [
    { purchaseLimit: 20, status: 200 },
    { purchaseLimit: 19, status: 400 },
    { purchaseLimit: undefined, status: 400 },
  ]) {
    await withApi(async (sql) => {
      if (sql.startsWith("DELETE") || ["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [] };
      if (sql.startsWith("SELECT installation_id")) return { rows: [] };
      if (sql.startsWith("INSERT INTO event_arena_leaderboard_entries")) {
        return { rows: [{ updated_at: new Date("2027-01-27T18:00:00.000Z") }] };
      }
      return { rows: [] };
    }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/event-arena/${pennyEvent.eventId}/leaderboard`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validSubmission({
          eventStartAtMs: pennyEvent.startAtMs,
          eventEndAtMs: pennyEvent.endAtMs,
          purchaseLimit,
        })),
      });
      assert.equal(response.status, status);
    }, Date.parse("2027-01-27T18:00:00.000Z"));
  }
});

test("One-Stock Challenge scores reject multiple, short, or unverified holdings", async () => {
  const oneStockEvent = expectedEventArenaConfiguration("2027-02-08");
  assert.ok(oneStockEvent);
  const invalidHoldings = [
    [
      { symbol: "AAPL", companyName: "Apple", allocationPercent: 10, marketValue: 10_000, assetType: "stock", side: "long" },
      { symbol: "VOO", companyName: "Vanguard S&P 500 ETF", allocationPercent: 10, marketValue: 10_000, assetType: "etf", side: "long" },
    ],
    [{ symbol: "AAPL", companyName: "Apple", allocationPercent: 10, marketValue: 10_000, assetType: "stock", side: "short" }],
    [{ symbol: "AAPL", companyName: "Apple", allocationPercent: 10, marketValue: 10_000, assetType: "unknown", side: "long" }],
  ];
  let scoreWrites = 0;
  await withApi(async (sql) => {
    if (sql.startsWith("DELETE") || ["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [] };
    if (sql.startsWith("SELECT installation_id")) return { rows: [] };
    if (sql.startsWith("INSERT INTO event_arena_leaderboard_entries")) scoreWrites += 1;
    return { rows: [{ updated_at: new Date("2027-02-10T17:00:00.000Z") }] };
  }, async (baseUrl) => {
    for (const holdings of invalidHoldings) {
      const response = await fetch(`${baseUrl}/event-arena/${oneStockEvent.eventId}/leaderboard`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validSubmission({
          eventStartAtMs: oneStockEvent.startAtMs,
          eventEndAtMs: oneStockEvent.endAtMs,
          holdings,
        })),
      });
      assert.equal(response.status, 400);
    }
  }, Date.parse("2027-02-10T17:00:00.000Z"));
  assert.equal(scoreWrites, 0, "invalid One-Stock Challenge summaries must not reach score persistence");
});

test("accepted score submissions store ranked event snapshots without private identity", async () => {
  const insertedSnapshotValues: unknown[][] = [];
  await withApi(async (sql, values) => {
    if (sql.startsWith("DELETE")) return { rows: [] };
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [] };
    if (sql.startsWith("SELECT installation_id\n")) return { rows: [] };
    if (sql.startsWith("INSERT INTO event_arena_leaderboard_entries")) {
      return { rows: [{ updated_at: new Date("2026-11-18T17:00:00.000Z") }] };
    }
    if (sql.includes("SELECT installation_id, participant_token, alias")) {
      return { rows: [
        {
          installation_id: installationId,
          participant_token: "participant-token-marketfox",
          alias: "MarketFox",
          start_equity: 100_000,
          equity: 101_000,
          updated_at: new Date("2026-11-18T17:00:00.000Z"),
        },
        {
          installation_id: "another-private-installation",
          participant_token: "participant-token-bluewhale",
          alias: "BlueWhale",
          start_equity: 100_000,
          equity: 105_000,
          updated_at: new Date("2026-11-18T16:59:00.000Z"),
        },
      ] };
    }
    assert.match(sql, /INSERT INTO event_arena_leaderboard_snapshots/);
    assert.match(sql, /UNNEST\(\$2::text\[\], \$3::integer\[\], \$4::double precision\[\]\)/);
    assert.match(sql, /LEFT JOIN LATERAL/);
    assert.match(sql, /previous\.rank IS DISTINCT FROM snapshot\.rank/);
    insertedSnapshotValues.push(values ?? []);
    return { rows: [] };
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/event-arena/${eventId}/leaderboard`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validSubmission()),
    });
    assert.equal(response.status, 200);
  });
  assert.equal(insertedSnapshotValues.length, 1);
  assert.deepEqual(insertedSnapshotValues[0]?.[1], [
    "participant-token-bluewhale",
    "participant-token-marketfox",
  ]);
  assert.deepEqual(insertedSnapshotValues[0]?.[2], [1, 2]);
  assert.deepEqual(insertedSnapshotValues[0]?.[3], [5, 1]);
  assert.equal(JSON.stringify(insertedSnapshotValues).includes(installationId), false);
  assert.equal(JSON.stringify(insertedSnapshotValues).includes("another-private-installation"), false);
});

test("Lightning Round score submissions save sampled ranks for opted-in participants", async () => {
  const lightningEvent = expectedEventArenaConfiguration("lightning-2026-11-27");
  assert.ok(lightningEvent);
  const submittedAt = lightningEvent.startAtMs + 30 * 60_000;
  const snapshotValues: unknown[][] = [];
  const participantRows = [
    {
      installation_id: installationId,
      participant_token: "participant-token-lr-current",
      alias: "MarketFox",
      start_equity: 100_000,
      equity: 100_020,
      return_percent: 0.02,
      trade_count: 1,
      holdings: [],
      updated_at: new Date(submittedAt),
    },
    {
      installation_id: "another-lightning-installation",
      participant_token: "participant-token-lr-runner-up",
      alias: "BlueWhale",
      start_equity: 100_000,
      equity: 100_010,
      return_percent: 0.01,
      trade_count: 2,
      holdings: [],
      updated_at: new Date(submittedAt - 60_000),
    },
  ];
  await withApi(async (sql, values) => {
    if (sql.startsWith("DELETE") || ["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) {
      return { rows: [] };
    }
    if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
    if (sql.startsWith("SELECT installation_id\n")) return { rows: [] };
    if (sql.includes("SELECT status,failure_reason,account_id FROM event_arena_lightning_participants")) {
      return { rows: [{ status: "entered", account_id: "paper-event:shared" }] };
    }
    if (sql.includes("FROM paper_transactions")
      && sql.includes("lightning_round_event_id=$3")) {
      assert.match(sql, /date >= TO_TIMESTAMP\(\$4 \/ 1000\.0\)/);
      return {
        rows: [{
          symbol: "AAPL",
          company_name: "Apple Inc.",
          action: "BUY",
          shares: 2,
          price: 100,
          total: 200,
          fee: 0,
          date: new Date(lightningEvent.startAtMs + 1000),
        }],
      };
    }
    if (sql.startsWith("INSERT INTO event_arena_leaderboard_entries")) {
      assert.equal(values?.[0], lightningEvent.eventId);
      assert.equal(values?.[3], 100_000);
      assert.equal(values?.[4], 100_020);
      assert.equal(values?.[5], 0.02);
      assert.equal(values?.[6], 1);
      return { rows: [{ updated_at: new Date(submittedAt) }] };
    }
    if (sql.startsWith("UPDATE event_arena_lightning_participants")
      && sql.includes("leaderboard_opted_in=TRUE")) return { rows: [] };
    if (sql.includes("SELECT installation_id, participant_token, alias")) {
      assert.match(sql, /participant\.status='entered'/);
      assert.deepEqual(values, [lightningEvent.eventId, lightningEvent.startAtMs, lightningEvent.endAtMs]);
      return { rows: participantRows };
    }
    if (sql.startsWith("INSERT INTO event_arena_leaderboard_snapshots")) {
      assert.match(sql, /previous\.rank IS DISTINCT FROM snapshot\.rank/);
      snapshotValues.push(values ?? []);
      return { rows: [] };
    }
    assert.fail(`Unexpected Lightning Round score query: ${sql}`);
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/event-arena/${lightningEvent.eventId}/leaderboard`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validSubmission({
        eventType: "lightning-round",
        artworkId: "lightning-round-arena",
        startingBalance: 100_000,
        rankingDirection: "highest-return",
        cashBalance: 110_000,
        startEquity: 100_000,
        equity: 110_000,
        returnPercent: 10,
        eventStartAtMs: lightningEvent.startAtMs,
        eventEndAtMs: lightningEvent.endAtMs,
      })),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      updatedAt: new Date(submittedAt).toISOString(),
    });
  }, submittedAt, new Map(), async () => 110);

  assert.equal(snapshotValues.length, 1);
  assert.deepEqual(snapshotValues[0]?.[1], [
    "participant-token-lr-current",
    "participant-token-lr-runner-up",
  ]);
  assert.deepEqual(snapshotValues[0]?.[2], [1, 2]);
  assert.deepEqual(snapshotValues[0]?.[3], [0.02, 0.01]);
});

test("Lightning Round leaderboard rejects participants without a successful opening fill", async () => {
  const lightningEvent = expectedEventArenaConfiguration("lightning-2026-11-27");
  assert.ok(lightningEvent);
  await withApi(async (sql) => {
    if (sql.includes("SELECT status,failure_reason,account_id FROM event_arena_lightning_participants")) {
      return { rows: [{ status: "rejected", failure_reason: "No valid market price was available." }] };
    }
    throw new Error(`Unexpected query for a participant who did not enter: ${sql}`);
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/event-arena/${lightningEvent.eventId}/leaderboard`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validSubmission({
        eventType: "lightning-round",
        artworkId: "lightning-round-arena",
        eventStartAtMs: lightningEvent.startAtMs,
        eventEndAtMs: lightningEvent.endAtMs,
      })),
    });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: "No valid market price was available." });
  }, lightningEvent.startAtMs + 1, new Map(), async () => 110);
});

test("active Lightning Round orders fill against the server account and get event tags", async () => {
  const lightningEvent = expectedEventArenaConfiguration("lightning-2026-11-27");
  assert.ok(lightningEvent);
  const accountId = "paper-event:shared";
  const statements: Array<{ sql: string; values: any[] }> = [];
  let priceCalls = 0;
  await withApi(async (sql, values = []) => {
    statements.push({ sql, values });
    if (sql.includes("FROM event_arena_lightning_participants")
      && sql.includes("WHERE event_id=$1 AND installation_id=$2 FOR UPDATE")) {
      return {
        rows: [{
          event_id: lightningEvent.eventId,
          installation_id: installationId,
          account_id: accountId,
          status: "entered",
          event_start_at: new Date(lightningEvent.startAtMs),
          event_end_at: new Date(lightningEvent.endAtMs),
        }],
      };
    }
    if (sql.includes("FROM paper_accounts")) {
      return {
        rows: [{
          id: accountId,
          name: "Shared Event Arena",
          cash: 100_000,
          short_collateral: 0,
          short_collateral_ratio: 1.5,
          created_at: new Date(lightningEvent.startAtMs),
          unsettled_items: [],
          last_dividend_credit: null,
        }],
      };
    }
    return { rows: [] };
  }, async (baseUrl) => {
    const route = `${baseUrl}/event-arena/lightning-round/${lightningEvent.eventId}/orders`;
    const headers = {
      "content-type": "application/json",
      "x-event-arena-installation-id": installationId,
    };
    const response = await fetch(route, {
      method: "POST",
      headers,
      body: JSON.stringify({
        order: {
          id: "active-order-12345",
          accountId,
          symbol: "CACHEQ",
          companyName: "Cached Quote",
          orderType: "market",
          side: "buy",
          shares: 2,
        },
      }),
    });
    assert.equal(response.status, 200);
    const result = await response.json() as any;
    assert.equal(result.account.id, accountId);
    assert.equal(result.order.status, "filled");
    assert.equal(result.order.lightningRoundEventId, lightningEvent.eventId);
    assert.equal(result.transaction.id, "active-order-12345");
    assert.equal(result.transaction.lightningRoundEventId, lightningEvent.eventId);

    const limitResponse = await fetch(route, {
      method: "POST",
      headers,
      body: JSON.stringify({
        order: {
          id: "active-limit-12345",
          accountId,
          symbol: "CACHEQ",
          companyName: "Cached Quote",
          orderType: "limit",
          side: "buy",
          shares: 1,
          limitPrice: 101,
        },
      }),
    });
    assert.equal(limitResponse.status, 200);
    const limitResult = await limitResponse.json() as any;
    assert.equal(limitResult.order.orderType, "limit");
    assert.equal(limitResult.order.limitPrice, 101);
    assert.equal(limitResult.transaction.lightningRoundEventId, lightningEvent.eventId);
    assert.deepEqual(limitResult.quoteFallback, {
      observedAt: new Date(lightningEvent.startAtMs + 1).toISOString(),
      maxAgeSeconds: 300,
    });

    const wrongAccount = await fetch(route, {
      method: "POST",
      headers,
      body: JSON.stringify({
        order: {
          id: "active-order-67890",
          accountId: "some-other-account",
          symbol: "AAPL",
          companyName: "Apple",
          orderType: "market",
          side: "buy",
          shares: 2,
        },
      }),
    });
    assert.equal(wrongAccount.status, 422);
  }, lightningEvent.startAtMs + 1, new Map(), async () => {
    priceCalls += 1;
    if (priceCalls === 1) return 100;
    throw new Error("provider temporarily unavailable");
  });
  assert.equal(priceCalls, 2, "a mismatched account must be rejected before a price is fetched");
  const transactionWrite = statements.find((entry) => entry.sql.startsWith("INSERT INTO paper_transactions"));
  assert.equal(transactionWrite?.values[0], "active-order-12345");
  assert.equal(transactionWrite?.values[14], lightningEvent.eventId);
  assert.ok(statements.some((entry) => entry.sql.startsWith("UPDATE paper_accounts")));
});

test("Lightning Round preparation cannot forge fills and preserves server-tagged history", async () => {
  const lightningEvent = expectedEventArenaConfiguration("lightning-2026-11-27");
  assert.ok(lightningEvent);
  const currentTime = lightningEvent.startAtMs - 1;
  const statements: Array<{ sql: string; values: any[] }> = [];
  const accountId = "paper-event:shared";
  const payload = {
    alias: "MarketFox",
    account: {
      id: accountId,
      name: "Shared Event Arena",
      cash: 100_000,
      createdAt: new Date(currentTime).toISOString(),
    },
    positions: [],
    transactions: [
      {
        id: "ordinary-trade", accountId, symbol: "MSFT", companyName: "Microsoft",
        action: "BUY", shares: 1, price: 100, total: 100,
        date: new Date(currentTime).toISOString(),
      },
      {
        id: "event-dividend", accountId, symbol: "MSFT", companyName: "Microsoft",
        action: "DIVIDEND", shares: 0, price: 0, total: 1,
        date: new Date(currentTime).toISOString(),
      },
      {
        id: "forged-lightning-trade", accountId, symbol: "AAPL", companyName: "Apple",
        action: "BUY", shares: 50, price: 100, total: 5_000,
        date: new Date(currentTime).toISOString(), lightningRoundEventId: lightningEvent.eventId,
      },
    ],
    orders: [
      {
        id: "current-queue", accountId, symbol: "AAPL", companyName: "Apple",
        orderType: "market", side: "buy", shares: 2, status: "pending",
        placedAt: new Date(currentTime).toISOString(), lightningRoundEventId: lightningEvent.eventId,
      },
      {
        id: "previous-round-fill", accountId, symbol: "MSFT", companyName: "Microsoft",
        orderType: "market", side: "buy", shares: 1, status: "filled",
        placedAt: new Date(currentTime - 1000).toISOString(), lightningRoundEventId: "prior-lightning-round",
      },
    ],
    lots: [],
  };
  await withApi(async (sql, values = []) => {
    statements.push({ sql, values });
    return { rows: [] };
  }, async (baseUrl) => {
    const route = `${baseUrl}/event-arena/lightning-round/${lightningEvent.eventId}/state`;
    const headers = {
      "content-type": "application/json",
      "x-event-arena-installation-id": installationId,
    };
    const forgedFill = await fetch(route, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        ...payload,
        orders: payload.orders.map((order) =>
          order.id === "current-queue" ? { ...order, status: "filled", filledPrice: 100 } : order,
        ),
      }),
    });
    assert.equal(forgedFill.status, 400);

    const invalidTransaction = await fetch(route, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        ...payload,
        transactions: payload.transactions.map((transaction) =>
          transaction.id === "ordinary-trade" ? { ...transaction, action: "UNKNOWN" } : transaction,
        ),
      }),
    });
    assert.equal(invalidTransaction.status, 400);

    const response = await fetch(route, { method: "PUT", headers, body: JSON.stringify(payload) });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, eventId: lightningEvent.eventId, accountId });
  }, currentTime);
  const transactionDelete = statements.find((item) => item.sql.startsWith("DELETE FROM paper_transactions"));
  assert.match(transactionDelete?.sql ?? "", /lightning_round_event_id IS NULL/);
  assert.match(transactionDelete?.sql ?? "", /lightning_round_event_id=\$3/);
  assert.equal(transactionDelete?.values[2], lightningEvent.eventId);
  const transactionInserts = statements.filter((item) => item.sql.startsWith("INSERT INTO paper_transactions"));
  assert.equal(transactionInserts.length, 2);
  assert.equal(transactionInserts[0]?.values[0], "ordinary-trade");
  assert.equal(transactionInserts[1]?.values[0], "event-dividend");
  assert.equal(transactionInserts[1]?.values[5], "DIVIDEND");
  assert.equal(transactionInserts[0]?.values[14], null);
  assert.ok(statements.some((item) =>
    item.sql.startsWith("DELETE FROM paper_orders")
      && item.sql.includes("lightning_round_event_id IS NULL"),
  ));
  assert.ok(statements.some((item) =>
    item.sql.startsWith("DELETE FROM paper_orders")
      && item.values[2] === lightningEvent.eventId,
  ));
  const insertedOrders = statements.filter((item) => item.sql.startsWith("INSERT INTO paper_orders"));
  assert.deepEqual(insertedOrders.map((item) => item.values[0]), ["current-queue"]);
});

test("Lightning Round state returns the immutable server-finalized archive data", async () => {
  const lightningEvent = expectedEventArenaConfiguration("lightning-2026-11-27");
  assert.ok(lightningEvent);
  const finalResult = {
    eventId: lightningEvent.eventId,
    equity: 100_020,
    completedAtMs: lightningEvent.endAtMs,
    finalRank: 2,
    tradingFingerprintObservation: {
      version: 1,
      observationId: "positive-trade-consistency",
      headline: "Your results came from consistency",
      supportingSentence: "3 of 3 trades with reported realized results were profitable (100%).",
      score: 87.5,
      scoreParts: { magnitude: 1, uniqueness: 1, reliability: 0.375 },
      evidence: { positiveTradeCount: 3, realizedTradeCount: 3, positiveTradeSharePercent: 100 },
    },
    finalPrices: { AAPL: 110 },
    finalPositions: [{
      symbol: "AAPL",
      companyName: "Apple",
      shares: 2,
      avgCost: 100,
      marketPrice: 110,
      marketValue: 220,
      unrealizedPnL: 20,
    }],
  };
  await withApi(async (sql) => {
    if (sql.includes("SELECT event_id,installation_id,account_id,alias,status,failure_reason,final_result")) {
      return {
        rows: [{
          event_id: lightningEvent.eventId,
          installation_id: installationId,
          account_id: "paper-event:shared",
          alias: "MarketFox",
          status: "entered",
          failure_reason: null,
          final_result: finalResult,
        }],
      };
    }
    return { rows: [] };
  }, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/event-arena/lightning-round/${lightningEvent.eventId}/state`,
      { headers: { "x-event-arena-installation-id": installationId } },
    );
    assert.equal(response.status, 200);
    const payload = await response.json() as any;
    assert.deepEqual(payload.participant.finalResult, finalResult);
  }, lightningEvent.startAtMs + 1);
});

test("Lightning Round state hides results if the database returns another installation", async () => {
  const lightningEvent = expectedEventArenaConfiguration("lightning-2026-11-27");
  assert.ok(lightningEvent);
  let privateQueries = 0;
  await withApi(async (sql) => {
    if (sql.includes("SELECT event_id,installation_id,account_id,alias,status,failure_reason,final_result")) {
      return {
        rows: [{
          event_id: lightningEvent.eventId,
          installation_id: "different-installation-123456",
          account_id: "private-paper-account",
          alias: "PrivateAlias",
          status: "entered",
          failure_reason: null,
          final_result: {
            finalRank: 1,
            finalPrices: { AAPL: 999 },
          },
        }],
      };
    }
    privateQueries += 1;
    return { rows: [] };
  }, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/event-arena/lightning-round/${lightningEvent.eventId}/state`,
      { headers: { "x-event-arena-installation-id": installationId } },
    );
    assert.equal(response.status, 404);
    const payload = await response.json();
    assert.deepEqual(payload, { error: "Lightning Round participation was not found." });
    assert.equal(JSON.stringify(payload).includes("PrivateAlias"), false);
    assert.equal(JSON.stringify(payload).includes("999"), false);
  }, lightningEvent.startAtMs + 1);
  assert.equal(privateQueries, 0, "private account tables must not be queried for a mismatched participant");
});

test("Lightning Round unenrollment cancels only staged pending orders and preserves history", async () => {
  const lightningEvent = expectedEventArenaConfiguration("lightning-2026-11-27");
  assert.ok(lightningEvent);
  const statements: Array<{ sql: string; values?: unknown[] }> = [];
  const accountId = "paper-event:shared";
  const savedConfigurations = new Map([[lightningEvent.eventId, {
    event_id: lightningEvent.eventId,
    event_type: lightningEvent.eventType,
    artwork_id: lightningEvent.artworkId,
    starting_balance: lightningEvent.startingBalance,
    ranking_direction: lightningEvent.rankingDirection,
    purchase_limit: lightningEvent.purchaseLimit ?? null,
    event_start_at: new Date(lightningEvent.startAtMs),
    event_end_at: new Date(lightningEvent.endAtMs),
  }]]);
  await withApi(async (sql, values = []) => {
    statements.push({ sql, values });
    if (sql.includes("SELECT account_id FROM event_arena_lightning_participants")) {
      return { rows: [{ account_id: accountId }] };
    }
    return { rows: [] };
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/event-arena/lightning-round/${lightningEvent.eventId}/leave`, {
      method: "POST",
      headers: { "x-event-arena-installation-id": installationId },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, eventId: lightningEvent.eventId, removed: true });
  }, lightningEvent.startAtMs - 1, savedConfigurations);
  const cancelOrders = statements.find((item) => item.sql.startsWith("UPDATE paper_orders"));
  assert.match(cancelOrders?.sql ?? "", /status='cancelled'/);
  assert.match(cancelOrders?.sql ?? "", /status='pending'/);
  assert.deepEqual(cancelOrders?.values, [installationId, accountId, lightningEvent.eventId]);
  assert.ok(statements.some((item) => item.sql.startsWith("DELETE FROM event_arena_lightning_participants")));
  assert.equal(statements.some((item) => item.sql.startsWith("DELETE FROM paper_transactions")), false);
  assert.equal(statements.some((item) => item.sql.startsWith("DELETE FROM paper_positions")), false);

  await withApi(async () => {
    throw new Error("A closed registration must not mutate data.");
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/event-arena/lightning-round/${lightningEvent.eventId}/leave`, {
      method: "POST",
      headers: { "x-event-arena-installation-id": installationId },
    });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: "Lightning Round registration is closed." });
  }, lightningEvent.startAtMs, savedConfigurations);
});

test(
  "database-backed event history records, retrieves, and removes a participant's rank snapshots",
  { skip: !databaseUrl && "DATABASE_URL is not configured" },
  async () => {
    assert.ok(databaseUrl);
    const pool = new Pool({ connectionString: databaseUrl });
    const eventSequenceIndex = 100 + Number.parseInt(randomUUID().slice(0, 8), 16) % 10_000;
    const historyEventId = new Date(
      Date.parse("2026-11-16T00:00:00.000Z") + eventSequenceIndex * 14 * 86_400_000,
    ).toISOString().slice(0, 10);
    const historyConfiguration = expectedEventArenaConfiguration(historyEventId);
    assert.ok(historyConfiguration);
    const historyStartAtMs = historyConfiguration.startAtMs;
    const historyEndAtMs = historyConfiguration.endAtMs;
    const historyInstallationId = `history-installation-${randomUUID()}`;
    try {
      await ensureEventArenaTables(pool);
      await withApi(pool, async (baseUrl) => {
        const submission = await fetch(`${baseUrl}/event-arena/${historyEventId}/leaderboard`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(validSubmission({
            installationId: historyInstallationId,
            eventStartAtMs: historyStartAtMs,
            eventEndAtMs: historyEndAtMs,
            startEquity: historyConfiguration.startingBalance,
            equity: historyConfiguration.startingBalance * 1.0125,
            returnPercent: 1.25,
            cashBalance: historyConfiguration.startingBalance,
            holdings: [{
              symbol: "AAPL",
              companyName: "Apple Inc.",
              allocationPercent: 12.5,
              marketValue: 12_500,
              assetType: "stock",
              side: "long",
            }],
          })),
        });
        assert.equal(submission.status, 200, await submission.text());

        const historyUrl = `${baseUrl}/event-arena/${historyEventId}/leaderboard/history`;
        const headers = { "x-event-arena-installation-id": historyInstallationId };
        const historyResponse = await fetch(historyUrl, { headers });
        assert.equal(historyResponse.status, 200);
        const history = await historyResponse.json() as any;
        assert.equal(history.snapshots.length, 1);
        assert.equal(history.snapshots[0].rank, 1);
        assert.equal(history.snapshots[0].returnPercent, 1.25);
        assert.equal(JSON.stringify(history).includes(historyInstallationId), false);

        const { rows: participantRows } = await pool.query(
          "SELECT participant_token FROM event_arena_leaderboard_entries WHERE event_id=$1 AND installation_id=$2",
          [historyEventId, historyInstallationId],
        );
        assert.equal(participantRows.length, 1);
        await pool.query("DELETE FROM event_arena_leaderboard_snapshots WHERE event_id=$1", [historyEventId]);
        await pool.query(
          `INSERT INTO event_arena_leaderboard_snapshots
             (event_id, participant_token, event_start_at, event_end_at, captured_at, rank, return_percent)
           SELECT $1, $2, $3, $4,
             TO_TIMESTAMP($5 / 1000.0) + (sample.minute_offset * INTERVAL '1 minute'),
             sample.minute_offset + 1, sample.minute_offset
           FROM generate_series(0, 139) AS sample(minute_offset)`,
          [
            historyEventId,
            participantRows[0].participant_token,
            new Date(historyStartAtMs),
            new Date(historyEndAtMs),
            historyStartAtMs,
          ],
        );
        const longHistoryResponse = await fetch(historyUrl, { headers });
        assert.equal(longHistoryResponse.status, 200);
        const longHistory = await longHistoryResponse.json() as any;
        assert.equal(longHistory.snapshots.length, 120);
        assert.equal(longHistory.snapshots[0].capturedAt, new Date(historyStartAtMs).toISOString());
        assert.equal(longHistory.snapshots[0].rank, 1);
        assert.equal(longHistory.snapshots.at(-1).capturedAt, new Date(historyStartAtMs + 139 * 60_000).toISOString());
        assert.equal(longHistory.snapshots.at(-1).rank, 140);
        assert.deepEqual(Object.keys(longHistory.snapshots[0]).sort(), ["capturedAt", "rank", "returnPercent"]);
        assert.equal(JSON.stringify(longHistory).includes(historyInstallationId), false);

        const optOut = await fetch(
          `${baseUrl}/event-arena/${historyEventId}/leaderboard?installationId=${encodeURIComponent(historyInstallationId)}`,
          { method: "DELETE" },
        );
        assert.equal(optOut.status, 200);
        const afterOptOut = await fetch(historyUrl, { headers });
        assert.equal(afterOptOut.status, 200);
        assert.deepEqual(await afterOptOut.json(), { snapshots: [] });
      }, historyStartAtMs + 60 * 60 * 1000);
    } finally {
      await pool.query(
        "DELETE FROM event_arena_leaderboard_snapshots WHERE event_id=$1",
        [historyEventId],
      );
      await pool.query(
        "DELETE FROM event_arena_leaderboard_entries WHERE event_id=$1",
        [historyEventId],
      );
      await pool.query("DELETE FROM event_arena_events WHERE event_id=$1", [historyEventId]);
      await pool.end();
    }
  },
);

test("public history is scoped to the requested event and excludes installation and account identifiers", async () => {
  await withApi(async (sql, values) => {
    if (sql.startsWith("DELETE")) return { rows: [] };
    assert.match(sql, /JOIN event_arena_leaderboard_entries AS participant/);
    assert.match(sql, /participant\.installation_id=\$2/);
    assert.match(sql, /participant\.is_active=TRUE/);
    assert.match(sql, /snapshots\.event_id=\$1/);
    assert.match(sql, /NTILE\(119\)/);
    assert.match(sql, /ROW_NUMBER\(\) OVER \(ORDER BY snapshots\.captured_at, snapshots\.snapshot_id\) AS position_from_start/);
    assert.match(sql, /ROW_NUMBER\(\) OVER \(ORDER BY snapshots\.captured_at DESC, snapshots\.snapshot_id DESC\) AS position_from_end/);
    assert.match(sql, /WHERE position_from_start=1 OR position_from_end=1/);
    assert.match(sql, /UNION/);
    assert.match(sql, /ORDER BY captured_at, snapshot_id/);
    assert.deepEqual(values, [eventId, installationId, startAtMs, endAtMs, 30]);
    return { rows: [
      {
        captured_at: new Date("2026-11-16T15:00:00.000Z"),
        rank: 4,
        return_percent: 0.25,
        installation_id: "private-installation",
        account_id: "private-account",
      },
      {
        captured_at: new Date("2026-11-18T17:00:00.000Z"),
        rank: 2,
        return_percent: 1.75,
        installation_id: "private-installation",
        account_id: "private-account",
      },
    ] };
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/event-arena/${eventId}/leaderboard/history`, {
      headers: { "x-event-arena-installation-id": installationId },
    });
    assert.equal(response.status, 200);
    const body = await response.json() as unknown;
    assert.deepEqual(body, {
      snapshots: [
        { capturedAt: "2026-11-16T15:00:00.000Z", rank: 4, returnPercent: 0.25 },
        { capturedAt: "2026-11-18T17:00:00.000Z", rank: 2, returnPercent: 1.75 },
      ],
    });
    assert.equal(JSON.stringify(body).includes("private-installation"), false);
    assert.equal(JSON.stringify(body).includes("private-account"), false);
  });
});

test("Lightning Round history returns only the opted-in participant's sampled points", async () => {
  const lightningEvent = expectedEventArenaConfiguration("lightning-2026-11-27");
  assert.ok(lightningEvent);
  const capturedAt = new Date(lightningEvent.startAtMs + 15 * 60_000);
  await withApi(async (sql, values) => {
    if (sql.startsWith("DELETE")) return { rows: [] };
    assert.match(sql, /lightning_participant\.leaderboard_opted_in=TRUE/);
    assert.match(sql, /lightning_participant\.status='entered'/);
    assert.match(sql, /participant\.installation_id=\$2/);
    assert.deepEqual(values, [
      lightningEvent.eventId,
      installationId,
      lightningEvent.startAtMs,
      lightningEvent.endAtMs,
      30,
    ]);
    return { rows: [{ captured_at: capturedAt, rank: 3, return_percent: 1.75 }] };
  }, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/event-arena/${lightningEvent.eventId}/leaderboard/history`,
      { headers: { "x-event-arena-installation-id": installationId } },
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      snapshots: [{
        capturedAt: capturedAt.toISOString(),
        rank: 3,
        returnPercent: 1.75,
      }],
    });
  }, lightningEvent.startAtMs + 60 * 60_000);
});

test("history rejects invalid event or anonymous identity before querying private snapshots", async () => {
  let queries = 0;
  await withApi(async () => {
    queries += 1;
    return { rows: [] };
  }, async (baseUrl) => {
    const missingIdentity = await fetch(`${baseUrl}/event-arena/${eventId}/leaderboard/history`);
    const invalidEvent = await fetch(
      `${baseUrl}/event-arena/2026-11-17/leaderboard/history`,
      { headers: { "x-event-arena-installation-id": installationId } },
    );
    assert.equal(missingIdentity.status, 400);
    assert.equal(invalidEvent.status, 400);
  });
  assert.equal(queries, 0);
});

test("submission accepts short direction and an explicitly unavailable allocation", async () => {
  const storedHoldings: unknown[] = [];
  await withApi(async (sql, values) => {
    if (sql.startsWith("DELETE")) return { rows: [] };
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [] };
    if (sql.startsWith("SELECT installation_id")) return { rows: [] };
    storedHoldings.push(JSON.parse(String(values?.[7])));
    return { rows: [{ updated_at: new Date("2026-11-18T17:00:00.000Z") }] };
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/event-arena/${eventId}/leaderboard`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validSubmission({
        holdings: [{ symbol: "AAPL", companyName: "Apple Inc.", allocationPercent: null, side: "short" }],
      })),
    });
    assert.equal(response.status, 200);
  });
  assert.deepEqual(storedHoldings, [[{
    symbol: "AAPL",
    companyName: "Apple Inc.",
    allocationPercent: null,
    side: "short",
  }]]);
});

test("queued Lightning registration is acknowledged without inventing a leaderboard score", async () => {
  const lightningEventId = "lightning-2026-11-27";
  const configuration = expectedEventArenaConfiguration(lightningEventId);
  assert.ok(configuration);
  const savedConfigurations = new Map([[lightningEventId, {
    event_id: lightningEventId,
    event_type: configuration.eventType,
    artwork_id: configuration.artworkId,
    starting_balance: configuration.startingBalance,
    ranking_direction: configuration.rankingDirection,
    purchase_limit: configuration.purchaseLimit ?? null,
    event_start_at: new Date(configuration.startAtMs),
    event_end_at: new Date(configuration.endAtMs),
  }]]);
  let registrationUpdated = false;
  await withApi(async (sql, values) => {
    if (sql.startsWith("DELETE")) return { rows: [] };
    if (sql.includes("SELECT status,failure_reason,account_id FROM event_arena_lightning_participants")) {
      return { rows: [{ status: "queued", failure_reason: null, account_id: "lightning-account" }] };
    }
    if (sql.includes("UPDATE event_arena_lightning_participants")) {
      assert.match(sql, /leaderboard_opted_in=TRUE/);
      assert.deepEqual(values, [lightningEventId, installationId, "MarketFox", Date.parse("2026-11-25T16:00:00.000Z")]);
      registrationUpdated = true;
      return { rows: [{ installation_id: installationId }] };
    }
    assert.doesNotMatch(sql, /FROM paper_transactions/);
    return { rows: [] };
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/event-arena/${lightningEventId}/leaderboard`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        installationId,
        alias: "MarketFox",
        eventType: configuration.eventType,
        artworkId: configuration.artworkId,
        startingBalance: configuration.startingBalance,
        rankingDirection: configuration.rankingDirection,
        cashBalance: configuration.startingBalance,
        appliedTransferIds: [],
        startEquity: configuration.startingBalance,
        equity: configuration.startingBalance,
        returnPercent: 0,
        tradeCount: 0,
        holdings: [],
        eventStartAtMs: configuration.startAtMs,
        eventEndAtMs: configuration.endAtMs,
      }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json() as any).ok, true);
  }, Date.parse("2026-11-25T16:00:00.000Z"), savedConfigurations);
  assert.equal(registrationUpdated, true);
});

test("Lightning leaderboard shows queued opted-in participants without exposing installation IDs", async () => {
  const lightningEventId = "lightning-2026-11-27";
  const configuration = expectedEventArenaConfiguration(lightningEventId);
  assert.ok(configuration);
  const savedConfigurations = new Map([[lightningEventId, {
    event_id: lightningEventId,
    event_type: configuration.eventType,
    artwork_id: configuration.artworkId,
    starting_balance: configuration.startingBalance,
    ranking_direction: configuration.rankingDirection,
    purchase_limit: configuration.purchaseLimit ?? null,
    event_start_at: new Date(configuration.startAtMs),
    event_end_at: new Date(configuration.endAtMs),
  }]]);
  await withApi(async (sql, values) => {
    if (sql.startsWith("DELETE")) return { rows: [] };
    if (sql.includes("SELECT participant.installation_id,participant.alias,participant.status")) {
      assert.match(sql, /leaderboard_opted_in=TRUE/);
      assert.match(sql, /status IN \('queued','entered'\)/);
      assert.doesNotMatch(sql, /NOT EXISTS[\s\S]*event_arena_leaderboard_entries/);
      assert.deepEqual(values, [lightningEventId, configuration.startAtMs, configuration.endAtMs]);
      return { rows: [{
        installation_id: installationId,
        alias: "MarketFox",
        status: "queued",
        updated_at: new Date("2026-11-25T15:00:00.000Z"),
      }] };
    }
    if (sql.includes("FROM event_arena_leaderboard_entries")) return { rows: [] };
    return { rows: [] };
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/event-arena/${lightningEventId}/leaderboard`, {
      headers: { "x-event-arena-installation-id": installationId },
    });
    assert.equal(response.status, 200);
    const result = await response.json() as any;
    assert.deepEqual(result.entries, []);
    assert.deepEqual(result.registrations, [{
      alias: "MarketFox",
      isCurrentUser: true,
      status: "queued",
      startEquity: 100_000,
      equity: 100_000,
      profitLoss: 0,
      returnPercent: 0,
      cashBalance: 100_000,
      tradeCount: 0,
      holdings: [],
      updatedAt: "2026-11-25T15:00:00.000Z",
    }]);
    assert.equal(JSON.stringify(result).includes(installationId), false);
  }, Date.parse("2026-11-25T16:00:00.000Z"), savedConfigurations);
});

test("Lightning leaderboard includes event-tagged account details for entered participants without ranked entries", async () => {
  const lightningEventId = "lightning-2026-11-27";
  const configuration = expectedEventArenaConfiguration(lightningEventId);
  assert.ok(configuration);
  const savedConfigurations = new Map([[lightningEventId, {
    event_id: lightningEventId,
    event_type: configuration.eventType,
    artwork_id: configuration.artworkId,
    starting_balance: configuration.startingBalance,
    ranking_direction: configuration.rankingDirection,
    purchase_limit: configuration.purchaseLimit ?? null,
    event_start_at: new Date(configuration.startAtMs),
    event_end_at: new Date(configuration.endAtMs),
  }]]);
  await withApi(async (sql, values) => {
    if (sql.startsWith("DELETE")) return { rows: [] };
    if (sql.includes("SELECT participant.installation_id,participant.alias,participant.status")) {
      assert.deepEqual(values, [lightningEventId, configuration.startAtMs, configuration.endAtMs]);
      return { rows: [{
          installation_id: installationId,
          alias: "MarketFox",
          status: "entered",
          updated_at: new Date("2026-11-27T14:33:00.000Z"),
      }] };
    }
    if (sql.includes("FROM paper_transactions")) {
      assert.match(sql, /lightning_round_event_id=\$1/);
      assert.match(sql, /participant\.account_id=trade\.account_id/);
      assert.deepEqual(values, [
        lightningEventId,
        [installationId],
        configuration.startAtMs,
        configuration.endAtMs,
      ]);
      return { rows: [{
        user_id: installationId,
        symbol: "AAPL",
        company_name: "Apple Inc.",
        action: "BUY",
        shares: 10,
        price: 100,
        total: 1_000,
        fee: 0,
        date: new Date("2026-11-27T14:31:00.000Z"),
        asset_type: "stock",
      }] };
    }
    if (sql.includes("FROM event_arena_leaderboard_entries")) return { rows: [] };
    return { rows: [] };
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/event-arena/${lightningEventId}/leaderboard`, {
      headers: { "x-event-arena-installation-id": installationId },
    });
    assert.equal(response.status, 200);
    const result = await response.json() as any;
    assert.deepEqual(result.entries, []);
    assert.deepEqual(result.registrations[0], {
      alias: "MarketFox",
      isCurrentUser: true,
      status: "entered",
      startEquity: 100_000,
      equity: 100_100,
      profitLoss: 100,
      returnPercent: 0.1,
      cashBalance: 99_000,
      tradeCount: 1,
      holdings: [{
        symbol: "AAPL",
        companyName: "Apple Inc.",
        allocationPercent: 1.098901098901099,
        side: "long",
        marketValue: 1_100,
        assetType: "stock",
      }],
      updatedAt: "2026-11-27T14:35:00.000Z",
    });
    assert.equal(JSON.stringify(result).includes(installationId), false);
  }, Date.parse("2026-11-27T14:35:00.000Z"), savedConfigurations, async (symbol) => {
    assert.equal(symbol, "AAPL");
    return 110;
  });
});

test("Lightning leaderboard refreshes ranked participants from server fills and current prices", async () => {
  const lightningEventId = "lightning-2026-11-27";
  const configuration = expectedEventArenaConfiguration(lightningEventId);
  assert.ok(configuration);
  const savedConfigurations = new Map([[lightningEventId, {
    event_id: lightningEventId,
    event_type: configuration.eventType,
    artwork_id: configuration.artworkId,
    starting_balance: configuration.startingBalance,
    ranking_direction: configuration.rankingDirection,
    purchase_limit: configuration.purchaseLimit ?? null,
    event_start_at: new Date(configuration.startAtMs),
    event_end_at: new Date(configuration.endAtMs),
  }]]);
  const participantIds = ["ryan-installation-12345", "prime-installation-12345"];
  let currentPrices: Record<string, number> = { SPXL: 120, AAPL: 110, NVDA: 120 };
  let currentTime = Date.parse("2026-11-27T14:35:00.000Z");
  await withApi(async (sql, values) => {
    if (sql.startsWith("DELETE")) return { rows: [] };
    if (sql.includes("FROM event_arena_leaderboard_entries")) {
      return { rows: [
        {
          installation_id: participantIds[0],
          participant_token: "ryan-public-token-123456",
          alias: "Ryan",
          start_equity: 100_000,
          equity: 100_042,
          cash_balance: 90_000,
          trade_count: 1,
          holdings: [],
          updated_at: new Date("2026-11-27T14:20:00.000Z"),
        },
        {
          installation_id: participantIds[1],
          participant_token: "prime-public-token-123456",
          alias: "Amazon Prime",
          start_equity: 100_000,
          equity: 99_578,
          cash_balance: 90_000,
          trade_count: 1,
          holdings: [{
            symbol: "SPXL",
            companyName: "Direxion Daily S&P 500 Bull 3X Shares",
            allocationPercent: 4.6,
            marketValue: 4_578,
            assetType: "etf",
            side: "long",
          }],
          updated_at: new Date("2026-11-27T14:20:00.000Z"),
        },
      ] };
    }
    if (sql.includes("SELECT participant.installation_id,participant.alias,participant.status")) {
      return { rows: participantIds.map((installation_id, index) => ({
        installation_id,
        alias: index === 0 ? "Ryan" : "Amazon Prime",
        status: "entered",
        updated_at: new Date("2026-11-27T14:44:00.000Z"),
      })) };
    }
    if (sql.includes("FROM paper_transactions")) {
      assert.deepEqual(values, [
        lightningEventId,
        participantIds,
        configuration.startAtMs,
        configuration.endAtMs,
      ]);
      assert.match(sql, /participant\.account_id=trade\.account_id/);
      return { rows: [
        {
          user_id: participantIds[0],
          symbol: "AAPL",
          company_name: "Apple Inc.",
          action: "BUY",
          shares: 10,
          price: 100,
          total: 1_000,
          fee: 0,
          date: new Date("2026-11-27T14:31:00.000Z"),
          asset_type: "stock",
        },
        {
          user_id: participantIds[1],
          symbol: "SPXL",
          company_name: "Direxion Daily S&P 500 Bull 3X Shares",
          action: "BUY",
          shares: 50,
          price: 100,
          total: 5_000,
          fee: 0,
          date: new Date("2026-11-27T14:31:00.000Z"),
          asset_type: "etf",
        },
        {
          user_id: participantIds[1],
          symbol: "SPXL",
          company_name: "Direxion Daily S&P 500 Bull 3X Shares",
          action: "SELL",
          shares: 50,
          price: 110,
          total: 5_500,
          fee: 0,
          date: new Date("2026-11-27T14:32:00.000Z"),
          asset_type: "etf",
        },
        {
          user_id: participantIds[1],
          symbol: "NVDA",
          company_name: "NVIDIA Corporation",
          action: "BUY",
          shares: 20,
          price: 100,
          total: 2_000,
          fee: 0,
          date: new Date("2026-11-27T14:33:00.000Z"),
          asset_type: "stock",
        },
      ] };
    }
    return { rows: [] };
  }, async (baseUrl) => {
    const readLeaderboard = async () => {
      const response = await fetch(`${baseUrl}/event-arena/${lightningEventId}/leaderboard`, {
        headers: { "x-event-arena-installation-id": participantIds[0] },
      });
      assert.equal(response.status, 200);
      return await response.json() as any;
    };
    const firstRefresh = await readLeaderboard();
    assert.deepEqual(firstRefresh.entries.map((entry: any) => [entry.rank, entry.alias, entry.returnPercent]), [
      [1, "Amazon Prime", 0.8999999999999999],
      [2, "Ryan", 0.1],
    ]);
    assert.equal(firstRefresh.entries[0].equity, 100_900);
    assert.equal(firstRefresh.entries[0].cashBalance, 98_500);
    assert.equal(firstRefresh.entries[0].tradeCount, 3);
    assert.deepEqual(firstRefresh.entries[0].holdings.map((holding: any) => [
      holding.symbol,
      holding.marketValue,
      holding.assetType,
    ]), [["NVDA", 2_400, "stock"]]);
    assert.equal(firstRefresh.entries[0].updatedAt, "2026-11-27T14:35:00.000Z");
    assert.equal(firstRefresh.entries[1].isCurrentUser, true);
    assert.deepEqual(firstRefresh.registrations, []);
    assert.equal(JSON.stringify(firstRefresh).includes(participantIds[0]), false);
    assert.equal(JSON.stringify(firstRefresh).includes(participantIds[1]), false);

    currentPrices = { SPXL: 80, AAPL: 130, NVDA: 50 };
    const secondRefresh = await readLeaderboard();
    assert.deepEqual(secondRefresh.entries.map((entry: any) => [entry.rank, entry.alias, entry.returnPercent]), [
      [1, "Ryan", 0.3],
      [2, "Amazon Prime", -0.5],
    ]);
    assert.equal(secondRefresh.entries[0].holdings[0].marketValue, 1_300);
    assert.deepEqual(secondRefresh.entries[1].holdings.map((holding: any) => [
      holding.symbol,
      holding.marketValue,
    ]), [["NVDA", 1_000]]);
    assert.equal(secondRefresh.entries[1].scoreSource, "server");

    currentPrices = { AAPL: 130 };
    currentTime = Date.parse("2026-11-27T14:41:00.000Z");
    const missingQuoteRefresh = await readLeaderboard();
    const missingScore = missingQuoteRefresh.entries.find((entry: any) => entry.alias === "Amazon Prime");
    assert.equal(missingScore.equity, 99_578);
    assert.equal(missingScore.scoreSource, "participant");
    assert.equal(missingScore.updatedAt, "2026-11-27T14:20:00.000Z");
    assert.deepEqual(missingQuoteRefresh.entries.map((entry: any) => [entry.rank, entry.alias]), [
      [1, "Ryan"],
      [2, "Amazon Prime"],
    ]);
    assert.equal(missingScore.cashBalance, 90_000);
    assert.equal(missingScore.holdings[0].symbol, "SPXL");
    assert.equal(missingScore.holdings[0].marketValue, 4_578);

    currentPrices = { SPXL: 120, AAPL: 130, NVDA: 120 };
    currentTime = Date.parse("2026-11-27T14:44:00.000Z");
    const recoveredRefresh = await readLeaderboard();
    assert.deepEqual(recoveredRefresh.entries.map((entry: any) => [entry.rank, entry.alias, entry.returnPercent]), [
      [1, "Amazon Prime", 0.8999999999999999],
      [2, "Ryan", 0.3],
    ]);
    const recoveredScore = recoveredRefresh.entries[0];
    assert.equal(recoveredScore.scoreSource, "server");
    assert.equal(recoveredScore.equity, 100_900);
    assert.equal(recoveredScore.cashBalance, 98_500);
    assert.equal(recoveredScore.tradeCount, 3);
    assert.deepEqual(recoveredScore.holdings.map((holding: any) => [
      holding.symbol,
      holding.marketValue,
      holding.assetType,
    ]), [["NVDA", 2_400, "stock"]]);
    assert.equal(recoveredScore.holdings.some((holding: any) => holding.symbol === "SPXL"), false);
  }, () => currentTime, savedConfigurations, async (symbol) =>
    currentPrices[symbol] ?? null,
  );
});

test("regular leaderboards revalue every participant from private event snapshots on each refresh", async () => {
  const rows = [
    {
      installation_id: "participant-alpha-123456",
      participant_token: "participant-token-alpha-123456",
      alias: "Alpha",
      start_equity: 100_000,
      equity: 99_000,
      cash_balance: 80_000,
      trade_count: 4,
      holdings: [],
      valuation_snapshot: {
        unsettledCash: 0,
        shortCollateral: 0,
        positions: [{ symbol: "ALPHA", companyName: "Alpha Co.", shares: 100, assetType: "stock", side: "long" }],
      },
      valuation_snapshot_updated_at: new Date("2026-11-18T16:00:00.000Z"),
      updated_at: new Date("2026-11-18T16:00:00.000Z"),
    },
    {
      installation_id: "participant-beta-123456",
      participant_token: "participant-token-beta-123456",
      alias: "Beta",
      start_equity: 100_000,
      equity: 101_000,
      cash_balance: 80_000,
      trade_count: 2,
      holdings: [],
      valuation_snapshot: {
        unsettledCash: 0,
        shortCollateral: 0,
        positions: [{ symbol: "BETA", companyName: "Beta Co.", shares: 100, assetType: "etf", side: "long" }],
      },
      valuation_snapshot_updated_at: new Date("2026-11-18T16:00:00.000Z"),
      updated_at: new Date("2026-11-18T16:00:00.000Z"),
    },
  ];
  const readLeaderboard = async (prices: Record<string, number>, nowMs: number) => {
    let responseBody: any;
    await withApi(async (sql) => {
      if (sql.startsWith("DELETE")) return { rows: [] };
      if (sql.includes("FROM event_arena_leaderboard_entries")) return { rows };
      return { rows: [] };
    }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/event-arena/${eventId}/leaderboard`);
      assert.equal(response.status, 200);
      responseBody = await response.json();
    }, nowMs, new Map(), async (symbol) => prices[symbol] ?? null);
    return responseBody;
  };

  const firstRefresh = await readLeaderboard(
    { ALPHA: 200, BETA: 100 },
    Date.parse("2026-11-18T17:00:00.000Z"),
  );
  assert.deepEqual(firstRefresh.entries.map((entry: any) => entry.alias), ["Alpha", "Beta"]);
  assert.equal(firstRefresh.entries[0].equity, 100_000);
  assert.equal(firstRefresh.entries[0].scoreSource, "server");
  assert.equal(firstRefresh.entries[0].holdings[0].marketValue, 20_000);
  assert.equal(firstRefresh.entries[0].holdings[0].allocationPercent, 20);
  assert.equal(firstRefresh.entries[0].updatedAt, "2026-11-18T16:00:00.000Z");
  assert.equal(JSON.stringify(firstRefresh).includes('"shares"'), false);
  assert.equal(JSON.stringify(firstRefresh).includes("valuation_snapshot"), false);

  const nextRefresh = await readLeaderboard(
    { ALPHA: 50, BETA: 200 },
    Date.parse("2026-11-18T17:02:00.000Z"),
  );
  assert.deepEqual(nextRefresh.entries.map((entry: any) => entry.alias), ["Beta", "Alpha"]);
  assert.equal(nextRefresh.entries[0].equity, 100_000);
  assert.equal(nextRefresh.entries[0].scoreSource, "server");

  const quoteUnavailable = await readLeaderboard(
    { ALPHA: 0, BETA: 200 },
    Date.parse("2026-11-18T17:10:00.000Z"),
  );
  const alphaFallback = quoteUnavailable.entries.find((entry: any) => entry.alias === "Alpha");
  assert.equal(alphaFallback.equity, 99_000);
  assert.equal(alphaFallback.scoreSource, "participant");
  assert.equal(alphaFallback.updatedAt, "2026-11-18T16:00:00.000Z");
});

test("leaderboard response is event-scoped and does not expose installation IDs or trade details", async () => {
  let queries = 0;
  await withApi(async (sql, values) => {
    queries += 1;
    if (sql.startsWith("DELETE")) return { rows: [] };
    assert.match(sql, /WHERE event_id=\$1[\s\S]*is_active=TRUE/);
    assert.match(sql, /event_start_at=TO_TIMESTAMP\(\$2 \/ 1000\.0\)/);
    assert.match(sql, /event_end_at=TO_TIMESTAMP\(\$3 \/ 1000\.0\)/);
    assert.match(sql, /event_end_at > NOW\(\) - \(\$4 \* INTERVAL '1 day'\)/);
    assert.deepEqual(values, [eventId, startAtMs, endAtMs, 30]);
    return { rows: [{
      installation_id: installationId,
      participant_token: "public-event-token-123456",
      alias: "MarketFox",
      start_equity: "100000",
      equity: "101250",
      cash_balance: "90000",
      return_percent: "-999",
      trade_count: "4",
      holdings: [{ symbol: "AAPL", companyName: "Apple Inc.", allocationPercent: 12.5, side: "short", shares: 3, price: 100, costBasis: 80 }],
      updated_at: new Date("2026-11-18T17:00:00.000Z"),
      transactions: ["must-not-leak"],
      account_name: "must-not-leak",
    }] };
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/event-arena/${eventId}/leaderboard`, {
      headers: { "x-event-arena-installation-id": installationId },
    });
    assert.equal(response.status, 200);
    const result = await response.json() as any;
    assert.deepEqual(Object.keys(result.entries[0]), ["rank", "alias", "participantToken", "startEquity", "equity", "profitLoss", "returnPercent", "tradeCount", "cashBalance", "holdings", "scoreSource", "updatedAt", "isCurrentUser"]);
    assert.equal(result.entries[0].participantToken, "public-event-token-123456");
    assert.equal(result.entries[0].returnPercent, 1.25);
    assert.equal(result.entries[0].profitLoss, 1_250);
    assert.equal(result.entries[0].tradeCount, 4);
    assert.equal(result.entries[0].cashBalance, 90_000);
    assert.equal(result.entries[0].isCurrentUser, true);
    assert.deepEqual(result.entries[0].holdings, [{ symbol: "AAPL", companyName: "Apple Inc.", allocationPercent: 12.5, marketValue: null, side: "short" }]);
    assert.equal(JSON.stringify(result).includes(installationId), false);
    assert.equal(JSON.stringify(result).includes("shares"), false);
    assert.equal(JSON.stringify(result).includes("costBasis"), false);
    assert.equal(JSON.stringify(result).includes('"price"'), false);
  });
  assert.equal(queries, 4);
});

test("leaderboard ranks positive, tied, and negative returns deterministically from submitted equity", async () => {
  const participant = (id: string, alias: string, startEquity: number, equity: number, updatedAt: string) => ({
    installation_id: id,
    alias,
    start_equity: startEquity,
    equity,
    return_percent: 999,
    trade_count: null,
    holdings: [],
    updated_at: new Date(updatedAt),
  });
  const rows = [
    participant("z-negative", "Loss", 100_000, 98_000, "2026-11-18T17:00:00.000Z"),
    participant("installation-id-b", "Beta", 100_000, 102_000, "2026-11-18T17:00:00.000Z"),
    participant("top", "Winner", 100_000, 105_000, "2026-11-18T17:00:00.000Z"),
    participant("installation-id-z", "Alpha", 100_000, 102_000, "2026-11-18T17:00:00.000Z"),
  ];
  await withApi(async (sql, values) => {
    if (sql.startsWith("DELETE")) return { rows: [] };
    assert.deepEqual(values, [eventId, startAtMs, endAtMs, 30]);
    return { rows };
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/event-arena/${eventId}/leaderboard`, {
      headers: { "x-event-arena-installation-id": "installation-id-z" },
    });
    assert.equal(response.status, 200);
    const result = await response.json() as any;
    assert.deepEqual(result.entries.map((entry: any) => [entry.rank, entry.alias, entry.returnPercent]), [
      [1, "Winner", 5],
      [2, "Alpha", 2],
      [3, "Beta", 2],
      [4, "Loss", -2],
    ]);
    assert.deepEqual(result.entries.map((entry: any) => entry.isCurrentUser), [false, true, false, false]);
    assert.ok(result.entries.every((entry: any) => entry.tradeCount === null));
    assert.equal(JSON.stringify(result).includes("installation-id-z"), false);
  });
});

test("empty event leaderboard returns a successful empty list", async () => {
  await withApi(async (sql) => sql.startsWith("DELETE") ? { rows: [] } : { rows: [] }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/event-arena/${eventId}/leaderboard`);
    assert.equal(response.status, 200);
    const result = await response.json() as any;
    assert.deepEqual(result.entries, []);
    assert.deepEqual(result.registrations, []);
  });
});

test("leaderboard database failures return a generic JSON error", async () => {
  await withApi(async (sql) => {
    if (sql.startsWith("DELETE")) return { rows: [] };
    throw new Error("<html>database internals</html>");
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/event-arena/${eventId}/leaderboard`);
    assert.equal(response.status, 500);
    assert.match(response.headers.get("content-type") ?? "", /application\/json/);
    const body = await response.json() as { error: string };
    assert.equal(body.error, "Could not load the Event Arena leaderboard.");
    assert.doesNotMatch(JSON.stringify(body), /html|database internals/i);
  });
});

test("archived and current event requests remain isolated by event ID and exact window", async () => {
  const currentId = "2026-11-30";
  const currentStart = Date.parse("2026-11-30T14:30:00.000Z");
  const currentEnd = Date.parse("2026-12-04T21:00:00.000Z");
  const seen: string[] = [];
  await withApi(async (sql, values) => {
    if (sql.startsWith("DELETE")) return { rows: [] };
    assert.match(sql, /event_id=\$1/);
    assert.match(sql, /is_active=TRUE/);
    seen.push(String(values?.[0]));
    const expectedTimes = values?.[0] === eventId
      ? [startAtMs, endAtMs]
      : [currentStart, currentEnd];
    assert.deepEqual(values, [values?.[0], ...expectedTimes, 30]);
    return {
      rows: [{
        installation_id: "archive-participant",
        alias: String(values?.[0]) === eventId ? "Archived" : "Current",
        start_equity: 100_000,
        equity: 100_500,
        trade_count: 1,
        holdings: [],
        updated_at: new Date("2026-11-25T17:00:00.000Z"),
      }],
    };
  }, async (baseUrl) => {
    const archived = await fetch(`${baseUrl}/event-arena/${eventId}/leaderboard`);
    const current = await fetch(`${baseUrl}/event-arena/${currentId}/leaderboard`);
    assert.equal((await archived.json() as any).entries[0].alias, "Archived");
    assert.equal((await current.json() as any).entries[0].alias, "Current");
  }, Date.parse("2026-11-25T17:00:00.000Z"));
  assert.deepEqual(seen, [eventId, currentId]);
});

test("completed-week discovery lists only valid ended weeks with active opt-ins", async () => {
  let queries = 0;
  await withApi(async (sql, values) => {
    queries += 1;
    if (sql.startsWith("DELETE")) return { rows: [] };
    assert.match(sql, /WHERE is_active=TRUE[\s\S]*event_end_at <= NOW\(\)[\s\S]*event_end_at > NOW\(\) - \(\$1 \* INTERVAL '1 day'\)/);
    assert.match(sql, /GROUP BY event_id/);
    assert.match(sql, /ORDER BY MAX\(event_end_at\) DESC/);
    assert.doesNotMatch(sql, /LIMIT/);
    assert.deepEqual(values, [30]);
    return { rows: [
      {
        event_id: "2026-11-16",
        start_at: new Date("2026-11-16T14:30:00.000Z"),
        end_at: new Date("2026-11-20T21:00:00.000Z"),
        participant_count: 2,
        installation_id: "must-not-leak",
      },
      {
        event_id: "2026-11-23",
        start_at: new Date("2026-11-23T14:30:00.000Z"),
        end_at: new Date("2026-11-27T21:00:00.000Z"),
        participant_count: 1,
      },
      {
        event_id: "2026-11-30",
        start_at: new Date("2026-11-30T14:30:00.000Z"),
        end_at: new Date("2026-12-04T21:00:00.000Z"),
        participant_count: 1,
      },
      {
        event_id: "2026-11-16",
        start_at: new Date("2026-11-16T14:31:00.000Z"),
        end_at: new Date("2026-11-20T21:00:00.000Z"),
        participant_count: 1,
      },
    ] };
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/event-arena/leaderboard-weeks`);
    assert.equal(response.status, 200);
    const result = await response.json() as any;
    assert.deepEqual(result.weeks, [{
      id: "2026-11-16",
      startAtMs: Date.parse("2026-11-16T14:30:00.000Z"),
      endAtMs: Date.parse("2026-11-20T21:00:00.000Z"),
      participantCount: 2,
    }]);
    assert.equal(JSON.stringify(result).includes("must-not-leak"), false);
  }, Date.parse("2026-11-25T17:00:00.000Z"));
  assert.equal(queries, 4);
});

test("completed-week discovery returns an empty list when nobody remains opted in", async () => {
  await withApi(async (sql) => sql.startsWith("DELETE") ? { rows: [] } : { rows: [] }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/event-arena/leaderboard-weeks`);
    assert.equal(response.status, 200);
    const result = await response.json() as any;
    assert.deepEqual(result.weeks, []);
  });
});

test("locked aliases return conflict; fast duplicate submissions are rate limited", async () => {
  let existingAlias = "MarketFox";
  await withApi(async (sql) => {
    if (sql.startsWith("DELETE")) return { rows: [] };
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [] };
    if (sql.startsWith("SELECT installation_id")) return { rows: [] };
    if (sql.startsWith("INSERT")) return { rows: [] };
    assert.match(sql, /event_end_at > NOW\(\) - \(\$3 \* INTERVAL '1 day'\)/);
    return { rows: [{ alias: existingAlias }] };
  }, async (baseUrl) => {
    let response = await fetch(`${baseUrl}/event-arena/${eventId}/leaderboard`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validSubmission({ alias: "NewAlias" })),
    });
    assert.equal(response.status, 409);

    existingAlias = "MarketFox";
    response = await fetch(`${baseUrl}/event-arena/${eventId}/leaderboard`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validSubmission()),
    });
    assert.equal(response.status, 429);
  });
});

test("opt-out clears public score data while retaining only the event-scoped alias lock", async () => {
  await withApi(async (sql, values) => {
    if (sql.includes("pg_advisory_xact_lock")) {
      assert.deepEqual(values, [eventId]);
      return { rows: [] };
    }
    if (
      sql.startsWith("DELETE FROM event_arena_leaderboard_snapshots")
      && sql.includes("WHERE event_id=$1 AND participant_token=$2")
    ) {
      assert.deepEqual(values, [eventId, "participant-token-marketfox"]);
      return { rows: [] };
    }
    if (sql.startsWith("DELETE")) return { rows: [] };
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [] };
    if (sql.startsWith("SELECT participant_token")) {
      assert.match(sql, /FOR UPDATE/);
      assert.deepEqual(values, [eventId, installationId]);
      return { rows: [{ participant_token: "participant-token-marketfox" }] };
    }
    if (sql.startsWith("UPDATE event_arena_lightning_participants")) {
      assert.match(sql, /SET leaderboard_opted_in=FALSE/);
      assert.deepEqual(values, [eventId, installationId]);
      return { rows: [] };
    }
    assert.match(sql, /^UPDATE event_arena_leaderboard_entries/);
    assert.match(sql, /SET is_active=FALSE/);
    assert.match(sql, /start_equity=0,[\s\S]*equity=0,[\s\S]*return_percent=0/);
    assert.match(sql, /trade_count=NULL/);
    assert.ok(sql.includes("holdings='[]'::jsonb"));
    assert.match(sql, /WHERE event_id=\$1 AND installation_id=\$2 AND is_active=TRUE$/);
    assert.deepEqual(values, [eventId, installationId]);
    return { rows: [] };
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/event-arena/${eventId}/leaderboard?installationId=${installationId}`, { method: "DELETE" });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  });
});

test("Lightning Round opt-out is saved even before a leaderboard score exists", async () => {
  const eventId = "lightning-2026-11-27";
  let savedOptOut = false;
  await withApi(async (sql, values) => {
    if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
    if (sql.startsWith("SELECT participant_token")) return { rows: [] };
    if (sql.startsWith("UPDATE event_arena_leaderboard_entries")) return { rows: [] };
    if (sql.startsWith("UPDATE event_arena_lightning_participants")) {
      assert.match(sql, /SET leaderboard_opted_in=FALSE/);
      assert.deepEqual(values, [eventId, installationId]);
      savedOptOut = true;
      return { rows: [] };
    }
    if (sql.startsWith("DELETE")) return { rows: [] };
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [] };
    throw new Error(`Unexpected query during Lightning Round opt-out: ${sql}`);
  }, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/event-arena/${eventId}/leaderboard?installationId=${installationId}`,
      { method: "DELETE" },
    );
    assert.equal(response.status, 200);
  });
  assert.equal(savedOptOut, true);
});

test("Event Arena reminder preferences can be enabled and disabled per installation", async () => {
  const saved: Array<{ installationId: unknown; enabled: unknown }> = [];
  await withApi(async (sql, values) => {
    assert.match(sql, /INSERT INTO event_arena_reminder_preferences/);
    assert.match(sql, /ON CONFLICT \(installation_id\) DO UPDATE/);
    saved.push({ installationId: values?.[0], enabled: values?.[1] });
    return { rows: [] };
  }, async (baseUrl) => {
    for (const enabled of [true, false]) {
      const response = await fetch(`${baseUrl}/event-arena/reminder-preference`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Event-Arena-Installation-Id": installationId,
        },
        body: JSON.stringify({ enabled }),
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { enabled });
    }
    const invalid = await fetch(`${baseUrl}/event-arena/reminder-preference`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Event-Arena-Installation-Id": installationId,
      },
      body: JSON.stringify({ enabled: "yes" }),
    });
    assert.equal(invalid.status, 400);
  });
  assert.deepEqual(saved, [
    { installationId, enabled: true },
    { installationId, enabled: false },
  ]);
});

test("Event Arena reminder preference reads distinguish unset from saved-off", async () => {
  let configured = false;
  let savedEnabled = false;
  await withApi(async (sql, values) => {
    assert.match(sql, /SELECT enabled/);
    assert.match(sql, /FROM event_arena_reminder_preferences/);
    assert.deepEqual(values, [installationId]);
    return { rows: configured ? [{ enabled: savedEnabled }] : [] };
  }, async (baseUrl) => {
    const headers = { "X-Event-Arena-Installation-Id": installationId };
    const unset = await fetch(`${baseUrl}/event-arena/reminder-preference`, { headers });
    assert.equal(unset.status, 200);
    assert.deepEqual(await unset.json(), { enabled: false, configured: false });

    configured = true;
    const savedOff = await fetch(`${baseUrl}/event-arena/reminder-preference`, { headers });
    assert.equal(savedOff.status, 200);
    assert.deepEqual(await savedOff.json(), { enabled: false, configured: true });

    savedEnabled = true;
    const savedOn = await fetch(`${baseUrl}/event-arena/reminder-preference`, { headers });
    assert.equal(savedOn.status, 200);
    assert.deepEqual(await savedOn.json(), { enabled: true, configured: true });

    const invalid = await fetch(`${baseUrl}/event-arena/reminder-preference`);
    assert.equal(invalid.status, 400);
  });
});

test("withdrawing from an upcoming Lightning Round removes its queued participant record", async () => {
  let removed = false;
  await withApi(async (sql, values) => {
    assert.match(sql, /DELETE FROM event_arena_lightning_participants/);
    assert.match(sql, /status='queued' AND event_start_at > NOW\(\)/);
    assert.deepEqual(values, ["lightning-2026-11-27", installationId]);
    removed = true;
    return { rows: [] };
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/event-arena/lightning-round/lightning-2026-11-27/participant`, {
      method: "DELETE",
      headers: { "X-Event-Arena-Installation-Id": installationId },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  });
  assert.equal(removed, true);
});
