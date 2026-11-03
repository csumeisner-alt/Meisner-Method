import { useCallback, useState } from "react";

declare global {
  interface Window {
    __heatMapWatchlistSymbols?: string[];
    __heatMapAddToWatchlist?: (symbol: string) => Promise<void>;
  }
}

export function useWatchlist() {
  const [symbols, setSymbols] = useState<string[]>([]);
  const add = useCallback(async (symbol: string) => {
    setSymbols((current) => current.includes(symbol) ? current : [...current, symbol]);
  }, []);
  window.__heatMapWatchlistSymbols = symbols;
  window.__heatMapAddToWatchlist = add;
  const isWatched = useCallback((symbol: string) => symbols.includes(symbol), [symbols]);
  return { add, isWatched };
}
