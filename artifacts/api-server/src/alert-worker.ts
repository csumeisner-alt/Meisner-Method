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
import { purgeExpiredEventArenaEntries } from "./lib/eventArenaRetention.js";
import { prepareLightningRoundEvents } from "./routes/eventArenaRoutes.js";
import { fetchYahooChartPrice } from "./lib/marketPrice.js";
import { sendExpoPushRequest } from "./lib/expoPushRequest.js";
import { processDueLightningRoundOrders } from "./lib/lightningRoundExecution.js";
import {
  runLightningRoundCompletionCycle,
  type LightningRoundCompletionNotice,
} from "./lib/lightningRoundCompletionWorker.js";
import {
  getLightningRoundPreparationAtMs,
  runLightningRoundReminderCycle,
  type LightningRoundReminderPush,
} from "./lib/lightningRoundReminderWorker.js";

const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on("error", (err) => {
  // Keep a transient database connection reset from terminating the worker.
  // The next cycle will retry its schema/alert queries.
  logger.error({ err }, "[alert-worker] PostgreSQL pool connection error");
});

// ── Schema gate ────────────────────────────────────────────────────────────
// The worker only reads price_alerts and push_devices, which are created by
// the API server's boot-time migration. We wait until those tables exist
// before starting the loop so a fresh deployment doesn't crash on the first
// query, and we retry indefinitely so a temporary DB hiccup doesn't kill the
// worker permanently.

