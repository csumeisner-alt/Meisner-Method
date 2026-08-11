/**
 * Integration tests for the alert-worker check cycle.
 *
 * These run against the real Postgres (DATABASE_URL) using throwaway IDs so
 * they do not pollute production data. Each test calls `runAlertCheckCycle`
 * from alertWorkerCycle.ts — the same function the live process uses — with
 * the real DB pool (so the actual pending-alert SQL query, JOIN on
 * push_devices, row mapping, and fired_at UPDATE all execute for real) but
 * with stubbed price-fetch and push-send dependencies to avoid network calls.
 *
 * Safety: every call passes `scopeToIds` (the throwaway IDs created for that
 * test) so the cycle cannot touch real user alerts in a shared database.
 *
 * Run:
 *   node --test --experimental-strip-types src/lib/alertLogic.integration.test.ts
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { runAlertCheckCycle } from "./alertWorkerCycle.ts";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Throwaway IDs — parallel CI runs never collide.
const userId = `test-alerts-${randomUUID()}`;
const installationId = `test-install-${randomUUID()}`;
const pushToken = `ExponentPushToken[test-${randomUUID()}]`;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Insert a price_alert row. Returns the generated ID.
 * Uses the `userId` + `pushToken` path for simple cases, or the
 * `installationId` path (token comes from push_devices JOIN) when requested.
 */
async function insertAlert(opts: {
  symbol: string;
  direction: "above" | "below";
  targetPrice: number;
  useInstallation?: boolean;
}): Promise<string> {
  const id = randomUUID();
  if (opts.useInstallation) {
    await pool.query(
      `INSERT INTO price_alerts
         (id, user_id, installation_id, symbol, direction, target_price, push_token)
       VALUES ($1, NULL, $2, $3, $4, $5, NULL)`,
      [id, installationId, opts.symbol, opts.direction, opts.targetPrice],
    );
  } else {
    await pool.query(
      `INSERT INTO price_alerts
         (id, user_id, installation_id, symbol, direction, target_price, push_token)
       VALUES ($1, $2, NULL, $3, $4, $5, $6)`,
      [id, userId, opts.symbol, opts.direction, opts.targetPrice, pushToken],
    );
  }
  return id;
}

/** Read the fired_at column for a given alert ID from the real DB. */
async function getFiredAt(alertId: string): Promise<Date | null> {
  const { rows } = await pool.query(
    "SELECT fired_at FROM price_alerts WHERE id=$1",
    [alertId],
  );
  return rows[0]?.fired_at ?? null;
}

// ── Schema setup / teardown ──────────────────────────────────────────────────

before(async () => {
  // Mirror the boot-time migrations so tests work on a fresh DB without
  // requiring the API server to have started first.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS price_alerts (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      symbol TEXT NOT NULL,
      direction TEXT NOT NULL,
      target_price NUMERIC NOT NULL,
      push_token TEXT,
      fired_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(
    "ALTER TABLE price_alerts ADD COLUMN IF NOT EXISTS installation_id TEXT",
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS push_devices (
      installation_id TEXT PRIMARY KEY,
      expo_push_token TEXT NOT NULL,
      platform TEXT,
      enabled BOOLEAN DEFAULT TRUE,
      last_seen_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ
    )
  `);
  // user_prefs is LEFT JOINed by the worker query; create it if absent.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_prefs (
      user_id TEXT PRIMARY KEY,
      notifications_enabled BOOLEAN DEFAULT TRUE
    )
  `);

  // Register a push_devices row for installation-based tests.
  await pool.query(
    `INSERT INTO push_devices
       (installation_id, expo_push_token, enabled, last_seen_at, updated_at)
     VALUES ($1, $2, TRUE, NOW(), NOW())
     ON CONFLICT (installation_id) DO UPDATE
       SET expo_push_token = EXCLUDED.expo_push_token, enabled = TRUE`,
    [installationId, pushToken],
  );
});

after(async () => {
  await pool.query(
    "DELETE FROM price_alerts WHERE user_id=$1 OR installation_id=$2",
    [userId, installationId],
  );
  await pool.query("DELETE FROM push_devices WHERE installation_id=$1", [
    installationId,
  ]);
  await pool.end();
});

// ── Tests ────────────────────────────────────────────────────────────────────

test("full cycle: alert inserted → worker query picks it up → fired_at stamped in DB", async () => {
  const alertId = await insertAlert({
    symbol: "AAPL",
    direction: "above",
    targetPrice: 100,
  });
  const pushed: string[] = [];

  const stats = await runAlertCheckCycle(
    pool,
    {
      fetchPrice: async (sym) => (sym === "AAPL" ? 150 : null), // 150 ≥ 100 → triggers
      sendPush: async (alert) => {
        pushed.push(alert.id);
        return { accepted: true, permanentFailure: false };
      },
    },
    { scopeToIds: [alertId] },
  );

  assert.equal(stats.checked, 1, "cycle must see exactly our alert");
  assert.equal(stats.triggered, 1, "alert must be counted as triggered");
  assert.equal(stats.delivered, 1, "alert must be counted as delivered");
  assert.deepEqual(pushed, [alertId], "push must fire for our alert ID");

  const firedAt = await getFiredAt(alertId);
  assert.notEqual(firedAt, null, "fired_at must be stamped in the real DB row");
});

test("below-target alert fires when price drops through threshold", async () => {
  const alertId = await insertAlert({
    symbol: "TSLA",
    direction: "below",
    targetPrice: 200,
  });

  const stats = await runAlertCheckCycle(
    pool,
    {
      fetchPrice: async () => 150, // 150 ≤ 200 → triggers
      sendPush: async () => ({ accepted: true, permanentFailure: false }),
    },
    { scopeToIds: [alertId] },
  );

  assert.equal(stats.triggered, 1);
  assert.notEqual(await getFiredAt(alertId), null, "fired_at must be set");
});

