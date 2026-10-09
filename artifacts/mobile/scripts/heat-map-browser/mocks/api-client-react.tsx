import React from "react";

export interface HeatMapBrowserQuote {
  symbol: string;
  name: string;
  price: number;
  priceChangePercent: number;
  returnPercent: number | null;
  returnBasis: "adjusted_total_return" | "price_return_proxy";
  returnUnavailableReason: string | null;
  historyStartDate: string | null;
  priceTimestamp: number | null;
  marketSession: "regular" | "pre_market" | "after_hours" | "closed" | "unknown";
  assetType: "stock" | "etf" | "commodity" | "future" | "cryptocurrency";
  sector: string | null;
  exchange: string | null;
  exchangeTimezone: string | null;
  marketCapUsd: number | null;
  annualizedVolatilityPercent: number | null;
  riskBand: "Conservative" | "Moderate Conservative" | "Moderate" | "Moderate Aggressive" | "Aggressive" | null;
}

export interface HeatMapBrowserResponse {
  category: string;
  period: string;
  requestedSector: string | null;
  updatedAt: number;
  quotes: HeatMapBrowserQuote[];
  unavailableSymbols: string[];
}

interface HeatMapBrowserState {
  data: HeatMapBrowserResponse | null;
  initialData: HeatMapBrowserResponse;
  breadthData: HeatMapBrowserResponse;
  requests: Record<string, unknown>[];
  refetches: Record<string, unknown>[];
  detailRequests: string[];
  detailResponses: ({ type: "reject" } | { type: "resolve"; payload: unknown } | { type: "defer" })[];
  pendingDetailRequests: {
    url: string;
    resolve: (payload: unknown) => void;
    reject: (error: Error) => void;
  }[];
  refetchFailuresRemaining: number;
  nextRefetchResponse: HeatMapBrowserResponse | null;
  listeners: Set<() => void>;
  setResponse: (response: HeatMapBrowserResponse | null) => void;
  setDetailResponses: (responses: ({ type: "reject" } | { type: "resolve"; payload: unknown } | { type: "defer" })[]) => void;
  resolvePendingDetailRequest: (url: string, payload: unknown) => boolean;
  rejectPendingDetailRequest: (url: string) => boolean;
  setRefetchFailures: (count: number) => void;
  setNextRefetchResponse: (response: HeatMapBrowserResponse) => void;
}

declare global {
  interface Window {
    __heatMapBrowserTest?: HeatMapBrowserState;
  }
}

function quote(
  symbol: string,
  overrides: Partial<HeatMapBrowserQuote> = {},
): HeatMapBrowserQuote {
  return {
    symbol,
    name: symbol,
    price: 123.45,
    priceChangePercent: 1.2,
    returnPercent: 2.5,
    returnBasis: "adjusted_total_return",
    returnUnavailableReason: null,
    historyStartDate: "2020-01-01",
    priceTimestamp: Date.now() / 1000,
    marketSession: "regular",
    assetType: "stock",
    sector: "Technology",
    exchange: "NASDAQ",
    exchangeTimezone: "America/New_York",
    marketCapUsd: 250_000_000_000,
    annualizedVolatilityPercent: 72,
    riskBand: "Aggressive",
    ...overrides,
  };
}

export function makeFilterTestQuotes(): HeatMapBrowserQuote[] {
  return [
    quote("MATCH"),
    quote("OTHER_CAP", { name: "Other Capital Inc.", marketCapUsd: 1_000_000_000, riskBand: "Moderate" }),
    quote("OTHER_SECTOR", { sector: "Financials" }),
    quote("OTHER_EXCHANGE", { exchange: "NYSE" }),
    quote("OTHER_RISK", { riskBand: "Conservative" }),
    quote("OTHER_COMBINATION", { marketCapUsd: 5_000_000_000, exchange: "NYSE", riskBand: "Moderate" }),
  ];
}

function response(
  category: string,
  period: string,
  quotes: HeatMapBrowserQuote[],
  requestedSector: string | null = null,
): HeatMapBrowserResponse {
  return {
    category,
    period,
    requestedSector,
    updatedAt: Date.now() / 1000,
    quotes,
    unavailableSymbols: [],
  };
}