async function waitForSchema(maxAttempts = 20): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await pool.query(`SELECT delivery_started_at FROM price_alerts LIMIT 0`);
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
    const pushRes = await sendExpoPushRequest(
      chunk.map(({ alert, currentPrice }) => ({
        to: alert.pushToken,
        title: `${alert.symbol} Price Alert`,
        body: `${alert.symbol} hit ${currentPrice.toFixed(2)} — your target was ${alert.targetPrice.toFixed(2)}`,
        sound: "default",
        priority: "high",
        channelId: "price-alerts",
        // Stable across worker retries for this alert; Android replaces any
        // still-visible notification with the same collapse ID.
        collapseId: alert.id,
        data: { alertId: alert.id, symbol: alert.symbol },
      })),
    );
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

    if (stats.checked > 0 || stats.finalizedUncertain > 0) {
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
const EVENT_ARENA_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const LIGHTNING_ORDER_RETRY_START_MS = 5_000;
const LIGHTNING_ORDER_RETRY_MAX_MS = 60_000;
let lastEventArenaCleanupAt = 0;
const lightningRoundReminderTimers = new Map<string, ReturnType<typeof setTimeout>>();
const lightningRoundExecutionEvents = new Set<string>();
let lightningOrderRetryTimer: ReturnType<typeof setTimeout> | null = null;
let lightningOrderRetryDelayMs = LIGHTNING_ORDER_RETRY_START_MS;
let lightningOrderExecutionRunning = false;

async function runEventArenaCleanupIfDue(): Promise<void> {
  if (Date.now() - lastEventArenaCleanupAt < EVENT_ARENA_CLEANUP_INTERVAL_MS) return;
  try {
    await purgeExpiredEventArenaEntries(pool);
    lastEventArenaCleanupAt = Date.now();
    logger.info("[alert-worker] expired Event Arena entries removed");
  } catch (err) {
    // The API may still be applying the Event Arena table migration; retry on
    // the next worker cycle rather than stopping alert delivery.
    logger.warn({ err }, "[alert-worker] Event Arena cleanup failed; will retry");
  }
}

async function prepareScheduledLightningRounds(): Promise<void> {
  try {
    const events = await prepareLightningRoundEvents(pool);
    logger.info(
      { eventIds: events.map((event) => event.eventId) },
      "[alert-worker] Lightning Round events prepared",
    );
    scheduleLightningRoundPreparationReminders(events);
    scheduleLightningRoundStartExecutions(events);
  } catch (err) {
    // Retry on the next worker cycle if the event schema is still being applied
    // or the database is temporarily unavailable.
    logger.warn({ err }, "[alert-worker] Lightning Round preparation failed; will retry");
  }
}

function scheduleLightningRoundStartExecutions(
  events: Array<{ eventId: string; eventType: string; startAtMs: number }>,
): void {
  for (const event of events) {
    if (
      event.eventType !== "lightning-round"
      || lightningRoundExecutionEvents.has(event.eventId)
      || !Number.isFinite(event.startAtMs)
    ) continue;
    lightningRoundExecutionEvents.add(event.eventId);
    const timer = setTimeout(() => {
      void executeDueLightningRoundOrders();
    }, Math.max(0, event.startAtMs - Date.now()));
    timer.unref?.();
  }
}

function scheduleLightningRoundPreparationReminders(
  events: Array<{ eventId: string; eventType: string; startAtMs: number }>,
): void {
  for (const event of events) {
    if (event.eventType !== "lightning-round" || lightningRoundReminderTimers.has(event.eventId)) continue;
    const scheduledAtMs = getLightningRoundPreparationAtMs(event.startAtMs);
    const delayMs = scheduledAtMs - Date.now();
    if (!Number.isFinite(delayMs) || delayMs <= 0) continue;
    const timer = setTimeout(() => {
      lightningRoundReminderTimers.delete(event.eventId);
      void sendDueLightningRoundPreparationReminders();
    }, delayMs);
    timer.unref?.();
    lightningRoundReminderTimers.set(event.eventId, timer);
  }
}

function scheduleLightningOrderRetry(): void {
  if (lightningOrderRetryTimer) return;
  const delayMs = lightningOrderRetryDelayMs;
  lightningOrderRetryDelayMs = Math.min(delayMs * 2, LIGHTNING_ORDER_RETRY_MAX_MS);
  lightningOrderRetryTimer = setTimeout(() => {
    lightningOrderRetryTimer = null;
    void executeDueLightningRoundOrders();
  }, delayMs);
  lightningOrderRetryTimer.unref?.();
}

async function executeDueLightningRoundOrders(): Promise<void> {
  if (lightningOrderExecutionRunning) return;
  lightningOrderExecutionRunning = true;
  let retrySoon = false;
  try {
    const summary = await processDueLightningRoundOrders(pool, {
      fetchPrice: fetchCurrentPrice,
    });
    retrySoon = summary.waiting > 0;
    if (summary.events > 0) {
      logger.info({ ...summary }, "[alert-worker] Lightning Round opening orders processed");
    }
  } catch (err) {
    logger.warn({ err }, "[alert-worker] Lightning Round order execution failed; will retry");
    retrySoon = true;
  } finally {
    lightningOrderExecutionRunning = false;
  }
  if (retrySoon) scheduleLightningOrderRetry();
  else {
    if (lightningOrderRetryTimer) clearTimeout(lightningOrderRetryTimer);
    lightningOrderRetryTimer = null;
    lightningOrderRetryDelayMs = LIGHTNING_ORDER_RETRY_START_MS;
  }
}

async function sendLightningRoundCompletionNotice(notice: LightningRoundCompletionNotice) {
  const pushRes = await sendExpoPushRequest({
    to: notice.pushToken,
    title: "Lightning Round results are ready",
    body: "Your final result is ready to review in Past Lightning Rounds.",
    sound: "default",
    priority: "high",
    channelId: "paper-event-reminders",
    collapseId: `lightning-final-${notice.eventId}-${notice.installationId}`,
    data: {
      type: "lightning-round-standings",
      eventId: notice.eventId,
    },
  });
  const body = await pushRes.json().catch(() => null);
  const result = classifyExpoPushResponse(
    pushRes.ok,
    Array.isArray((body as any)?.data) ? body : { data: [] },
  );
  return {
    accepted: result.accepted,
    ...(result.permanentFailure ? { permanentFailure: true } : {}),
    ...(result.uncertain ? { uncertain: true } : {}),
  };
}

async function sendDueLightningRoundCompletionNotices(): Promise<void> {
  try {
    const stats = await runLightningRoundCompletionCycle(pool, sendLightningRoundCompletionNotice);
    if (stats.due > 0) {
      logger.info({ ...stats }, "[alert-worker] Lightning Round completion notices processed");
    }
  } catch (err) {
    logger.warn({ err }, "[alert-worker] Lightning Round completion notices failed; will retry");
  }
}

async function sendLightningRoundPreparationReminder(reminder: LightningRoundReminderPush) {
  const pushRes = await sendExpoPushRequest({
    to: reminder.pushToken,
    title: "Lightning Round order prep is open",
    body: "You can now prepare market orders for the upcoming Lightning Round.",
    sound: "default",
    priority: "high",
    channelId: "paper-event-reminders",
    collapseId: `lightning-prep-${reminder.eventId}-${reminder.installationId}`,
    data: {
      type: "lightning-round-preparation",
      eventId: reminder.eventId,
      eventStartAtMs: reminder.eventStartAtMs,
    },
  });
  const body = await pushRes.json().catch(() => null);
  const result = classifyExpoPushResponse(
    pushRes.ok,
    Array.isArray((body as any)?.data) ? body : { data: [] },
  );
  return {
    accepted: result.accepted,
    ...(result.permanentFailure ? { permanentFailure: true } : {}),
    ...(result.uncertain ? { uncertain: true } : {}),
  };
}

async function sendDueLightningRoundPreparationReminders(): Promise<void> {
  try {
    const stats = await runLightningRoundReminderCycle(
      pool,
      sendLightningRoundPreparationReminder,
    );
    if (stats.due > 0) {
      logger.info({ ...stats }, "[alert-worker] Lightning Round preparation reminders processed");
    }
  } catch (err) {
    logger.warn({ err }, "[alert-worker] Lightning Round preparation reminders failed; will retry");
  }
}

async function main(): Promise<void> {
  logger.info("[alert-worker] starting");

  // Bind health port so the process is detectable by the artifact system.
  const port = Number(process.env.PORT ?? 0);
  if (port > 0) startHealthServer(port);

  await waitForSchema();

  // Arm precise start-time executions as soon as the worker is ready. The
  // regular cycle below remains a recovery path for missed timers/restarts.
  await prepareScheduledLightningRounds();

  // Initial alert check 30 s after boot, then every 5 minutes.
  await sleep(30_000);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    await prepareScheduledLightningRounds();
    await sendDueLightningRoundPreparationReminders();
    await executeDueLightningRoundOrders();
    await sendDueLightningRoundCompletionNotices();
    await runEventArenaCleanupIfDue();
    await runAlertCheck();
    await sleep(CHECK_INTERVAL_MS);
  }
}

main().catch((err) => {
  logger.error({ err }, "[alert-worker] fatal error — exiting");
  process.exit(1);
});
