import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "./async-storage";

const GUEST_CACHE_KEY = "@stocksense/watchlist_v1/__guest__";

declare global {
  interface Window {
    __heatMapWatchlistSymbols?: string[];
    __heatMapAddToWatchlist?: (symbol: string) => Promise<void>;
    __heatMapReorderWatchlist?: (symbols: string[]) => Promise<void>;
  }
}

export function useWatchlist() {
  const [symbols, setSymbols] = useState<string[]>([]);
  const symbolsRef = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(GUEST_CACHE_KEY).then((raw) => {
      if (cancelled || !raw) return;
      try {
        const cached = JSON.parse(raw) as Array<{ symbol?: unknown }>;
        const restored = cached
          .map((item) => item?.symbol)
          .filter((symbol): symbol is string => typeof symbol === "string");
        symbolsRef.current = restored;
        setSymbols(restored);
      } catch {
        // Invalid fixture data behaves like an empty local watchlist.
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const add = useCallback(async (symbol: string) => {
    if (symbolsRef.current.includes(symbol)) return;
    const next = [
      { symbol, createdAt: new Date().toISOString() },
      ...symbolsRef.current.map((existing) => ({ symbol: existing, createdAt: new Date().toISOString() })),
    ];
    symbolsRef.current = next.map((item) => item.symbol);
    setSymbols(symbolsRef.current);
    await AsyncStorage.setItem(GUEST_CACHE_KEY, JSON.stringify(next));
  }, []);

  const reorder = useCallback(async (orderedSymbols: string[]) => {
    const currentSymbols = symbolsRef.current;
    const uniqueOrder = orderedSymbols.filter(
      (symbol, index) => currentSymbols.includes(symbol) && orderedSymbols.indexOf(symbol) === index,
    );
    const nextSymbols = [
      ...uniqueOrder,
      ...currentSymbols.filter((symbol) => !uniqueOrder.includes(symbol)),
    ];
    const raw = await AsyncStorage.getItem(GUEST_CACHE_KEY);
    let cachedItems: Array<{ symbol?: unknown; createdAt?: unknown }> = [];
    try {
      cachedItems = raw ? JSON.parse(raw) as Array<{ symbol?: unknown; createdAt?: unknown }> : [];
    } catch {
      // A malformed cache should not prevent the in-memory order from updating.
    }
    const cachedBySymbol = new Map(
      cachedItems
        .filter((item): item is { symbol: string; createdAt?: unknown } => typeof item?.symbol === "string")
        .map((item) => [item.symbol, item]),
    );
    const nextItems = nextSymbols.map((symbol) => cachedBySymbol.get(symbol) ?? {
      symbol,
      createdAt: new Date().toISOString(),
    });
    symbolsRef.current = nextSymbols;
    setSymbols(nextSymbols);
    await AsyncStorage.setItem(GUEST_CACHE_KEY, JSON.stringify(nextItems));
  }, []);

  window.__heatMapWatchlistSymbols = symbols;
  window.__heatMapAddToWatchlist = add;
  window.__heatMapReorderWatchlist = reorder;
  const isWatched = useCallback((symbol: string) => symbols.includes(symbol), [symbols]);
  return { add, isWatched };
}
