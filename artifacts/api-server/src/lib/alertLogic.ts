/**
 * Pure, dependency-injected price-alert pipeline logic.
 * Kept free of pg/express imports so it can be unit-tested with Node's
 * built-in test runner (type-stripping), mirroring the mobile lib pattern.
 */

export type AlertDirection = "above" | "below";

export interface PendingAlert {
  id: string;
  userId: string;
  symbol: string;
  direction: AlertDirection;
  targetPrice: number;
  pushToken: string;
}

export interface PushSendResult {
  /** Expo accepted the message for delivery. */
  accepted: boolean;
  /** Failure that will never succeed on retry (e.g. DeviceNotRegistered). */
  permanentFailure: boolean;
}

export interface AlertPushRequest {
  alert: PendingAlert;
  currentPrice: number;
}

export interface AlertCheckDeps {
  /** Returns the current price for a symbol, or null if unavailable. */
  fetchPrice: (symbol: string) => Promise<number | null>;
  /** Sends the push notification; classifies the outcome. */
  sendPush: (alert: PendingAlert, currentPrice: number) => Promise<PushSendResult>;
  /**
   * Optional batch sender for providers that support multiple messages in one
   * request. Results must be keyed by alert ID so each ticket is handled
   * independently.
   */
  sendPushBatch?: (
    requests: AlertPushRequest[],
  ) => Promise<Map<string, PushSendResult>>;
  /** Marks the alert as fired (sets fired_at) — must be idempotent. */
  markFired: (alertId: string) => Promise<void>;
}

export interface AlertCheckStats {
  checked: number;
  triggered: number;
  delivered: number;
  firedPermanentFailure: number;
  retriedTransient: number;
  skippedNoPrice: number;
}

/** True when the current price crosses the alert threshold. */
export function isAlertTriggered(
  direction: AlertDirection,
  targetPrice: number,
  currentPrice: number,
): boolean {
  return direction === "above" ? currentPrice >= targetPrice : currentPrice <= targetPrice;
}

/**
 * Classify an Expo Push API response.
 * Expo returns HTTP 200 even for invalid tokens; the per-message ticket in the
 * body carries the real outcome. DeviceNotRegistered is permanent — retrying
 * forever would loop, so callers should mark those alerts fired.
 */
export function classifyExpoPushResponse(
  httpOk: boolean,
  body: unknown,
  ticketIndex = 0,
): PushSendResult {
  if (!httpOk) return { accepted: false, permanentFailure: false };
  const ticket = (body as any)?.data;
  // Expo may return a single ticket object or an array of tickets. For a
  // batch, use the ticket at the same index as the submitted message.
  const t = Array.isArray(ticket) ? ticket[ticketIndex] : ticket;
  // A missing/malformed ticket is NOT proof of acceptance — treat as transient
  // so the alert retries rather than being silently dropped.
  if (!t || typeof t !== "object") return { accepted: false, permanentFailure: false };
  if (t.status === "ok") return { accepted: true, permanentFailure: false };
  const errCode = t.details?.error;
  if (errCode === "DeviceNotRegistered") return { accepted: false, permanentFailure: true };
  // Other ticket errors (MessageRateExceeded, etc.) are worth retrying.
  return { accepted: false, permanentFailure: false };
}

/**
 * Process all pending alerts for one check cycle.
 * - Prices fetched once per unique symbol.
 * - An alert is marked fired only when Expo confirmed acceptance, OR the
 *   failure is permanent (dead token) — transient failures retry next cycle.
 */
export async function processPendingAlerts(
  alerts: PendingAlert[],
  deps: AlertCheckDeps,
): Promise<AlertCheckStats> {
  const stats: AlertCheckStats = {
    checked: alerts.length,
    triggered: 0,
    delivered: 0,
    firedPermanentFailure: 0,
    retriedTransient: 0,
    skippedNoPrice: 0,
  };
  if (!alerts.length) return stats;

  const symbols = [...new Set(alerts.map((a) => a.symbol))];
  const prices = new Map<string, number>();
  // Keep provider calls sequential. Some quote providers throttle or reject
  // a burst of subprocess requests even though each request works alone.
  // A failed quote must not make every alert in the same cycle disappear.
  for (const sym of symbols) {
    const p = await deps.fetchPrice(sym);
    if (p != null) prices.set(sym, p);
  }

  const triggered: AlertPushRequest[] = [];
  for (const alert of alerts) {
    const price = prices.get(alert.symbol);
    if (price == null) {
      stats.skippedNoPrice++;
      continue;
    }
    if (!isAlertTriggered(alert.direction, alert.targetPrice, price)) continue;
    stats.triggered++;
    triggered.push({ alert, currentPrice: price });
  }

  let batchResults: Map<string, PushSendResult> | null = null;
  if (deps.sendPushBatch && triggered.length > 0) {
    try {
      batchResults = await deps.sendPushBatch(triggered);
    } catch {
      batchResults = new Map();
    }
  }

  // Handle each ticket independently. A batch can contain one successful
  // message and one retryable failure; never let the first result determine
  // what happens to the rest of the alerts.
  for (const request of triggered) {
    const { alert, currentPrice } = request;
    let result: PushSendResult;
    if (batchResults) {
      result = batchResults.get(alert.id) ?? {
        accepted: false,
        permanentFailure: false,
      };
    } else {
      try {
        result = await deps.sendPush(alert, currentPrice);
      } catch {
        result = { accepted: false, permanentFailure: false };
      }
    }

    if (result.accepted) {
      await deps.markFired(alert.id);
      stats.delivered++;
    } else if (result.permanentFailure) {
      // Dead token — mark fired so we don't retry forever.
      await deps.markFired(alert.id);
      stats.firedPermanentFailure++;
    } else {
      stats.retriedTransient++;
    }
  }

  return stats;
}
