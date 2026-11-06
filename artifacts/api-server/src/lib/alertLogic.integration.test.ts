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
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import express from "express";
import pg from "pg";
import { runAlertCheckCycle } from "./alertWorkerCycle.ts";
import { sendExpoPushRequest } from "./expoPushRequest.ts";
import { createNotificationAlertRouter } from "../routes/notificationAlertRoutes.ts";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// Separate connections model independent API/worker processes racing on rows.
const competingPool = new Pool({ connectionString: process.env.DATABASE_URL });

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
  paused?: boolean;
}): Promise<string> {
  const id = randomUUID();
  if (opts.useInstallation) {
    await pool.query(
      `INSERT INTO price_alerts
         (id, user_id, installation_id, symbol, direction, target_price, push_token, paused)
       VALUES ($1, NULL, $2, $3, $4, $5, NULL, $6)`,
      [id, installationId, opts.symbol, opts.direction, opts.targetPrice, opts.paused ?? false],
    );
  } else {
    await pool.query(
      `INSERT INTO price_alerts
         (id, user_id, installation_id, symbol, direction, target_price, push_token, paused)
       VALUES ($1, $2, NULL, $3, $4, $5, $6, $7)`,
      [id, userId, opts.symbol, opts.direction, opts.targetPrice, pushToken, opts.paused ?? false],
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
      paused BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query("ALTER TABLE price_alerts ADD COLUMN IF NOT EXISTS paused BOOLEAN NOT NULL DEFAULT FALSE");
  await pool.query("ALTER TABLE price_alerts ADD COLUMN IF NOT EXISTS delivery_claim_token TEXT");
  await pool.query("ALTER TABLE price_alerts ADD COLUMN IF NOT EXISTS delivery_claimed_at TIMESTAMPTZ");
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
  await competingPool.end();
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
  const { rows } = await pool.query(
    "SELECT delivery_claim_token FROM price_alerts WHERE id=$1",
    [alertId],
  );
  assert.equal(rows[0].delivery_claim_token, null, "transient failure releases its claim");

  const retried = await runAlertCheckCycle(
    pool,
    {
      fetchPrice: async () => 200,
      sendPush: async () => ({ accepted: true, permanentFailure: false }),
    },
    { scopeToIds: [alertId] },
  );
  assert.equal(retried.delivered, 1, "a later cycle can safely claim and deliver again");
  assert.notEqual(await getFiredAt(alertId), null);
});

test("timed-out Expo request releases its active alert claim immediately", async () => {
  const alertId = await insertAlert({
    symbol: "TIMEOUT",
    direction: "above",
    targetPrice: 100,
  });

  const stats = await runAlertCheckCycle(
    pool,
    {
      fetchPrice: async () => 200,
      sendPush: async (pendingAlert, price) => {
        await sendExpoPushRequest(
          {
            to: pendingAlert.pushToken,
            title: `${pendingAlert.symbol} Price Alert`,
            body: `${pendingAlert.symbol} hit ${price.toFixed(2)}`,
          },
          {
            timeoutMs: 10,
            fetchImpl: async (_input, init) => new Promise<Response>((_resolve, reject) => {
              const signal = init?.signal as AbortSignal | undefined;
              if (!signal) {
                reject(new Error("request signal was not provided"));
                return;
              }
              signal.addEventListener("abort", () => reject(signal.reason), { once: true });
            }),
          },
        );
        return { accepted: true, permanentFailure: false };
      },
    },
    { scopeToIds: [alertId] },
  );

  assert.equal(stats.retriedTransient, 1);
  assert.equal(await getFiredAt(alertId), null, "timed-out alert remains eligible for retry");
  const { rows } = await pool.query(
    "SELECT delivery_claim_token FROM price_alerts WHERE id=$1",
    [alertId],
  );
  assert.equal(rows[0].delivery_claim_token, null, "timed-out request releases its claim");
});

test("two independent workers racing on one alert send only once", async () => {
  const alertId = await insertAlert({
    symbol: "RACE",
    direction: "above",
    targetPrice: 100,
  });
  let fetchCount = 0;
  let releaseFetches!: () => void;
  const bothWorkersFetching = new Promise<void>((resolve) => {
    releaseFetches = resolve;
  });
  const fetchPrice = async () => {
    fetchCount++;
    if (fetchCount === 2) releaseFetches();
    await bothWorkersFetching;
    return 150;
  };
  const pushed: string[] = [];
  const deps = {
    fetchPrice,
    sendPush: async (alert: { id: string }) => {
      pushed.push(alert.id);
      return { accepted: true, permanentFailure: false };
    },
  };

  const [first, second] = await Promise.all([
    runAlertCheckCycle(pool, deps, { scopeToIds: [alertId] }),
    runAlertCheckCycle(competingPool, deps, { scopeToIds: [alertId] }),
  ]);

  assert.equal(first.checked + second.checked, 2, "both workers selected the pending row");
  assert.equal(first.delivered + second.delivered, 1, "only the claim owner delivers");
  assert.equal(first.skippedClaimed + second.skippedClaimed, 1);
  assert.deepEqual(pushed, [alertId]);
  assert.notEqual(await getFiredAt(alertId), null);
});

test("an abandoned expired claim can be reclaimed", async () => {
  const alertId = await insertAlert({
    symbol: "CLAIM",
    direction: "above",
    targetPrice: 100,
  });
  await pool.query(
    `UPDATE price_alerts
     SET delivery_claim_token='abandoned-worker',
         delivery_claimed_at=NOW() - INTERVAL '11 minutes'
     WHERE id=$1`,
    [alertId],
  );

  const stats = await runAlertCheckCycle(
    competingPool,
    {
      fetchPrice: async () => 150,
      sendPush: async () => ({ accepted: true, permanentFailure: false }),
    },
    { scopeToIds: [alertId] },
  );

  assert.equal(stats.delivered, 1);
  assert.notEqual(await getFiredAt(alertId), null);
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

test("paused alert is skipped, then resumes and fires without changing its target", async () => {
  const alertId = await insertAlert({
    symbol: "AAPL",
    direction: "above",
    targetPrice: 100,
    paused: true,
  });
  const independentAlertId = await insertAlert({
    symbol: "AAPL",
    direction: "above",
    targetPrice: 200,
  });
  const pushes: string[] = [];
  const deps = {
    fetchPrice: async () => 150,
    sendPush: async (alert: { id: string }) => {
      pushes.push(alert.id);
      return { accepted: true, permanentFailure: false };
    },
  };

  const pausedCycle = await runAlertCheckCycle(pool, deps, {
    scopeToIds: [alertId, independentAlertId],
  });
  assert.equal(pausedCycle.checked, 1);
  assert.equal(pausedCycle.triggered, 0);
  assert.deepEqual(pushes, []);
  assert.equal(await getFiredAt(alertId), null);
  assert.equal(await getFiredAt(independentAlertId), null);

  await pool.query("UPDATE price_alerts SET paused=FALSE WHERE id=$1", [alertId]);
  const resumedCycle = await runAlertCheckCycle(pool, deps, { scopeToIds: [alertId] });
  assert.equal(resumedCycle.delivered, 1);
  assert.deepEqual(pushes, [alertId]);
  assert.notEqual(await getFiredAt(alertId), null);
  const { rows } = await pool.query(
    "SELECT target_price FROM price_alerts WHERE id=$1",
    [alertId],
  );
  assert.equal(Number(rows[0].target_price), 100);
});

test("alert paused after worker selection is not delivered or marked fired", async () => {
  const pausedAlertId = await insertAlert({
    symbol: "AAPL",
    direction: "above",
    targetPrice: 100,
  });
  const independentAlertId = await insertAlert({
    symbol: "AAPL",
    direction: "above",
    targetPrice: 120,
  });
  const pushes: string[] = [];

  const stats = await runAlertCheckCycle(
    pool,
    {
      fetchPrice: async () => {
        // The worker's selection query has already returned both alerts.
        await pool.query("UPDATE price_alerts SET paused=TRUE WHERE id=$1", [
          pausedAlertId,
        ]);
        return 150;
      },
      sendPush: async () => {
        throw new Error("the worker should send this cycle as a batch");
      },
      sendPushBatch: async (requests) => {
        pushes.push(...requests.map(({ alert }) => alert.id));
        return new Map(
          requests.map(({ alert }) => [
            alert.id,
            { accepted: true, permanentFailure: false },
          ]),
        );
      },
    },
    { scopeToIds: [pausedAlertId, independentAlertId] },
  );

  assert.equal(stats.checked, 2, "both alerts were selected before the pause");
  assert.equal(stats.triggered, 2, "both prices crossed their targets");
  assert.equal(stats.skippedPaused, 1, "the newly paused alert must be skipped");
  assert.equal(stats.delivered, 1, "the unrelated active alert must still deliver");
  assert.deepEqual(pushes, [independentAlertId]);
  assert.equal(await getFiredAt(pausedAlertId), null, "paused alert must remain unfired");
  assert.notEqual(
    await getFiredAt(independentAlertId),
    null,
    "unrelated active alert must be marked fired",
  );
});

test("alert edited after worker selection is re-evaluated before delivery", async () => {
  const alertId = await insertAlert({
    symbol: "AAPL",
    direction: "above",
    targetPrice: 100,
    useInstallation: true,
  });
  const app = express();
  app.use(express.json());
  app.use(createNotificationAlertRouter(
    { query: (sql, values) => pool.query(sql, values) },
    (_req, _res, next) => next(),
    randomUUID,
  ));
  const server = app.listen(0, "127.0.0.1");
  let pushCount = 0;

  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const editUrl = `http://127.0.0.1:${address.port}/notifications/alerts/${alertId}`;

    const staleCycle = await runAlertCheckCycle(
      pool,
      {
        fetchPrice: async () => {
          // The cycle has selected the 100 target. Edit it before delivery.
          const response = await fetch(editUrl, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              installationId,
              direction: "above",
              targetPrice: 200,
              pushToken,
            }),
          });
          assert.equal(response.status, 200, "the alert edit must succeed");
          return 150;
        },
        sendPush: async () => {
          pushCount++;
          return { accepted: true, permanentFailure: false };
        },
      },
      { scopeToIds: [alertId] },
    );

    assert.equal(staleCycle.checked, 1, "the old alert settings were selected");
    assert.equal(staleCycle.triggered, 1, "150 crosses the old target of 100");
    assert.equal(staleCycle.skippedPaused, 1, "the changed alert must fail revalidation");
    assert.equal(pushCount, 0, "the old target must not cause a push");
    assert.equal(await getFiredAt(alertId), null, "the edited alert must remain pending");

    const belowNewTarget = await runAlertCheckCycle(
      pool,
      {
        fetchPrice: async () => 150,
        sendPush: async () => {
          pushCount++;
          return { accepted: true, permanentFailure: false };
        },
      },
      { scopeToIds: [alertId] },
    );
    assert.equal(belowNewTarget.checked, 1);
    assert.equal(belowNewTarget.triggered, 0, "the next cycle must use the new target of 200");
    assert.equal(pushCount, 0);
    assert.equal(await getFiredAt(alertId), null);

    const atNewTarget = await runAlertCheckCycle(
      pool,
      {
        fetchPrice: async () => 250,
        sendPush: async () => {
          pushCount++;
          return { accepted: true, permanentFailure: false };
        },
      },
      { scopeToIds: [alertId] },
    );
    assert.equal(atNewTarget.delivered, 1, "the edited target must fire in a later cycle");
    assert.equal(pushCount, 1, "only the later cycle may send the notification");
    assert.notEqual(await getFiredAt(alertId), null);
  } finally {
    server.close();
    await once(server, "close");
    await pool.query("DELETE FROM price_alerts WHERE id=$1", [alertId]);
  }
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

test("multiple alerts for the same symbol fire independently by target", async () => {
  const lowAlertId = await insertAlert({ symbol: "AAPL", direction: "above", targetPrice: 100 });
  const highAlertId = await insertAlert({ symbol: "AAPL", direction: "above", targetPrice: 200 });
  const firedIds: string[] = [];

  const stats = await runAlertCheckCycle(
    pool,
    {
      fetchPrice: async () => 150,
      sendPush: async (alert) => {
        firedIds.push(alert.id);
        return { accepted: true, permanentFailure: false };
      },
    },
    { scopeToIds: [lowAlertId, highAlertId] },
  );

  assert.equal(stats.checked, 2);
  assert.equal(stats.triggered, 1);
  assert.deepEqual(firedIds, [lowAlertId]);
  assert.notEqual(await getFiredAt(lowAlertId), null);
  assert.equal(await getFiredAt(highAlertId), null);
});

test("editing a fired alert over HTTP resets it and the worker uses its updated target", async () => {
  const alertId = await insertAlert({
    symbol: "AAPL",
    direction: "above",
    targetPrice: 100,
    useInstallation: true,
  });
  const app = express();
  app.use(express.json());
  app.use(createNotificationAlertRouter(
    { query: (sql, values) => pool.query(sql, values) },
    (_req, _res, next) => next(),
    randomUUID,
  ));
  const server = app.listen(0, "127.0.0.1");
  let pushCount = 0;

  try {
    await once(server, "listening");
    const initialCycle = await runAlertCheckCycle(
      pool,
      {
        fetchPrice: async () => 150,
        sendPush: async () => {
          pushCount++;
          return { accepted: true, permanentFailure: false };
        },
      },
      { scopeToIds: [alertId] },
    );
    assert.equal(initialCycle.delivered, 1);
    assert.notEqual(await getFiredAt(alertId), null, "the original alert must be fired before editing");

    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(
      `http://127.0.0.1:${address.port}/notifications/alerts/${alertId}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          installationId,
          direction: "above",
          targetPrice: 200,
          pushToken,
        }),
      },
    );
    const editedAlert = await response.json() as {
      id: string;
      targetPrice: number;
      firedAt: string | null;
    };
    assert.equal(response.status, 200, "the owning installation can edit its fired alert");
    assert.equal(editedAlert.id, alertId);
    assert.equal(editedAlert.targetPrice, 200);
    assert.equal(editedAlert.firedAt, null, "the edit response must show the alert as pending");
    assert.equal(await getFiredAt(alertId), null, "editing must clear fired_at in the database");

    const belowUpdatedTarget = await runAlertCheckCycle(
      pool,
      {
        fetchPrice: async () => 150,
        sendPush: async () => {
          pushCount++;
          return { accepted: true, permanentFailure: false };
        },
      },
      { scopeToIds: [alertId] },
    );
    assert.equal(belowUpdatedTarget.checked, 1, "the edited alert must be pending again");
    assert.equal(belowUpdatedTarget.triggered, 0, "the old target must not be used after editing");
    assert.equal(await getFiredAt(alertId), null, "a price below the new target must leave it pending");

    const atUpdatedTarget = await runAlertCheckCycle(
      pool,
      {
        fetchPrice: async () => 250,
        sendPush: async () => {
          pushCount++;
          return { accepted: true, permanentFailure: false };
        },
      },
      { scopeToIds: [alertId] },
    );
    assert.equal(atUpdatedTarget.delivered, 1, "the worker must fire the alert at its updated target");
    assert.equal(pushCount, 2, "the alert must deliver once before editing and once after the new target");
    assert.notEqual(await getFiredAt(alertId), null, "the edited alert must be marked fired again");
  } finally {
    server.close();
    await once(server, "close");
    await pool.query("DELETE FROM price_alerts WHERE id=$1", [alertId]);
  }
});

test("editing a fired paused alert keeps it paused until explicitly resumed", async () => {
  const alertId = await insertAlert({
    symbol: "AAPL",
    direction: "above",
    targetPrice: 100,
    useInstallation: true,
  });
  const app = express();
  app.use(express.json());
  app.use(createNotificationAlertRouter(
    { query: (sql, values) => pool.query(sql, values) },
    (_req, _res, next) => next(),
    randomUUID,
  ));
  const server = app.listen(0, "127.0.0.1");
  let pushCount = 0;

  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const alertUrl = `http://127.0.0.1:${address.port}/notifications/alerts/${alertId}`;
    const request = async (method: string, body: Record<string, unknown>) => {
      const response = await fetch(alertUrl, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() as any };
    };
    const alertBody = (extra: Record<string, unknown>) => ({
      installationId,
      ...extra,
    });
    const workerDeps = {
      fetchPrice: async () => 250,
      sendPush: async () => {
        pushCount++;
        return { accepted: true, permanentFailure: false };
      },
    };

    const initialCycle = await runAlertCheckCycle(
      pool,
      workerDeps,
      { scopeToIds: [alertId] },
    );
    assert.equal(initialCycle.delivered, 1);
    assert.notEqual(await getFiredAt(alertId), null, "the alert must fire before it is paused");

    const pauseResponse = await request(
      "PATCH",
      alertBody({ paused: true }),
    );
    assert.equal(pauseResponse.status, 200);
    assert.equal(pauseResponse.body.paused, true);
    assert.notEqual(await getFiredAt(alertId), null, "pausing must retain the fired state");

    const editResponse = await request(
      "PUT",
      alertBody({
        direction: "above",
        targetPrice: 200,
        pushToken,
      }),
    );
    assert.equal(editResponse.status, 200);
    assert.equal(editResponse.body.targetPrice, 200);
    assert.equal(editResponse.body.paused, true, "editing must preserve the paused state");
    assert.equal(editResponse.body.firedAt, null, "editing must reset the fired state");
    assert.equal(await getFiredAt(alertId), null, "the edited alert must be pending in the database");

    for (let cycleNumber = 0; cycleNumber < 2; cycleNumber++) {
      const pausedCycle = await runAlertCheckCycle(
        pool,
        workerDeps,
        { scopeToIds: [alertId] },
      );
      assert.equal(pausedCycle.checked, 0, "paused alerts must stay out of worker processing");
      assert.equal(pausedCycle.delivered, 0);
      assert.equal(await getFiredAt(alertId), null, "worker cycles must leave the paused alert pending");
      assert.equal(pushCount, 1, "no additional push may be sent while paused");
    }

    const resumeResponse = await request(
      "PATCH",
      alertBody({ paused: false }),
    );
    assert.equal(resumeResponse.status, 200);
    assert.equal(resumeResponse.body.paused, false);

    const resumedCycle = await runAlertCheckCycle(
      pool,
      workerDeps,
      { scopeToIds: [alertId] },
    );
    assert.equal(resumedCycle.delivered, 1, "the alert may deliver after explicit resume");
    assert.equal(pushCount, 2, "delivery occurs only after the alert is resumed");
    assert.notEqual(await getFiredAt(alertId), null, "the resumed alert must be marked fired");
  } finally {
    server.close();
    await once(server, "close");
    await pool.query("DELETE FROM price_alerts WHERE id=$1", [alertId]);
  }
});

test("notification alert routes create independent same-ticker alerts and enforce installation ownership on edits", async () => {
  const ownerInstallationId = `test-owner-${randomUUID()}`;
  const otherInstallationId = `test-other-${randomUUID()}`;
  const ownerPushToken = `ExponentPushToken[owner-${randomUUID()}]`;
  const otherPushToken = `ExponentPushToken[other-${randomUUID()}]`;
  const app = express();
  app.use(express.json());
  app.use(createNotificationAlertRouter(
    { query: (sql, values) => pool.query(sql, values) },
    (_req, _res, next) => next(),
    randomUUID,
  ));
  const server = app.listen(0, "127.0.0.1");

  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${address.port}/notifications/alerts`;

    const request = async (url: string, method: string, body?: Record<string, unknown>) => {
      const response = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { status: response.status, body: await response.json() as any };
    };
    const createAlert = (installationId: string, pushToken: string, targetPrice: number) =>
      request(baseUrl, "POST", {
        installationId,
        symbol: " aapl ",
        direction: "above",
        targetPrice,
        pushToken,
      });
    const listAlerts = async (installationId: string) => {
      const result = await request(
        `${baseUrl}?installationId=${encodeURIComponent(installationId)}`,
        "GET",
      );
      assert.equal(result.status, 200);
      return result.body as Array<{
        id: string;
        symbol: string;
        direction: string;
        targetPrice: number;
        paused: boolean;
      }>;
    };
    const setAlertPaused = (id: string, installationId: string, paused: boolean) =>
      request(`${baseUrl}/${id}`, "PATCH", { installationId, paused });
    const deleteAlert = (id: string, installationId: string) =>
      request(
        `${baseUrl}/${id}?installationId=${encodeURIComponent(installationId)}`,
        "DELETE",
      );

    const first = await createAlert(ownerInstallationId, ownerPushToken, 100);
    const second = await createAlert(ownerInstallationId, ownerPushToken, 200);
    const other = await createAlert(otherInstallationId, otherPushToken, 300);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(other.status, 200);
    assert.notEqual(first.body.id, second.body.id, "same-ticker alerts must have distinct IDs");
    assert.equal(first.body.symbol, "AAPL");
    assert.equal(second.body.symbol, "AAPL");

    const crossInstallationEdit = await request(
      `${baseUrl}/${first.body.id}`,
      "PUT",
      {
        installationId: otherInstallationId,
        direction: "below",
        targetPrice: 50,
        pushToken: otherPushToken,
      },
    );
    assert.equal(crossInstallationEdit.status, 404, "another installation cannot edit the alert");

    const ownEdit = await request(`${baseUrl}/${first.body.id}`, "PUT", {
      installationId: ownerInstallationId,
      direction: "below",
      targetPrice: 125,
      pushToken: ownerPushToken,
    });
    assert.equal(ownEdit.status, 200, "the owning installation can edit its alert");
    assert.equal(ownEdit.body.id, first.body.id);
    assert.equal(ownEdit.body.direction, "below");
    assert.equal(ownEdit.body.targetPrice, 125);

    const foreignPause = await setAlertPaused(first.body.id, otherInstallationId, true);
    assert.equal(foreignPause.status, 404, "another installation cannot pause the alert");
    const afterForeignPause = await listAlerts(ownerInstallationId);
    const unchangedAfterForeignPause = afterForeignPause.find((alert) => alert.id === first.body.id);
    assert.ok(unchangedAfterForeignPause, "the owner's alert must remain after a rejected pause");
    assert.equal(unchangedAfterForeignPause.direction, "below");
    assert.equal(unchangedAfterForeignPause.targetPrice, 125);
    assert.equal(unchangedAfterForeignPause.paused, false);

    const foreignDelete = await deleteAlert(second.body.id, otherInstallationId);
    assert.equal(foreignDelete.status, 404, "another installation cannot delete the alert");
    const afterForeignDelete = await listAlerts(ownerInstallationId);
    const unchangedAfterForeignDelete = afterForeignDelete.find((alert) => alert.id === second.body.id);
    assert.ok(unchangedAfterForeignDelete, "the owner's alert must remain after a rejected delete");
    assert.equal(unchangedAfterForeignDelete.direction, "above");
    assert.equal(unchangedAfterForeignDelete.targetPrice, 200);
    assert.equal(unchangedAfterForeignDelete.paused, false);

    const pauseFirst = await setAlertPaused(first.body.id, ownerInstallationId, true);
    const pauseSecond = await setAlertPaused(second.body.id, ownerInstallationId, true);
    assert.equal(pauseFirst.status, 200);
    assert.equal(pauseFirst.body.paused, true);
    assert.equal(pauseSecond.status, 200);
    assert.equal(pauseSecond.body.paused, true);

    const reloadedPausedAlerts = await listAlerts(ownerInstallationId);
    assert.equal(
      reloadedPausedAlerts.find((alert) => alert.id === first.body.id)?.paused,
      true,
      "the alert API must return the saved pause state after a fresh list request",
    );
    assert.equal(
      reloadedPausedAlerts.find((alert) => alert.id === second.body.id)?.paused,
      true,
      "the settings reload must retain every alert's individual pause state",
    );

    const resumeFirst = await setAlertPaused(first.body.id, ownerInstallationId, false);
    assert.equal(resumeFirst.status, 200);
    assert.equal(resumeFirst.body.id, first.body.id);
    assert.equal(resumeFirst.body.paused, false);
    const reloadedAfterResume = await listAlerts(ownerInstallationId);
    assert.equal(reloadedAfterResume.find((alert) => alert.id === first.body.id)?.paused, false);
    assert.equal(
      reloadedAfterResume.find((alert) => alert.id === second.body.id)?.paused,
      true,
      "resuming one alert must not change another alert for the same ticker",
    );

    assert.deepEqual(
      reloadedAfterResume
        .map(({ id, symbol, direction, targetPrice }) => ({ id, symbol, direction, targetPrice }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      [
        { id: first.body.id, symbol: "AAPL", direction: "below", targetPrice: 125 },
        { id: second.body.id, symbol: "AAPL", direction: "above", targetPrice: 200 },
      ].sort((a, b) => a.id.localeCompare(b.id)),
      "editing one same-ticker alert must leave the owner's other alert unchanged",
    );
    assert.deepEqual(
      (await listAlerts(otherInstallationId))
        .map(({ id, symbol, direction, targetPrice }) => ({ id, symbol, direction, targetPrice })),
      [{ id: other.body.id, symbol: "AAPL", direction: "above", targetPrice: 300 }],
      "a foreign edit attempt must leave the other installation's alert unchanged",
    );

    const ownerDelete = await deleteAlert(second.body.id, ownerInstallationId);
    assert.equal(ownerDelete.status, 200, "the owning installation can delete its alert");
    assert.deepEqual(
      (await listAlerts(ownerInstallationId)).map(({ id }) => id),
      [first.body.id],
      "owner deletion removes only the selected alert",
    );
  } finally {
    server.close();
    await once(server, "close");
    await pool.query("DELETE FROM price_alerts WHERE installation_id = ANY($1::text[])", [
      [ownerInstallationId, otherInstallationId],
    ]);
    await pool.query("DELETE FROM push_devices WHERE installation_id = ANY($1::text[])", [
      [ownerInstallationId, otherInstallationId],
    ]);
  }
});
