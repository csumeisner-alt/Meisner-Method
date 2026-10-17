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

  validationRequests: string[];

  validationResponses: ({ type: "resolve"; symbol?: string } | { type: "reject" })[];

  setValidationResponses: (responses: ({ type: "resolve"; symbol?: string } | { type: "reject" })[]) => void;

  stockSearchSuggestionsByQuery: Record<string, { symbol: string; name: string; exchange: string }[]>;

  setStockSearchSuggestions: (query: string, suggestions: { symbol: string; name: string; exchange: string }[]) => void;

  detailRequests: string[];

  detailRequestSignals: { url: string; signal: AbortSignal | null }[];

  detailResponses: ({ type: "reject" } | { type: "resolve"; payload: unknown } | { type: "defer" } | { type: "late" } | { type: "stall" })[];

  pendingDetailRequests: {
    url: string;
    signal: AbortSignal | null;
    resolve: (payload: unknown) => void;
    reject: (error: Error) => void;

  }[];

  refetchFailuresRemaining: number;

  nextRefetchResponse: HeatMapBrowserResponse | null;

  deferNextRefetch: boolean;

  pendingRefetchResolvers: ((result: { isError: boolean; data: HeatMapBrowserResponse | null }) => void)[];

  cryptoSupplyHistoryOverrides: Record<string, { type: "pending" } | { type: "resolve"; payload: unknown } | { type: "reject" }>;

  listeners: Set<() => void>;

  setResponse: (response: HeatMapBrowserResponse | null) => void;

  setDetailResponses: (responses: ({ type: "reject" } | { type: "resolve"; payload: unknown } | { type: "defer" } | { type: "late" } | { type: "stall" })[]) => void;

  setCryptoSupplyHistoryOverride: (symbol: string, response: { type: "pending" } | { type: "resolve"; payload: unknown } | { type: "reject" }, rangeDays?: number) => void;

  resolvePendingDetailRequest: (url: string, payload: unknown) => boolean;

  rejectPendingDetailRequest: (url: string) => boolean;

  setRefetchFailures: (count: number) => void;

  setNextRefetchResponse: (response: HeatMapBrowserResponse) => void;

  setDeferNextRefetch: () => void;

  resolvePendingRefetch: () => boolean;

  commodityDriverRequests: { symbol: string }[];

  commodityDriverSignals: { symbol: string; signal: AbortSignal }[];

  commodityDriverResponses: ({ type: "reject" } | { type: "resolve"; payload: unknown } | { type: "defer" } | { type: "stall" })[];

  pendingCommodityDriverRequests: {
    symbol: string;
    resolve: (payload: unknown) => void;
  }[];

  setCommodityDriverResponses: (responses: ({ type: "reject" } | { type: "resolve"; payload: unknown } | { type: "defer" } | { type: "stall" })[]) => void;

  resolvePendingCommodityDriverRequest: (symbol: string, payload: unknown) => boolean;

  cryptoSupplyHistoryData: Record<string, unknown>;

  cryptoSupplyHistoryRefetches: { symbol: string; rangeDays: number }[];
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
    validationRequests: [],
    validationResponses: [],
    stockSearchSuggestionsByQuery: {},
    detailRequests: [],
    detailRequestSignals: [],
    detailResponses: [],
    commodityDriverRequests: [],
    commodityDriverSignals: [],
    commodityDriverResponses: [],
    pendingCommodityDriverRequests: [],
    pendingDetailRequests: [],
    refetchFailuresRemaining: 0,
    nextRefetchResponse: null,
    deferNextRefetch: false,
    pendingRefetchResolvers: [],
    cryptoSupplyHistoryOverrides: {},
    cryptoSupplyHistoryData: {},
    cryptoSupplyHistoryRefetches: [],
    listeners: new Set(),
    setResponse(next) {
      state.data = next;
      state.listeners.forEach((listener) => listener());
    },
    setDetailResponses(responses) {
      state.detailResponses = [...responses];
    },
    setValidationResponses(responses) {
      state.validationResponses = [...responses];
    },
    setStockSearchSuggestions(query, suggestions) {
      state.stockSearchSuggestionsByQuery[query] = [...suggestions];
      state.listeners.forEach((listener) => listener());
    },
    setCommodityDriverResponses(responses) {
      state.commodityDriverResponses = [...responses];
    },
    resolvePendingCommodityDriverRequest(symbol, payload) {
      const pendingIndex = state.pendingCommodityDriverRequests.findIndex((request) => request.symbol === symbol);
      if (pendingIndex === -1) return false;
      const [pending] = state.pendingCommodityDriverRequests.splice(pendingIndex, 1);
      pending.resolve(payload);
      return true;
    },
    setCryptoSupplyHistoryOverride(symbol, response, rangeDays = 365) {
      state.cryptoSupplyHistoryOverrides[symbol] = response;
      if (response.type === "resolve") {
        state.cryptoSupplyHistoryData[`${symbol}:${rangeDays}`] = response.payload;
      }
      state.listeners.forEach((listener) => listener());
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
    setDeferNextRefetch() {
      state.deferNextRefetch = true;
    },
    resolvePendingRefetch() {
      const resolve = state.pendingRefetchResolvers.shift();
      if (!resolve) return false;
      if (state.nextRefetchResponse) {
        state.data = state.nextRefetchResponse;
        state.nextRefetchResponse = null;
        state.listeners.forEach((listener) => listener());
      }
      resolve({ isError: false, data: state.data });
      return true;
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
  return ["stock-symbol-search", params];
}

export function getSearchHeatMapInstrumentsQueryKey(params: { q: string; category: string }) {
  return ["heat-map-instrument-search", params];
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
        return { isError: true, data: state.data };
      }
      if (state.deferNextRefetch) {
        state.deferNextRefetch = false;
        return new Promise<{ isError: boolean; data: HeatMapBrowserResponse | null }>((resolve) => {
          state.pendingRefetchResolvers.push(resolve);
        });
      }
      if (state.nextRefetchResponse) {
        state.data = state.nextRefetchResponse;
        state.nextRefetchResponse = null;
        state.listeners.forEach((listener) => listener());
      }
      return { isError: false, data: state.data };
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
  rangeDays: number,
  options?: { query?: { enabled?: boolean } },
) {
  const state = initializeHeatMapBrowserState();
  const [, forceRender] = React.useReducer((value: number) => value + 1, 0);
  React.useEffect(() => {
    state.listeners.add(forceRender);
    return () => {
      state.listeners.delete(forceRender);
    };
  }, [state]);
  const override = state.cryptoSupplyHistoryOverrides[symbol];
  const queryKey = `${symbol}:${rangeDays}`;
  const historyDate = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
  const oldestDate = historyDate(3);
  const middleDate = historyDate(2);
  const latestDate = historyDate(0);
  const defaultData = {
    symbol,
    provider: "Coin Metrics",
    metric: "SplyCur",
    rangeDays,
    interval: "daily",
    startDate: oldestDate,
    endDate: latestDate,
    points: [
      { date: oldestDate, supply: 19_876_500 },
      { date: middleDate, supply: 19_876_543.123456 },
      { date: latestDate, supply: 19_876_600.5 },
    ],
  };
  const enabled = !!options?.query?.enabled;
  const data = enabled
    ? override?.type === "resolve"
      ? override.payload
      : state.cryptoSupplyHistoryData[queryKey]
        ?? (override?.type === "pending" || override?.type === "reject" ? undefined : defaultData)
    : undefined;
  return {
    data,
    isLoading: override?.type === "pending" && !data,
    isFetching: override?.type === "pending",
    isError: override?.type === "reject",
    refetch: async () => {
      state.cryptoSupplyHistoryRefetches.push({ symbol, rangeDays });
      return { isError: override?.type === "reject" };
    },
  };
}

