import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import express from "express";
import pg from "pg";
import {
  createEventArenaRouter,
  isValidEventArenaWindow,
} from "./eventArenaRoutes.ts";
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
  return {
    installationId,
    alias: "MarketFox",
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
  currentTime = Date.parse("2026-11-18T17:00:00.000Z"),
) {
  const app = express();
  app.use(express.json());
  const db = typeof database === "function" ? { query: database } : database;
  app.use(createEventArenaRouter(db, (_req, _res, next) => next(), () => currentTime));
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
    CREATE TABLE IF NOT EXISTS event_arena_leaderboard_entries (
      event_id TEXT NOT NULL,
      installation_id TEXT NOT NULL,
      participant_token TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      alias TEXT NOT NULL,
      start_equity DOUBLE PRECISION NOT NULL,
      equity DOUBLE PRECISION NOT NULL,
      cash_balance DOUBLE PRECISION NOT NULL DEFAULT 100000,
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
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS event_arena_participant_token_idx
    ON event_arena_leaderboard_entries (event_id, participant_token)
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

function createTransferDatabase() {
  const participants = [
    { eventId, installationId, participantToken: "sender-participant-token-1", alias: "MarketFox", cashBalance: 1_000, active: true },
    { eventId, installationId: "recipient-installation-123", participantToken: "recipient-participant-token-1", alias: "BlueWhale", cashBalance: 500, active: true },
    { eventId: "2026-11-30", installationId: "recipient-installation-123", participantToken: "other-event-token-123456", alias: "BlueWhale", cashBalance: 700, active: true },
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
      for (const row of transfers) {
        if (row.eventId === values?.[0] && row.recipientInstallationId === values?.[1]) {
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

test("expired public entries and their alias locks are deleted after the retention period", async () => {
  let cleanupCalls = 0;
  await purgeExpiredEventArenaEntries({
    async query(sql, values) {
      cleanupCalls += 1;
      assert.match(sql, /^DELETE FROM event_arena_(leaderboard_entries|cash_transfers)/);
      assert.match(sql, /event_end_at <= NOW\(\) - \(\$1 \* INTERVAL '1 day'\)/);
      assert.deepEqual(values, [30]);
      assert.doesNotMatch(sql, /is_active/);
      assert.doesNotMatch(sql, /paper_accounts|paper_positions|paper_transactions/);
      return { rows: [] };
    },
  });
  assert.equal(EVENT_ARENA_RETENTION_DAYS, 30);
  assert.equal(cleanupCalls, 2);
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
  await withApi(async (sql, values) => {
    if (sql.startsWith("DELETE")) return { rows: [] };
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [] };
    if (sql.startsWith("SELECT installation_id")) return { rows: [] };
    assert.match(sql, /ON CONFLICT \(event_id, installation_id\)/);
    assert.match(sql, /updated_at <= NOW\(\) - INTERVAL '15 seconds'/);
    assert.match(sql, /event_start_at > NOW\(\)[\s\S]*alias = EXCLUDED\.alias/);
    assert.match(sql, /trade_count=EXCLUDED\.trade_count/);
    storedValues = values;
    return { rows: [{ alias: "MarketFox", start_equity: 100_000, equity: 101_250, return_percent: 1.25, trade_count: 3, holdings: [{ symbol: "AAPL", companyName: "Apple Inc.", allocationPercent: 12.5, side: "long" }], updated_at: new Date("2026-11-18T17:00:00.000Z") }] };
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/event-arena/${eventId}/leaderboard`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validSubmission()),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, updatedAt: "2026-11-18T17:00:00.000Z" });
  });
  assert.equal(storedValues?.[0], eventId);
  assert.equal(storedValues?.[1], installationId);
  assert.equal(storedValues?.[6], 3);
  assert.deepEqual(JSON.parse(storedValues?.[7]), [{ symbol: "AAPL", companyName: "Apple Inc.", allocationPercent: 12.5, side: "long" }]);
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
    assert.deepEqual(Object.keys(result.entries[0]), ["rank", "alias", "participantToken", "startEquity", "equity", "profitLoss", "returnPercent", "tradeCount", "holdings", "updatedAt", "isCurrentUser"]);
    assert.equal(result.entries[0].participantToken, "public-event-token-123456");
    assert.equal(result.entries[0].returnPercent, 1.25);
    assert.equal(result.entries[0].profitLoss, 1_250);
    assert.equal(result.entries[0].tradeCount, 4);
    assert.equal(result.entries[0].isCurrentUser, true);
    assert.deepEqual(result.entries[0].holdings, [{ symbol: "AAPL", companyName: "Apple Inc.", allocationPercent: 12.5, side: "short" }]);
    assert.equal(JSON.stringify(result).includes(installationId), false);
    assert.equal(JSON.stringify(result).includes("shares"), false);
    assert.equal(JSON.stringify(result).includes("costBasis"), false);
    assert.equal(JSON.stringify(result).includes('"price"'), false);
  });
  assert.equal(queries, 3);
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
    assert.deepEqual((await response.json() as any).entries, []);
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
  assert.equal(queries, 3);
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
    if (sql.startsWith("DELETE")) return { rows: [] };
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