test("alert whose price hasn't crossed threshold is not fired", async () => {
  const alertId = await insertAlert({
    symbol: "GOOG",
    direction: "above",
    targetPrice: 1000,
  });
  assert.equal(await getFiredAt(alertId), null);

  await runAlertCheckCycle(
    pool,
    {
      fetchPrice: async () => 100, // 100 < 1000 → does NOT trigger
      sendPush: async () => { throw new Error("should not send"); },
    },
    { scopeToIds: [alertId] },
  );

  assert.equal(await getFiredAt(alertId), null, "fired_at must remain null");
});

test("transient push failure leaves fired_at null so the alert retries next cycle", async () => {
  const alertId = await insertAlert({
    symbol: "AMZN",
    direction: "above",
    targetPrice: 100,
  });

  const stats = await runAlertCheckCycle(
    pool,
    {
      fetchPrice: async () => 200,
      sendPush: async () => ({ accepted: false, permanentFailure: false }),
    },
    { scopeToIds: [alertId] },
  );

  assert.equal(stats.retriedTransient, 1);
  assert.equal(await getFiredAt(alertId), null, "fired_at must remain null — will retry");
});

test("permanent push failure (dead token) stamps fired_at to prevent infinite retry", async () => {
  const alertId = await insertAlert({
    symbol: "MSFT",
    direction: "above",
    targetPrice: 100,
  });

  const stats = await runAlertCheckCycle(
    pool,
    {
      fetchPrice: async () => 200,
      sendPush: async () => ({ accepted: false, permanentFailure: true }),
    },
    { scopeToIds: [alertId] },
  );

  assert.equal(stats.firedPermanentFailure, 1);
  assert.notEqual(await getFiredAt(alertId), null, "fired_at must be set to stop retry loop");
});

test("installation-based alert: worker JOIN resolves push token from push_devices", async () => {
  // Alert has no push_token column — token must come from the push_devices JOIN.
  const alertId = await insertAlert({
    symbol: "NVDA",
    direction: "above",
    targetPrice: 100,
    useInstallation: true,
  });

  const resolvedTokens: string[] = [];

  const stats = await runAlertCheckCycle(
    pool,
    {
      fetchPrice: async () => 150,
      sendPush: async (alert) => {
        resolvedTokens.push(alert.pushToken);
        return { accepted: true, permanentFailure: false };
      },
    },
    { scopeToIds: [alertId] },
  );

  assert.equal(stats.delivered, 1, "alert must be delivered");
  assert.ok(
    resolvedTokens.some((t) => t === pushToken),
    `push token must be resolved from push_devices JOIN (got: ${resolvedTokens.join(", ")})`,
  );
  assert.notEqual(await getFiredAt(alertId), null, "fired_at must be stamped");
});

test("worker query respects fired_at IS NULL — already-fired alert is not re-processed", async () => {
  // Pre-fire an alert; the worker WHERE fired_at IS NULL must exclude it.
  const alertId = await insertAlert({ symbol: "IBM", direction: "above", targetPrice: 100 });
  await pool.query("UPDATE price_alerts SET fired_at=NOW() WHERE id=$1", [alertId]);

  let pushCount = 0;
  const stats = await runAlertCheckCycle(
    pool,
    {
      fetchPrice: async () => 200,
      sendPush: async (alert) => {
        if (alert.id === alertId) pushCount++;
        return { accepted: true, permanentFailure: false };
      },
    },
    { scopeToIds: [alertId] },
  );

  assert.equal(stats.checked, 0, "already-fired alert must be excluded by WHERE fired_at IS NULL");
  assert.equal(pushCount, 0, "push must not fire for an already-fired alert");
});

test("multiple alerts for different symbols each resolved and fired independently", async () => {
  const aaplId = await insertAlert({ symbol: "AAPL", direction: "above", targetPrice: 100 });
  const tslaId = await insertAlert({ symbol: "TSLA", direction: "below", targetPrice: 300 });
  // GOOG threshold is set high so it does NOT trigger
  const googId = await insertAlert({ symbol: "GOOG", direction: "above", targetPrice: 5000 });

  const firedIds: string[] = [];

  const stats = await runAlertCheckCycle(
    pool,
    {
      fetchPrice: async (sym) => {
        if (sym === "AAPL") return 150;  // triggers (150 ≥ 100)
        if (sym === "TSLA") return 250;  // triggers (250 ≤ 300)
        if (sym === "GOOG") return 100;  // does NOT trigger (100 < 5000)
        return null;
      },
      sendPush: async (alert) => {
        firedIds.push(alert.id);
        return { accepted: true, permanentFailure: false };
      },
    },
    { scopeToIds: [aaplId, tslaId, googId] },
  );

  assert.equal(stats.checked, 3, "all three alerts must be in scope");
  assert.equal(stats.triggered, 2, "exactly 2 alerts must trigger");
  assert.equal(stats.delivered, 2, "exactly 2 alerts must be delivered");

  assert.ok(firedIds.includes(aaplId), "AAPL must be fired");
  assert.ok(firedIds.includes(tslaId), "TSLA must be fired");
  assert.ok(!firedIds.includes(googId), "GOOG must NOT be fired");

  assert.notEqual(await getFiredAt(aaplId), null, "AAPL fired_at must be set");
  assert.notEqual(await getFiredAt(tslaId), null, "TSLA fired_at must be set");
  assert.equal(await getFiredAt(googId), null, "GOOG fired_at must remain null");
});
