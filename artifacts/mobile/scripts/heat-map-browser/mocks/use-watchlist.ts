import { useCallback, useState } from "react";

export function useWatchlist() {
  const [symbols, setSymbols] = useState<string[]>([]);
  const add = useCallback(async (symbol: string) => {
    setSymbols((current) => current.includes(symbol) ? current : [...current, symbol]);
  }, []);
  const isWatched = useCallback((symbol: string) => symbols.includes(symbol), [symbols]);
  return { add, isWatched };
}
