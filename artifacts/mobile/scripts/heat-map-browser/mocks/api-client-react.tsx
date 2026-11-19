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

  quoteRequests: string[];

  validationRequests: string[];

  validationResponses: (
    | { type: "resolve"; symbol?: string }
    | { type: "reject"; error?: string; message?: string }
  )[];

  setValidationResponses: (responses: (
    | { type: "resolve"; symbol?: string }
    | { type: "reject"; error?: string; message?: string }
  )[]) => void;

  stockSearchSuggestionsByQuery: Record<string, { symbol: string; name: string; exchange: string }[]>;

  setStockSearchSuggestions: (query: string, suggestions: { symbol: string; name: string; exchange: string }[]) => void;

  detailRequests: string[];

  detailRequestSignals: { url: string; signal: AbortSignal | null }[];

  detailEndpointRequests: string[];

  detailResponses: ({ type: "reject" } | { type: "resolve"; payload: unknown } | { type: "defer" } | { type: "late" } | { type: "stall" })[];

  detailSectionResponses: Record<string, ({ type: "reject" } | { type: "resolve"; payload: unknown })[]>;

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

  setDetailSectionResponses: (
    section: "etf-fund-data" | "etf-history-fit",
    responses: ({ type: "reject" } | { type: "resolve"; payload: unknown })[],
  ) => void;

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
    quoteRequests: [],
    validationRequests: [],
    validationResponses: [],
    stockSearchSuggestionsByQuery: {},
    detailRequests: [],
    detailRequestSignals: [],
    detailEndpointRequests: [],
    detailResponses: [],
    detailSectionResponses: {},
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
    setDetailSectionResponses(section, responses) {
      state.detailSectionResponses[section] = [...responses];
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

const heatMapDetailQueryCache = new Map<string, { data: unknown; expiresAt: number }>();

function detailInstrumentationUrl(url: string) {
  const summaryMatch = url.match(/\/stocks\/heat-map\/detail\/([^/]+)\/summary$/);
  return summaryMatch ? `/api/stocks/info/${summaryMatch[1]}` : url;
}

export async function mockHeatMapDetailFetch<T>(
  url: string,
  signal: AbortSignal | null = null,
): Promise<T> {
  const state = initializeHeatMapBrowserState();
  const summarySymbol = url.match(/\/stocks\/heat-map\/detail\/([^/]+)\/summary$/)?.[1];
  const isSummary = summarySymbol !== undefined
    || url.startsWith("/api/stocks/info/");
  if (isSummary) {
    const instrumentUrl = detailInstrumentationUrl(url);
    state.detailRequests.push(instrumentUrl);
    state.detailRequestSignals.push({ url: instrumentUrl, signal });
    const response = state.detailResponses.shift();
    if (response?.type === "reject") throw new Error("Mock market statistics request failed.");
    if (response?.type === "resolve") return response.payload as T;
    if (response?.type === "stall") {
      return new Promise<T>((_resolve, reject) => {
        const abort = () => reject(new DOMException("The operation was aborted.", "AbortError"));
        if (signal?.aborted) {
          abort();
          return;
        }
        signal?.addEventListener("abort", abort, { once: true });
      });
    }
    if (response?.type === "defer" || response?.type === "late") {
      return new Promise<T>((resolve, reject) => {
        let abort = () => {};
        const pending = {
          url: instrumentUrl,
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
        if (response.type === "defer") {
          if (signal?.aborted) {
            abort();
            return;
          }
          signal?.addEventListener("abort", abort, { once: true });
        }
        state.pendingDetailRequests.push(pending);
      });
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
      currentPrice: 123,
      maxSupplyStatus: "unreported",
      etfProfile: state.data?.quotes.find((item) => item.symbol === summarySymbol)?.assetType === "etf"
        ? {
            fundCategory: "Large Blend",
            fundFamily: "Test Funds",
            expenseRatio: null,
            totalAssets: null,
            dividendYield: null,
            beta3Year: null,
            largestSector: null,
            largestSectorWeight: null,
            sectorWeights: [],
            sectorWeightsRetrievedAt: null,
            topHoldings: [],
            topHoldingsReportedCount: 0,
            topHoldingsRetrievedAt: null,
            marketRegime: null,
          }
        : null,
    } as T;
  }

  state.detailEndpointRequests.push(url);
  const symbol = url.match(/\/detail\/([^/]+)\//)?.[1] ?? "";
  const section = url.endsWith("/etf-fund-data") ? "etf-fund-data" : "etf-history-fit";
  const sectionResponse = state.detailSectionResponses[section]?.shift();
  if (sectionResponse?.type === "reject") throw new Error(`Mock ${section} request failed.`);
  if (sectionResponse?.type === "resolve") return sectionResponse.payload as T;
  if (url.endsWith("/etf-fund-data")) {
    return {
      symbol,
      status: "not_reported",
      sectorWeights: [],
      sectorWeightsRetrievedAt: null,
      topHoldings: [],
      topHoldingsReportedCount: 0,
      topHoldingsRetrievedAt: null,
      largestSector: null,
      largestSectorWeight: null,
    } as T;
  }
  return { symbol, status: "not_reported", marketRegime: null } as T;
}

type MockDetailQueryOptions = {
  query?: {
    enabled?: boolean;
    staleTime?: number;
    queryKey?: unknown;
    queryFn?: (context: { signal: AbortSignal }) => Promise<unknown>;
  };
};

function useHeatMapDetailQuery<T>(
  symbol: string,
  section: "summary" | "etf-fund-data" | "etf-history-fit",
  options?: MockDetailQueryOptions,
) {
  const url = `/api/stocks/heat-map/detail/${symbol}/${section}`;
  const enabled = options?.query?.enabled === true && symbol.length > 0;
  const staleTime = options?.query?.staleTime ?? 30_000;
  const [snapshot, setSnapshot] = React.useState<{
    key: string;
    data?: T;
    isFetching: boolean;
    isError: boolean;
  }>({ key: url, isFetching: enabled, isError: false });
  const controllerRef = React.useRef<AbortController | null>(null);
  const queryFnRef = React.useRef(options?.query?.queryFn);
  const [, forceRender] = React.useReducer((value: number) => value + 1, 0);
  React.useEffect(() => {
    queryFnRef.current = options?.query?.queryFn;
  }, [options?.query?.queryFn]);

  React.useEffect(() => {
    const state = initializeHeatMapBrowserState();
    state.listeners.add(forceRender);
    return () => {
      state.listeners.delete(forceRender);
    };
  }, []);

  const run = React.useCallback(async (force = false) => {
    if (!enabled) return { isError: false, data: undefined };
    const cached = heatMapDetailQueryCache.get(url);
    if (!force && cached && cached.expiresAt > Date.now()) {
      setSnapshot({ key: url, data: cached.data as T, isFetching: false, isError: false });
      return { isError: false, data: cached.data as T };
    }
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setSnapshot((current) => ({
      key: url,
      data: current.key === url
        ? current.data
        : heatMapDetailQueryCache.get(url)?.data as T | undefined,
      isFetching: true,
      isError: false,
    }));
    try {
      const data = queryFnRef.current
        ? await queryFnRef.current({ signal: controller.signal }) as T
        : await mockHeatMapDetailFetch<T>(url, controller.signal);
      if (controller.signal.aborted) return { isError: false, data: undefined };
      heatMapDetailQueryCache.set(url, { data, expiresAt: Date.now() + staleTime });
      setSnapshot({ key: url, data, isFetching: false, isError: false });
      return { isError: false, data };
    } catch {
      if (!controller.signal.aborted) {
        setSnapshot((current) => ({
          key: url,
          data: current.key === url
            ? current.data
            : heatMapDetailQueryCache.get(url)?.data as T | undefined,
          isFetching: false,
          isError: true,
        }));
      }
      return { isError: !controller.signal.aborted, data: undefined };
    }
  }, [enabled, staleTime, url]);

  React.useEffect(() => {
    if (enabled) void run();
    return () => {
      controllerRef.current?.abort();
    };
  }, [enabled, run]);

  const current = snapshot.key === url
    ? snapshot
    : {
        key: url,
        data: heatMapDetailQueryCache.get(url)?.data as T | undefined,
        isFetching: enabled,
        isError: false,
      };
  return {
    data: current.data,
    isLoading: current.isFetching && current.data === undefined,
    isFetching: current.isFetching,
    isError: current.isError,
    refetch: () => run(true),
  };
}

export function getGetHeatMapDetailSummaryQueryKey(symbol: string) {
  return [`/api/stocks/heat-map/detail/${symbol}/summary`];
}

export function getGetHeatMapDetailEtfFundDataQueryKey(symbol: string) {
  return [`/api/stocks/heat-map/detail/${symbol}/etf-fund-data`];
}

export function getGetHeatMapDetailEtfHistoryFitQueryKey(symbol: string) {
  return [`/api/stocks/heat-map/detail/${symbol}/etf-history-fit`];
}

export function getHeatMapDetailSummary(symbol: string, options?: RequestInit) {
  return mockHeatMapDetailFetch<Record<string, unknown>>(
    `/api/stocks/heat-map/detail/${symbol}/summary`,
    options?.signal ?? null,
  );
}

export function getHeatMapDetailEtfFundData(symbol: string, options?: RequestInit) {
  return mockHeatMapDetailFetch<Record<string, unknown>>(
    `/api/stocks/heat-map/detail/${symbol}/etf-fund-data`,
    options?.signal ?? null,
  );
}

export function getHeatMapDetailEtfHistoryFit(symbol: string, options?: RequestInit) {
  return mockHeatMapDetailFetch<Record<string, unknown>>(
    `/api/stocks/heat-map/detail/${symbol}/etf-history-fit`,
    options?.signal ?? null,
  );
}

export function useGetHeatMapDetailSummary(symbol: string, options?: MockDetailQueryOptions) {
  return useHeatMapDetailQuery<Record<string, unknown>>(symbol, "summary", options);
}

export function useGetHeatMapDetailEtfFundData(symbol: string, options?: MockDetailQueryOptions) {
  return useHeatMapDetailQuery<Record<string, any>>(symbol, "etf-fund-data", options);
}

export function useGetHeatMapDetailEtfHistoryFit(symbol: string, options?: MockDetailQueryOptions) {
  return useHeatMapDetailQuery<Record<string, any>>(symbol, "etf-history-fit", options);
}

export function getGetMarketHeatMapQueryKey(params: Record<string, unknown>) {
  return ["market-heat-map", params];
}

export async function getHeatMapQuote(symbol: string): Promise<HeatMapBrowserQuote> {
  const state = initializeHeatMapBrowserState();
  state.quoteRequests.push(symbol);
  if (state.refetchFailuresRemaining > 0) {
    state.refetchFailuresRemaining -= 1;
    throw new Error("Mock single-quote request failed.");
  }
  if (state.deferNextRefetch) {
    state.deferNextRefetch = false;
    return new Promise<HeatMapBrowserQuote>((resolve, reject) => {
      state.pendingRefetchResolvers.push((result) => {
        if (result.isError) {
          reject(new Error("Mock single-quote request failed."));
          return;
        }
        const quote = result.data?.quotes.find((item) => item.symbol.toUpperCase() === symbol.toUpperCase());
        if (!quote) {
          reject(new Error("Mock quote is unavailable."));
          return;
        }
        resolve(quote);
      });
    });
  }
  if (state.nextRefetchResponse) {
    state.data = state.nextRefetchResponse;
    state.nextRefetchResponse = null;
    state.listeners.forEach((listener) => listener());
  }
  const quote = state.data?.quotes.find((item) => item.symbol.toUpperCase() === symbol.toUpperCase());
  if (!quote) throw new Error("Mock quote is unavailable.");
  return quote;
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

export function useGetMarketHeatMap(
  params: Record<string, unknown>,
  options?: { query?: { queryKey?: unknown } },
) {
  const state = initializeHeatMapBrowserState();
  const [, forceRender] = React.useReducer((value: number) => value + 1, 0);
  const requestKey = JSON.stringify(params);
  const queryKey = JSON.stringify(options?.query?.queryKey ?? getGetMarketHeatMapQueryKey(params));

  React.useEffect(() => {
    state.requests.push(JSON.parse(requestKey) as Record<string, unknown>);
  }, [queryKey, state]);

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
      if (!response || response.type === "reject") {
        throw Object.assign(new Error("Mock instrument validation failed."), {
          data: {
            error: response?.type === "reject" ? response.error : undefined,
            message: response?.type === "reject" ? response.message : undefined,
          },
        });
      }
      return quote(response.symbol ?? data.symbol);
    },
  };
}
