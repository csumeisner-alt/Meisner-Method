import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import express from "express";
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

function validSubmission(overrides: Record<string, unknown> = {}) {
  return {
    installationId,
    alias: "MarketFox",
    startEquity: 100_000,
    equity: 101_250,
    returnPercent: 1.25,
    holdings: [{ symbol: "AAPL", companyName: "Apple Inc." }],
    eventStartAtMs: startAtMs,
    eventEndAtMs: endAtMs,
    ...overrides,
  };
}

async function withApi(
  query: (sql: string, values?: any[]) => Promise<{ rows: any[] }>,
  run: (baseUrl: string) => Promise<void>,
  currentTime = Date.parse("2026-11-18T17:00:00.000Z"),
) {
  const app = express();
  app.use(express.json());
  app.use(createEventArenaRouter({ query }, (_req, _res, next) => next(), () => currentTime));
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

test("only scheduled biweekly windows and exact Eastern market hours are accepted", () => {
  assert.equal(isValidEventArenaWindow(eventId, startAtMs, endAtMs), true);
  assert.equal(isValidEventArenaWindow(eventId, startAtMs + 60_000, endAtMs), false);
  assert.equal(isValidEventArenaWindow("2026-11-23", startAtMs, endAtMs), false);
  assert.equal(isValidEventArenaWindow("2026-11-16", Number.NaN, endAtMs), false);
});

test("expired public entries and their alias locks are deleted after the retention period", async () => {
  let cleanupCalls = 0;
  await purgeExpiredEventArenaEntries({
    async query(sql, values) {
      cleanupCalls += 1;
      assert.match(sql, /^DELETE FROM event_arena_leaderboard_entries/);
      assert.match(sql, /event_end_at <= NOW\(\) - \(\$1 \* INTERVAL '1 day'\)/);
      assert.deepEqual(values, [30]);
      assert.doesNotMatch(sql, /is_active/);
      assert.doesNotMatch(sql, /paper_accounts|paper_positions|paper_transactions/);
      return { rows: [] };
    },
  });
  assert.equal(EVENT_ARENA_RETENTION_DAYS, 30);
  assert.equal(cleanupCalls, 1);
});

test("submission rejects private fields, inconsistent scores, malformed holdings, and oversized payloads", async () => {
  for (const payload of [
    validSubmission({ transactions: [] }),
    validSubmission({ returnPercent: 99 }),
    validSubmission({ holdings: [{ symbol: "AAPL", companyName: "Apple", shares: 1 }] }),
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

test("valid anonymous submission stores only event-scoped score and holding identifiers", async () => {
  let storedValues: any[] | undefined;
  await withApi(async (sql, values) => {
    if (sql.startsWith("DELETE")) return { rows: [] };
    assert.match(sql, /ON CONFLICT \(event_id, installation_id\)/);
    assert.match(sql, /updated_at <= NOW\(\) - INTERVAL '15 seconds'/);
    assert.match(sql, /event_start_at > NOW\(\)[\s\S]*alias = EXCLUDED\.alias/);
    storedValues = values;
    return { rows: [{ alias: "MarketFox", start_equity: 100_000, equity: 101_250, return_percent: 1.25, holdings: [{ symbol: "AAPL", companyName: "Apple Inc." }], updated_at: new Date("2026-11-18T17:00:00.000Z") }] };
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
  assert.deepEqual(JSON.parse(storedValues?.[6]), [{ symbol: "AAPL", companyName: "Apple Inc." }]);
});

test("leaderboard response ranks participants without exposing installation IDs or trade details", async () => {
  let queries = 0;
  await withApi(async (sql, values) => {
    queries += 1;
    if (sql.startsWith("DELETE")) return { rows: [] };
    assert.match(sql, /ROW_NUMBER\(\) OVER/);
    assert.match(sql, /event_end_at > NOW\(\) - \(\$2 \* INTERVAL '1 day'\)/);
    assert.deepEqual(values, [eventId, 30]);
    return { rows: [{
      installation_id: "must-not-leak",
      rank: "1",
      alias: "MarketFox",
      start_equity: "100000",
      equity: "101250",
      return_percent: "1.25",
      holdings: [{ symbol: "AAPL", companyName: "Apple Inc.", shares: 3 }],
      updated_at: new Date("2026-11-18T17:00:00.000Z"),
      transactions: ["must-not-leak"],
      account_name: "must-not-leak",
    }] };
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/event-arena/${eventId}/leaderboard`);
    assert.equal(response.status, 200);
    const result = await response.json() as any;
    assert.deepEqual(Object.keys(result.entries[0]), ["rank", "alias", "startEquity", "equity", "returnPercent", "holdings", "updatedAt"]);
    assert.deepEqual(result.entries[0].holdings, [{ symbol: "AAPL", companyName: "Apple Inc." }]);
    assert.equal(JSON.stringify(result).includes("must-not-leak"), false);
    assert.equal(JSON.stringify(result).includes("shares"), false);
  });
  assert.equal(queries, 2);
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
  assert.equal(queries, 2);
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