export function initializeHeatMapBrowserState(): HeatMapBrowserState {
  if (window.__heatMapBrowserTest) return window.__heatMapBrowserTest;

  const initialData = response("stocks", "1d", makeFilterTestQuotes());
  const breadthData = response(
    "stocks",
    "1d",
    [
      ...initialData.quotes.map((item) => ({
        ...item,
        returnBasis: "price_return_proxy" as const,
        annualizedVolatilityPercent: null,
        riskBand: null,
      })),
      ...["HPE", "PURR", "UUUU", "SLB", "KLAC"].flatMap((symbol) => [
        quote(symbol, {
          returnBasis: "price_return_proxy",
          annualizedVolatilityPercent: null,
          riskBand: null,
        }),
        quote(symbol, {
          returnBasis: "price_return_proxy",
          annualizedVolatilityPercent: null,
          riskBand: null,
          sector: symbol === "HPE" ? "Financials" : "Technology",
          price: 321,
        }),
      ]),
    ],
  );
  const state: HeatMapBrowserState = {
    data: initialData,
    initialData,
    breadthData,
    requests: [],
    refetches: [],
    detailRequests: [],
    detailResponses: [],
    pendingDetailRequests: [],
    refetchFailuresRemaining: 0,
    nextRefetchResponse: null,
    listeners: new Set(),
    setResponse(next) {
      state.data = next;
      state.listeners.forEach((listener) => listener());
    },
    setDetailResponses(responses) {
      state.detailResponses = [...responses];
    },
    resolvePendingDetailRequest(url, payload) {
      const pendingIndex = state.pendingDetailRequests.findIndex((request) => request.url === url);
      if (pendingIndex === -1) return false;
      const [pending] = state.pendingDetailRequests.splice(pendingIndex, 1);
      pending.resolve(payload);
      return true;
    },
    rejectPendingDetailRequest(url) {
      const pendingIndex = state.pendingDetailRequests.findIndex((request) => request.url === url);
      if (pendingIndex === -1) return false;
      const [pending] = state.pendingDetailRequests.splice(pendingIndex, 1);
      pending.reject(new Error("Mock market statistics request failed."));
      return true;
    },
    setRefetchFailures(count) {
      state.refetchFailuresRemaining = count;
    },
    setNextRefetchResponse(next) {
      state.nextRefetchResponse = next;
    },
  };
  window.__heatMapBrowserTest = state;
  return state;
}

export function getGetMarketHeatMapQueryKey(params: Record<string, unknown>) {
  return ["market-heat-map", params];
}

export function getGetMarketBreadthQueryKey() {
  return ["market-breadth"];
}

export function getSearchStockSymbolsQueryKey(params: { q: string }) {
  return ["stock-symbol-search", params.q];
}

export function useGetMarketHeatMap(params: Record<string, unknown>) {
  const state = initializeHeatMapBrowserState();
  const [, forceRender] = React.useReducer((value: number) => value + 1, 0);
  const requestKey = JSON.stringify(params);

  React.useEffect(() => {
    state.requests.push(JSON.parse(requestKey) as Record<string, unknown>);
  }, [requestKey, state]);

  React.useEffect(() => {
    state.listeners.add(forceRender);
    return () => {
      state.listeners.delete(forceRender);
    };
  }, [state]);

  return {
    data: state.data,
    isLoading: state.data === null,
    isFetching: state.data === null,
    isRefetching: false,
    refetch: async () => {
      state.refetches.push(JSON.parse(requestKey) as Record<string, unknown>);
      if (state.refetchFailuresRemaining > 0) {
        state.refetchFailuresRemaining -= 1;
        return { isError: true };
      }
      if (state.nextRefetchResponse) {
        state.data = state.nextRefetchResponse;
        state.nextRefetchResponse = null;
        state.listeners.forEach((listener) => listener());
      }
      return { isError: false };
    },
  };
}

export function useGetMarketBreadth() {
  const state = initializeHeatMapBrowserState();
  const [, forceRender] = React.useReducer((value: number) => value + 1, 0);

  React.useEffect(() => {
    state.listeners.add(forceRender);
    return () => {
      state.listeners.delete(forceRender);
    };
  }, [state]);

  return {
    data: state.breadthData,
    isLoading: false,
    isError: false,
  };
}

export function useGetCryptoSupplyHistory(
  symbol: string,
  options?: { query?: { enabled?: boolean } },
) {
  return {
    data: options?.query?.enabled ? {
      symbol,
      provider: "Coin Metrics",
      metric: "SplyCur",
      rangeDays: 365,
      interval: "daily",
      startDate: null,
      endDate: null,
      points: [],
    } : undefined,
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: async () => ({ isError: false }),
  };
}

export function getGetCryptoSupplyHistoryQueryKey(symbol: string) {
  return [`/api/stocks/crypto/${symbol}/supply-history`];
}

export function useSearchStockSymbols() {
  return {
    queryKey: getSearchStockSymbolsQueryKey({ q: "" }),
    data: [],
    isPlaceholderData: false,
    isFetching: false,
    isError: false,
    isSuccess: true,
  };
}

export function useValidateHeatMapSymbol() {
  return { isPending: false, mutateAsync: async () => { throw new Error("Unused in this test."); } };
}