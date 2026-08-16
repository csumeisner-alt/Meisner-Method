/**
 * Standalone price-alert worker.
 *
 * This process runs independently of the API server so alert checks continue
 * even when the autoscaling API is idle (scaled to zero). It connects to the
 * same database, reuses the same alert logic, and fires Expo push
 * notifications on a fixed 5-minute cycle.
 *
 * Entry point: artifacts/api-server/dist/alert-worker.mjs (production)
 *              node --experimental-strip-types src/alert-worker.ts (dev)
 */

import pg from "pg";
import { logger } from "./lib/logger.js";
import {
  classifyExpoPushResponse,
  type AlertPushRequest,
  type PendingAlert,
  type PushSendResult,
} from "./lib/alertLogic.js";
import { runAlertCheckCycle } from "./lib/alertWorkerCycle.js";
import { computeHealthStatus } from "./lib/alertWorkerHealth.js";
import { fetchYahooChartPrice } from "./lib/marketPrice.js";

const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Schema gate ────────────────────────────────────────────────────────────
// The worker only reads price_alerts and push_devices, which are created by
// the API server's boot-time migration. We wait until those tables exist
// before starting the loop so a fresh deployment doesn't crash on the first
// query, and we retry indefinitely so a temporary DB hiccup doesn't kill the
// worker permanently.

async function waitForSchema(maxAttempts = 20): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await pool.query(
        `SELECT 1 FROM price_alerts LIMIT 1`,
      );
      logger.info("[alert-worker] schema ready");
      return;
    } catch {
      logger.info(
        { attempt, maxAttempts },
        "[alert-worker] waiting for schema to be ready…",
      );
      await sleep(15_000);
    }
  }
  // After maxAttempts we log but don't throw — the loop will retry on the
  // next cycle so the worker keeps running rather than crashing on boot.
  logger.error("[alert-worker] schema still not ready after waiting; continuing anyway");
}

// ── Price fetcher ──────────────────────────────────────────────────────────

async function fetchCurrentPrice(symbol: string): Promise<number | null> {
  const normalizedSymbol = symbol.toUpperCase().trim();
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const price = await fetchYahooChartPrice(normalizedSymbol);
      if (price != null) return price;
      lastError = new Error(`No usable Yahoo chart price for ${normalizedSymbol}`);
    } catch (error) {
      lastError = error;
    }

    if (attempt < 2) {
      await sleep(1_500);
    }
  }

  logger.warn(
    { symbol: normalizedSymbol, err: lastError },
    "[alert-worker] quote unavailable after retry",
  );
  return null;
}

// ── Push sender ────────────────────────────────────────────────────────────

async function sendExpoPushBatch(
  requests: AlertPushRequest[],
): Promise<Map<string, PushSendResult>> {
  const results = new Map<string, PushSendResult>();

  // Expo accepts up to 100 messages in one request. Keeping same-cycle
  // alerts together avoids issuing concurrent requests to the same device,
  // while preserving one result per alert ticket.
  for (let offset = 0; offset < requests.length; offset += 100) {
    const chunk = requests.slice(offset, offset + 100);
    const pushRes = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(
        chunk.map(({ alert, currentPrice }) => ({
          to: alert.pushToken,
          title: `${alert.symbol} Price Alert`,
          body: `${alert.symbol} hit ${currentPrice.toFixed(2)} — your target was ${alert.targetPrice.toFixed(2)}`,
          sound: "default",
          priority: "high",
          channelId: "price-alerts",
          data: { alertId: alert.id, symbol: alert.symbol },
        })),
      ),
    });
    const body = await pushRes.json().catch(() => null);
    const ticketData = Array.isArray((body as any)?.data) ? body : { data: [] };

    chunk.forEach(({ alert }, index) => {
      const result = classifyExpoPushResponse(pushRes.ok, ticketData, index);
      results.set(alert.id, result);
      if (!result.accepted) {
        logger.warn(
          {
            alertId: alert.id,
            symbol: alert.symbol,
            status: pushRes.status,
            body,
            permanent: result.permanentFailure,
          },
          "[alert-worker] push ticket not accepted",
        );
      }
    });
  }

  return results;
}

async function sendExpoPush(alert: PendingAlert, price: number) {
  const results = await sendExpoPushBatch([{ alert, currentPrice: price }]);
  return results.get(alert.id) ?? { accepted: false, permanentFailure: false };
}

// ── Alert check cycle ──────────────────────────────────────────────────────

let alertCheckRunning = false;

async function runAlertCheck(): Promise<void> {
  if (alertCheckRunning) {
    logger.info("[alert-worker] check already running — skipping overlapping cycle");
    return;
  }
  alertCheckRunning = true;
  try {
    const stats = await runAlertCheckCycle(pool, {
      fetchPrice: fetchCurrentPrice,
      sendPush: sendExpoPush,
      sendPushBatch: sendExpoPushBatch,
    });

    if (stats.checked > 0) {
      logger.info({ ...stats }, "[alert-worker] check cycle complete");
    } else {
      logger.debug("[alert-worker] no pending alerts");
    }
  } catch (e: any) {
    logger.error({ err: e }, "[alert-worker] price check failed");
  } finally {
    // Record completion time even when the cycle threw — what matters for
    // liveness is that the loop is still advancing, not that every check
    // succeeded.
    lastCycleCompletedAt = Date.now();
    alertCheckRunning = false;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Health server ──────────────────────────────────────────────────────────
// A minimal HTTP server so the alert worker can be registered as a proper
// artifact service with a port and remain reachable for health checks.
//
// workerStartedAt is set at boot and used as the liveness baseline before the
// first cycle completes, so a hang in schema-wait or the first runAlertCheck
// call is also caught.  Once a cycle finishes, lastCycleCompletedAt takes over.
// /healthz returns 503 when no progress has occurred in 2× CHECK_INTERVAL_MS.

import http from "node:http";

const workerStartedAt: number = Date.now();
let lastCycleCompletedAt: number | null = null;

function startHealthServer(port: number): void {
  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/healthz") {
      const { healthy, secondsSinceProgress } = computeHealthStatus(
        { workerStartedAt, lastCycleCompletedAt, checkIntervalMs: CHECK_INTERVAL_MS },
        Date.now(),
      );

      if (!healthy) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            ok: false,
            service: "alert-worker",
            lastCycleCompletedAt,
            secondsSinceProgress,
          }),
        );
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            ok: true,
            service: "alert-worker",
            lastCycleCompletedAt,
          }),
        );
      }
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "not found" }));
    }
  });
  server.listen(port, () => {
    logger.info({ port }, "[alert-worker] health server listening");
  });
}

// ── Main loop ──────────────────────────────────────────────────────────────

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

async function main(): Promise<void> {
  logger.info("[alert-worker] starting");

  // Bind health port so the process is detectable by the artifact system.
  const port = Number(process.env.PORT ?? 0);
  if (port > 0) startHealthServer(port);

  await waitForSchema();

  // Initial check 30 s after boot, then every 5 minutes.
  await sleep(30_000);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    await runAlertCheck();
    await sleep(CHECK_INTERVAL_MS);
  }
}

main().catch((err) => {
  logger.error({ err }, "[alert-worker] fatal error — exiting");
  process.exit(1);
});
