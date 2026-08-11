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

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import pg from "pg";
import { logger } from "./lib/logger.js";
import {
  classifyExpoPushResponse,
  type PendingAlert,
} from "./lib/alertLogic.js";
import { runAlertCheckCycle } from "./lib/alertWorkerCycle.js";

const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const execFileAsync = promisify(execFile);
const __workerDirname = dirname(fileURLToPath(import.meta.url));
// fetch_price.py is copied to dist/ by build.mjs alongside the bundle.
const PRICE_SCRIPT_PATH = join(__workerDirname, "fetch_price.py");

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
      const { stdout } = await execFileAsync(
        "python3", [PRICE_SCRIPT_PATH, normalizedSymbol],
        { timeout: 20_000, maxBuffer: 1024 * 1024 },
      );
      const data = JSON.parse(stdout.trim());
      const price = Number(data.currentPrice);
      if (!data.error && Number.isFinite(price) && price > 0) return price;
      lastError = new Error(data.error || `No usable price returned for ${normalizedSymbol}`);
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

async function sendExpoPush(alert: PendingAlert, price: number) {
  const pushRes = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({
      to: alert.pushToken,
      title: `${alert.symbol} Price Alert`,
      body: `${alert.symbol} hit ${price.toFixed(2)} — your target was ${alert.targetPrice.toFixed(2)}`,
      sound: "default",
      channelId: "price-alerts",
      data: { symbol: alert.symbol },
    }),
  });
  const body = await pushRes.json().catch(() => null);
  const result = classifyExpoPushResponse(pushRes.ok, body);
  if (!result.accepted) {
    logger.warn(
      { symbol: alert.symbol, status: pushRes.status, body, permanent: result.permanentFailure },
      "[alert-worker] push not accepted",
    );
  }
  return result;
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
    });

    if (stats.checked > 0) {
      logger.info({ ...stats }, "[alert-worker] check cycle complete");
    } else {
      logger.debug("[alert-worker] no pending alerts");
    }
  } catch (e: any) {
    logger.error({ err: e }, "[alert-worker] price check failed");
  } finally {
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

import http from "node:http";

function startHealthServer(port: number): void {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "alert-worker" }));
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
