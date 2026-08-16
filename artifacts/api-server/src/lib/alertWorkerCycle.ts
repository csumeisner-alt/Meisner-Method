/**
 * Alert-worker check-cycle logic extracted from alert-worker.ts.
 *
 * Kept free of process-level imports (logger, child_process, http) so it can
 * be imported cleanly in integration tests via
 * `node --experimental-strip-types` without resolving compiled `.js` stubs.
 *
 * alert-worker.ts delegates to runAlertCheckCycle; tests import it directly.
 */

import pg from "pg";
import {
  processPendingAlerts,
  type PendingAlert,
  type AlertPushRequest,
  type PushSendResult,
  type AlertCheckStats,
} from "./alertLogic.ts";

export type { AlertCheckStats };

export interface AlertCycleDeps {
  /** Returns the current price for a symbol, or null if unavailable. */
  fetchPrice: (symbol: string) => Promise<number | null>;
  /** Sends a push notification and classifies the outcome. */
  sendPush: (alert: PendingAlert, price: number) => Promise<PushSendResult>;
  /** Sends a same-cycle batch and returns one result per alert ID. */
  sendPushBatch?: (
    requests: AlertPushRequest[],
  ) => Promise<Map<string, PushSendResult>>;
}

/**
 * Pending-alert SQL used by the worker.
 *
 * Exported so tests can assert the query is being exercised end-to-end — any
 * change that breaks the JOIN or WHERE predicates will be caught by the
 * integration suite without requiring a live worker process.
 */
export const PENDING_ALERTS_QUERY = `
  SELECT a.id, a.user_id, a.installation_id, a.symbol, a.direction, a.target_price,
         COALESCE(d.expo_push_token, a.push_token) AS push_token
  FROM price_alerts a
  LEFT JOIN user_prefs p ON p.user_id = a.user_id
  LEFT JOIN push_devices d ON d.installation_id = a.installation_id
  WHERE a.fired_at IS NULL
    AND COALESCE(p.notifications_enabled, TRUE)
    AND COALESCE(d.enabled, TRUE)
    AND COALESCE(d.expo_push_token, a.push_token) IS NOT NULL
`;

export interface AlertCycleOptions {
  /**
   * Restrict the cycle to only these alert IDs.
   *
   * Used exclusively in integration tests to prevent the cycle from touching
   * real user alerts when running against a shared / production DATABASE_URL.
   * The live worker never sets this — it processes all eligible alerts.
   */
  scopeToIds?: string[];
}

/**
 * Run one alert-check cycle against the given DB pool.
 *
 * Executes the full worker path:
 *   1. Queries pending alerts via the worker SQL (JOINs included).
 *   2. Maps rows to PendingAlert objects.
 *   3. Calls processPendingAlerts with the injected price/push deps.
 *   4. Stamps fired_at via a real UPDATE when an alert fires.
 *
 * Tests supply a real pool (exercising the actual SQL) with stubbed
 * price-fetch and push-send to avoid network calls. Pass `scopeToIds`
 * to restrict the query to specific test-owned alert IDs so the cycle
 * cannot touch unrelated alerts in a shared database.
 */
export async function runAlertCheckCycle(
  dbPool: InstanceType<typeof pg.Pool>,
  deps: AlertCycleDeps,
  opts: AlertCycleOptions = {},
): Promise<AlertCheckStats> {
  // Append an ID restriction only when explicitly requested (tests only).
  // The extra predicate is additive and does not alter the base worker logic.
  const scopeClause =
    opts.scopeToIds && opts.scopeToIds.length > 0
      ? ` AND a.id = ANY($1)`
      : "";
  const queryParams = opts.scopeToIds && opts.scopeToIds.length > 0
    ? [opts.scopeToIds]
    : [];

  const { rows } = await dbPool.query(
    PENDING_ALERTS_QUERY + scopeClause,
    queryParams,
  );

  const pending: PendingAlert[] = rows.map((r: any) => ({
    id: r.id,
    userId: r.user_id,
    symbol: r.symbol,
    direction: r.direction,
    targetPrice: Number(r.target_price),
    pushToken: r.push_token,
  }));

  return processPendingAlerts(pending, {
    fetchPrice: deps.fetchPrice,
    sendPush: deps.sendPush,
    sendPushBatch: deps.sendPushBatch,
    markFired: async (id) => {
      await dbPool.query("UPDATE price_alerts SET fired_at=NOW() WHERE id=$1", [id]);
    },
  });
}
