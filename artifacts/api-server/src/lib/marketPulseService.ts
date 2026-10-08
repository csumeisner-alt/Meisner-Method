import {
  isMarketPulseResponse,
  type MarketPulseResponse,
} from "./marketPulse.ts";

export interface MarketPulseStore {
  read(): Promise<MarketPulseResponse | null>;
  write(data: MarketPulseResponse): Promise<void>;
}

interface MarketPulseServiceOptions {
  fetchSnapshot: () => Promise<unknown>;
  store: MarketPulseStore;
  now?: () => number;
  onRestored?: (data: MarketPulseResponse) => void;
  onRestoreFailure?: (err: unknown) => void;
  onRefreshFailure?: (err: unknown) => void;
  onPersistFailure?: (err: unknown) => void;
  onWarmed?: (data: MarketPulseResponse, elapsedMs: number) => void;
}

const MARKET_PULSE_TTL = 60 * 1000;

export function createMarketPulseService({
  fetchSnapshot,
  store,
  now = Date.now,
  onRestored,
  onRestoreFailure,
  onRefreshFailure,
  onPersistFailure,
  onWarmed,
}: MarketPulseServiceOptions) {
  let cache: { data: MarketPulseResponse; ts: number } | null = null;
  let refreshRequest: Promise<MarketPulseResponse> | null = null;
  let restoreRequest: Promise<void> | null = null;

  function refresh(logFailure: boolean): Promise<MarketPulseResponse> {
    if (refreshRequest) return refreshRequest;
    const request = (async () => {
      const raw = await fetchSnapshot();
      if (!isMarketPulseResponse(raw)) {
        throw new Error("Market data provider returned an invalid market-pulse response");
      }
      cache = { data: raw, ts: now() };
      try {
        await store.write(raw);
      } catch (err) {
        onPersistFailure?.(err);
      }
      return raw;
    })();
    refreshRequest = request;
    void request.then(
      () => {
        if (refreshRequest === request) refreshRequest = null;
      },
      (err: unknown) => {
        if (refreshRequest === request) refreshRequest = null;
        if (logFailure) onRefreshFailure?.(err);
      },
    );
    return request;
  }

  function restore(): Promise<void> {
    if (restoreRequest) return restoreRequest;
    let request: Promise<void>;
    request = store.read()
      .then((data) => {
        if (data && !cache) {
          // Make restored data eligible for refresh without changing its
          // provider timestamps; a restart must not make an old quote look new.
          cache = { data, ts: now() - MARKET_PULSE_TTL - 1 };
          onRestored?.(data);
        }
      })
      .catch((err: unknown) => {
        onRestoreFailure?.(err);
        if (restoreRequest === request) restoreRequest = null;
      });
    restoreRequest = request;
    return request;
  }

  async function getSnapshot(): Promise<MarketPulseResponse> {
    await restore();
    if (cache) {
      if (now() - cache.ts >= MARKET_PULSE_TTL && !refreshRequest) {
        void refresh(true).catch(() => {});
      }
      return cache.data;
    }
    if (refreshRequest) return refreshRequest;
    return refresh(false);
  }

  async function warm(): Promise<void> {
    const startedAt = now();
    await restore();
    try {
      const data = await refresh(true);
      onWarmed?.(data, now() - startedAt);
    } catch {
      // Startup must continue when Yahoo is unavailable. Any restored
      // snapshot remains available to getSnapshot().
    }
  }

  return { getSnapshot, warm };
}

export type MarketPulseService = ReturnType<typeof createMarketPulseService>;
