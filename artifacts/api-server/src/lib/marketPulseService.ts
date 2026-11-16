import {
  isMarketPulseResponse,
  type MarketPulseResponse,
} from "./marketPulse.ts";

export interface MarketPulseStore {
  read(): Promise<MarketPulseResponse | null>;
  write(data: MarketPulseResponse): Promise<MarketPulseResponse | null>;
}

export interface MarketPulseRefreshObservation {
  priceTimestamp: number;
  updatedAt: number;
  previousPriceTimestamp: number | null;
  quoteAgeSeconds: number;
  timestampAdvanced: boolean | null;
}

interface MarketPulseServiceOptions {
  fetchSnapshot: () => Promise<unknown>;
  store: MarketPulseStore;
  now?: () => number;
  random?: () => number;
  onRestored?: (data: MarketPulseResponse) => void;
  onRestoreFailure?: (err: unknown) => void;
  onRefreshFailure?: (err: unknown, consecutiveFailures: number) => void;
  onRefreshSuccess?: (observation: MarketPulseRefreshObservation) => void;
  onPersistFailure?: (err: unknown) => void;
  onWarmed?: (data: MarketPulseResponse, elapsedMs: number) => void;
}

const MARKET_PULSE_TTL = 60 * 1000;
const RETRY_BASE_DELAY_MS = 1_000;
const RETRY_MAX_DELAY_MS = 30 * 1000;

function retryDelay(failures: number, random: () => number): number {
  const maxDelay = Math.min(RETRY_BASE_DELAY_MS * 2 ** (failures - 1), RETRY_MAX_DELAY_MS);
  const minDelay = maxDelay / 2;
  const sample = Math.max(0, Math.min(1, random()));
  return minDelay + sample * (maxDelay - minDelay);
}

export function getMarketPulseErrorCategory(error: unknown): string {
  const value = error && typeof error === "object"
    ? error as { code?: unknown; name?: unknown; message?: unknown }
    : null;
  const code = typeof value?.code === "string" ? value.code.toUpperCase() : "";
  const message = typeof value?.message === "string" ? value.message : "";

  if (/TIMEOUT|TIMEDOUT/.test(code) || /timed?\s*out|timeout/i.test(message)) return "timeout";
  if (/^(ECONN|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH)/.test(code)
    || /network|connection|unreachable|fetch failed/i.test(message)) return "network";
  if (/invalid|malformed|json|parse/i.test(message)) return "invalid_response";
  if (/rate.?limit|too many requests|\b429\b/i.test(message)) return "rate_limited";
  if (typeof value?.name === "string" && value.name !== "Error") return value.name.slice(0, 64);
  return "provider_error";
}

export function createMarketPulseService({
  fetchSnapshot,
  store,
  now = Date.now,
  random = Math.random,
  onRestored,
  onRestoreFailure,
  onRefreshFailure,
  onRefreshSuccess,
  onPersistFailure,
  onWarmed,
}: MarketPulseServiceOptions) {
  let cache: { data: MarketPulseResponse; ts: number } | null = null;
  let refreshRequest: Promise<MarketPulseResponse> | null = null;
  let restoreRequest: Promise<void> | null = null;
  let refreshFailures = 0;
  let refreshRetryAt = 0;
  let lastRefreshError: unknown;
  let restoreFailures = 0;
  let restoreRetryAt = 0;

  function refresh(): Promise<MarketPulseResponse> {
    if (refreshRequest) return refreshRequest;
    if (now() < refreshRetryAt) {
      return Promise.reject(lastRefreshError ?? new Error("Market-pulse refresh is in backoff"));
    }
    const request = (async () => {
      const raw = await fetchSnapshot();
      if (!isMarketPulseResponse(raw)) {
        throw new Error("Market data provider returned an invalid market-pulse response");
      }
      const previousPriceTimestamp = cache?.data.priceTimestamp ?? null;
      const observation: MarketPulseRefreshObservation = {
        priceTimestamp: raw.priceTimestamp,
        updatedAt: raw.updatedAt,
        previousPriceTimestamp,
        quoteAgeSeconds: Math.max(0, Math.floor(now() / 1000) - raw.priceTimestamp),
        timestampAdvanced: previousPriceTimestamp === null
          ? null
          : raw.priceTimestamp > previousPriceTimestamp,
      };
      let snapshotToServe = raw;
      try {
        const persisted = await store.write(raw);
        if (isMarketPulseResponse(persisted)) snapshotToServe = persisted;
      } catch (err) {
        onPersistFailure?.(err);
      }

      // A refresh can finish after another instance has persisted a newer
      // quote. Keep this instance's snapshot monotonic as well.
      if (!cache || snapshotToServe.priceTimestamp >= cache.data.priceTimestamp) {
        cache = { data: snapshotToServe, ts: now() };
      }
      onRefreshSuccess?.(observation);
      return cache.data;
    })();
    refreshRequest = request;
    void request.then(
      () => {
        if (refreshRequest === request) refreshRequest = null;
        refreshFailures = 0;
        refreshRetryAt = 0;
        lastRefreshError = undefined;
      },
      (err: unknown) => {
        if (refreshRequest === request) refreshRequest = null;
        refreshFailures += 1;
        refreshRetryAt = now() + retryDelay(refreshFailures, random);
        lastRefreshError = err;
        onRefreshFailure?.(err, refreshFailures);
      },
    );
    return request;
  }

  function restore(): Promise<void> {
    if (restoreRequest) return restoreRequest;
    if (now() < restoreRetryAt) return Promise.resolve();
    let request: Promise<void>;
    request = store.read()
      .then((data) => {
        restoreFailures = 0;
        restoreRetryAt = 0;
        if (data && !cache) {
          // Make restored data eligible for refresh without changing its
          // provider timestamps; a restart must not make an old quote look new.
          cache = { data, ts: now() - MARKET_PULSE_TTL - 1 };
          onRestored?.(data);
        }
      })
      .catch((err: unknown) => {
        onRestoreFailure?.(err);
        restoreFailures += 1;
        restoreRetryAt = now() + retryDelay(restoreFailures, random);
        if (restoreRequest === request) restoreRequest = null;
      });
    restoreRequest = request;
    return request;
  }

  async function getSnapshot(): Promise<MarketPulseResponse> {
    await restore();
    if (cache) {
      if (now() - cache.ts >= MARKET_PULSE_TTL && !refreshRequest) {
        void refresh().catch(() => {});
      }
      return cache.data;
    }
    if (refreshRequest) return refreshRequest;
    return refresh();
  }

  async function warm(): Promise<void> {
    const startedAt = now();
    await restore();
    try {
      const data = await refresh();
      onWarmed?.(data, now() - startedAt);
    } catch {
      // Startup must continue when Yahoo is unavailable. Any restored
      // snapshot remains available to getSnapshot().
    }
  }

  return { getSnapshot, warm };
}

export type MarketPulseService = ReturnType<typeof createMarketPulseService>;
