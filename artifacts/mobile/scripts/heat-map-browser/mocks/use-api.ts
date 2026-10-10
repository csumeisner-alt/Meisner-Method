import { initializeHeatMapBrowserState } from "./api-client-react";

async function mockApiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  if (url.startsWith("/api/stocks/info/")) {
    const state = initializeHeatMapBrowserState();
    state.detailRequests.push(url);
    const signal = options?.signal ?? null;
    state.detailRequestSignals.push({ url, signal });
    const response = state.detailResponses.shift();
    if (response?.type === "reject") throw new Error("Mock market statistics request failed.");
    if (response?.type === "resolve") return response.payload as T;
    if (response?.type === "stall") return new Promise<T>(() => {});
    if (response?.type === "defer") {
      return new Promise<T>((resolve, reject) => {
        let abort = () => {};
        const pending = {
          url,
          signal,
          resolve: (payload: unknown) => {
            signal?.removeEventListener("abort", abort);
            resolve(payload as T);
          },
          reject: (error: Error) => {
            signal?.removeEventListener("abort", abort);
            reject(error);
          },
        };
        abort = () => {
          const pendingIndex = state.pendingDetailRequests.indexOf(pending);
          if (pendingIndex !== -1) state.pendingDetailRequests.splice(pendingIndex, 1);
          pending.reject(new DOMException("The operation was aborted.", "AbortError"));
        };
        if (signal?.aborted) {
          abort();
          return;
        }
        signal?.addEventListener("abort", abort, { once: true });
        state.pendingDetailRequests.push(pending);
      });
    }
  }

  return {
    previousClose: 122,
    open: 123,
    dayLow: 120,
    dayHigh: 126,
    fiftyTwoWeekLow: 90,
    fiftyTwoWeekHigh: 140,
    volume: 1_000_000,
    averageVolume3Month: 800_000,
    marketCap: 250_000_000_000,
    beta: 1.21,
    earningsTimestamp: Date.parse("2030-06-12T00:00:00Z") / 1000,
    targetMeanPrice: 135,
    trailingEps: 6.21,
    totalRevenue: 30_000_000_000,
    circulatingSupply: 21_000_000,
  } as T;
}

export function useApi() {
  return { apiFetch: mockApiFetch };
}