export function getGetCryptoSupplyHistoryQueryKey(symbol: string, rangeDays: number) {
  return [`/api/stocks/crypto/${symbol}/supply-history/${rangeDays}`];
}

export function useSearchStockSymbols(params: { q: string }) {
  const state = initializeHeatMapBrowserState();
  const [, forceRender] = React.useReducer((value: number) => value + 1, 0);
  React.useEffect(() => {
    state.listeners.add(forceRender);
    return () => {
      state.listeners.delete(forceRender);
    };
  }, [state]);
  return {
    queryKey: getSearchStockSymbolsQueryKey(params),
    data: state.stockSearchSuggestionsByQuery[params.q] ?? [],
    isPlaceholderData: false,
    isFetching: false,
    isError: false,
    isSuccess: true,
  };
}

export function useSearchHeatMapInstruments(params: { q: string; category: string }) {
  return {
    queryKey: getSearchHeatMapInstrumentsQueryKey(params),
    data: [],
    isPlaceholderData: false,
    isFetching: false,
    isError: false,
    isSuccess: true,
  };
}

export function useValidateHeatMapSymbol() {
  const state = initializeHeatMapBrowserState();
  return {
    isPending: false,
    mutateAsync: async ({ data }: { data: { symbol: string } }) => {
      state.validationRequests.push(data.symbol);
      const response = state.validationResponses.shift();
      if (!response || response.type === "reject") throw new Error("Mock instrument validation failed.");
      return quote(response.symbol ?? data.symbol);
    },
  };
}
