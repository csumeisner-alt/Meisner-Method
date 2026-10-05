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
  data: HeatMapBrowserResponse;
  requests: Record<string, unknown>[];
  refetches: Record<string, unknown>[];
  listeners: Set<() => void>;
  setResponse: (response: HeatMapBrowserResponse) => void;
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
    quote("OTHER_CAP", { marketCapUsd: 1_000_000_000, riskBand: "Moderate" }),
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

  const state: HeatMapBrowserState = {
    data: response("stocks", "1d", makeFilterTestQuotes()),
    requests: [],
    refetches: [],
    listeners: new Set(),
    setResponse(next) {
      state.data = next;
      state.listeners.forEach((listener) => listener());
    },
  };
  window.__heatMapBrowserTest = state;
  return state;
}

export function getGetMarketHeatMapQueryKey(params: Record<string, unknown>) {
  return ["market-heat-map", params];
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
    isLoading: false,
    isRefetching: false,
    refetch: async () => {
      state.refetches.push(JSON.parse(requestKey) as Record<string, unknown>);
    },
  };
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