export const EXPO_PUSH_REQUEST_TIMEOUT_MS = 15_000;

export interface ExpoPushRequestOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Send one request to Expo with a finite lifetime, including response-body
 * consumption by the caller, so a stalled provider cannot hold an alert claim.
 */
export function sendExpoPushRequest(
  payload: unknown,
  {
    timeoutMs = EXPO_PUSH_REQUEST_TIMEOUT_MS,
    fetchImpl = fetch,
  }: ExpoPushRequestOptions = {},
): Promise<Response> {
  return fetchImpl("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
}
