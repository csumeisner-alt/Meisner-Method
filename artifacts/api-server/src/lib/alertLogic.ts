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
  /**
   * The request may have reached Expo, but no definitive ticket was received.
   * Do not retry automatically: a retry could create a duplicate notification.
   */
  uncertain?: boolean;
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
  /** Rechecks that the selected alert settings are still current before delivery. */
  isAlertActive?: (alertId: string, selectedAlert: PendingAlert) => Promise<boolean>;
  /**
   * Atomically claims an alert for delivery across all worker processes.
   * Returns an ownership token, or null when another worker owns the claim.
   */
  claimAlert?: (
    alertId: string,
    selectedAlert: PendingAlert,
  ) => Promise<string | null>;
  /** Persists the send boundary before a request can reach the provider. */
  beginDeliveryAttempt?: (alertId: string, claimToken: string) => Promise<boolean>;
  /** Releases a claim after a transient failure or a stale selection. */
  releaseAlertClaim?: (alertId: string, claimToken: string) => Promise<void>;
  /**
   * Marks the alert as fired only if its selected settings are still current.
   * Return false when the alert changed while delivery was in flight.
   */
  markFired: (
    alertId: string,
    selectedAlert: PendingAlert,
    claimToken?: string,
  ) => Promise<boolean | void>;
}

export interface AlertCheckStats {
  checked: number;
  triggered: number;
  delivered: number;
  firedPermanentFailure: number;
  retriedTransient: number;
  skippedNoPrice: number;
  skippedPaused: number;
  skippedClaimed: number;
  deliveryUncertain: number;
  finalizedUncertain: number;
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
  // An HTTP failure can happen after Expo has already accepted the request.
  if (!httpOk) return { accepted: false, permanentFailure: false, uncertain: true };
  const ticket = (body as any)?.data;
  // Expo may return a single ticket object or an array of tickets. For a
  // batch, use the ticket at the same index as the submitted message.
  const t = Array.isArray(ticket) ? ticket[ticketIndex] : ticket;
  // Without a per-message ticket, acceptance is unknown rather than rejected.
  if (!t || typeof t !== "object") {
    return { accepted: false, permanentFailure: false, uncertain: true };
  }
  if (t.status === "ok") return { accepted: true, permanentFailure: false };
  if (t.status !== "error") {
    return { accepted: false, permanentFailure: false, uncertain: true };
  }
  const errCode = t.details?.error;
  if (errCode === "DeviceNotRegistered") return { accepted: false, permanentFailure: true };
  // Other ticket errors (MessageRateExceeded, etc.) are worth retrying.
  return { accepted: false, permanentFailure: false };
}

/**
 * Process all pending alerts for one check cycle.
 * - Prices fetched once per unique symbol.
 * - Explicit ticket rejections retry; ambiguous provider outcomes are held and
 *   finalized without resending after the delivery lease expires.
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
    skippedPaused: 0,
    skippedClaimed: 0,
    deliveryUncertain: 0,
    finalizedUncertain: 0,
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

  let requestsToProcess = triggered;
  const claimTokens = new Map<string, string | undefined>();
  let batchResults: Map<string, PushSendResult> | null = null;
  if (deps.sendPushBatch && triggered.length > 0) {
    requestsToProcess = [];
    for (const request of triggered) {
      if (
        deps.isAlertActive
        && !(await deps.isAlertActive(request.alert.id, request.alert))
      ) {
        stats.skippedPaused++;
        continue;
      }
      const claimToken = deps.claimAlert
        ? await deps.claimAlert(request.alert.id, request.alert)
        : undefined;
      if (deps.claimAlert && !claimToken) {
        stats.skippedClaimed++;
        continue;
      }
      if (
        claimToken
        && deps.beginDeliveryAttempt
        && !(await deps.beginDeliveryAttempt(request.alert.id, claimToken))
      ) {
        await deps.releaseAlertClaim?.(request.alert.id, claimToken);
        stats.skippedClaimed++;
        continue;
      }
      claimTokens.set(request.alert.id, claimToken ?? undefined);
      requestsToProcess.push(request);
    }
    try {
      if (requestsToProcess.length > 0) {
        batchResults = await deps.sendPushBatch(requestsToProcess);
      }
    } catch {
      batchResults = new Map();
    }
  }

  // Handle each ticket independently. A batch can contain one successful
  // message and one retryable failure; never let the first result determine
  // what happens to the rest of the alerts.
  for (const request of requestsToProcess) {
    const { alert, currentPrice } = request;
    let result: PushSendResult;
    if (batchResults) {
      result = batchResults.get(alert.id) ?? {
        accepted: false,
        permanentFailure: false,
        uncertain: true,
      };
    } else {
      if (deps.isAlertActive && !(await deps.isAlertActive(alert.id, alert))) {
        stats.skippedPaused++;
        continue;
      }
      const claimToken = deps.claimAlert
        ? await deps.claimAlert(alert.id, alert)
        : undefined;
      if (deps.claimAlert && !claimToken) {
        stats.skippedClaimed++;
        continue;
      }
      if (
        claimToken
        && deps.beginDeliveryAttempt
        && !(await deps.beginDeliveryAttempt(alert.id, claimToken))
      ) {
        await deps.releaseAlertClaim?.(alert.id, claimToken);
        stats.skippedClaimed++;
        continue;
      }
      claimTokens.set(alert.id, claimToken ?? undefined);
      try {
        result = await deps.sendPush(alert, currentPrice);
      } catch {
        result = { accepted: false, permanentFailure: false, uncertain: true };
      }
    }

    if (result.accepted) {
      const marked = await deps.markFired(
        alert.id,
        alert,
        claimTokens.get(alert.id),
      );
      if (marked === false) {
        // The provider accepted the notification. Keep its durable attempt
        // marker so a changed/deleted DB state cannot make this send replay.
        stats.skippedPaused++;
        continue;
      }
      stats.delivered++;
    } else if (result.permanentFailure) {
      // Dead token — mark fired so we don't retry forever.
      const marked = await deps.markFired(
        alert.id,
        alert,
        claimTokens.get(alert.id),
      );
      if (marked === false) {
        const claimToken = claimTokens.get(alert.id);
        if (claimToken) {
          await deps.releaseAlertClaim?.(alert.id, claimToken);
        }
        stats.skippedPaused++;
        continue;
      }
      stats.firedPermanentFailure++;
    } else if (result.uncertain) {
      // Keep the claim and durable attempt marker. Once the claim expires, the
      // cycle finalizes it without sending again (at-most-once over at-least-once).
      stats.deliveryUncertain++;
    } else {
      const claimToken = claimTokens.get(alert.id);
      if (claimToken) {
        await deps.releaseAlertClaim?.(alert.id, claimToken);
      }
      stats.retriedTransient++;
    }
  }

  return stats;
}
