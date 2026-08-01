/**
 * Manages the user's watchlist and price alerts.
 * Returns the list of watched tickers with live quotes, the list of alerts,
 * and functions to add/remove tickers and save/delete alerts.
 *
 * Persistence strategy:
 * - On mount, the last-known watchlist is loaded from AsyncStorage immediately
 *   so the list is visible before the API responds (and when offline/signed-out).
 * - After every successful API fetch the cache is refreshed.
 * - Add/remove write through to the local guest cache.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

const WATCHLIST_POLL_INTERVAL = 60_000;
const CACHE_KEY_PREFIX = '@stocksense/watchlist_v1/';

const GUEST_CACHE_KEY = CACHE_KEY_PREFIX + '__guest__';

async function readCache(key: string): Promise<WatchlistItem[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw) as WatchlistItem[];
  } catch {
    return [];
  }
}

async function writeCache(key: string, items: WatchlistItem[]) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(items));
  } catch {
    // Non-fatal — cache write failure should never surface to the user.
  }
}

export interface WatchlistItem {
  symbol: string;
  createdAt: string;
  sortOrder?: number;
}

export interface QuoteData {
  currentPrice: number;
  priceChange: number;
  priceChangePercent: number;
}

export interface AlertData {
  id: string;
  symbol: string;
  direction: 'above' | 'below';
  targetPrice: number;
  createdAt: string;
  firedAt: string | null;
}

export function useWatchlist() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [quotes, setQuotes] = useState<Map<string, QuoteData>>(new Map());
  const [alerts, setAlerts] = useState<AlertData[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Seed from local cache immediately on mount (or when the user changes) so
  // the list is visible before the first API round-trip completes.
  useEffect(() => {
    let cancelled = false;
    readCache(GUEST_CACHE_KEY).then((cached) => {
      if (!cancelled && cached.length > 0) {
        setItems(cached);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      // User-scoped endpoints require an account. Guest mode intentionally
      // keeps the watchlist and alerts local so refreshes never erase them.
      const watchlist = await readCache(GUEST_CACHE_KEY);
      const alertList: AlertData[] = [];
      if (!mountedRef.current) return;
      setItems(watchlist);
      setAlerts(alertList);

      // Persist fresh server list to cache
      void writeCache(GUEST_CACHE_KEY, watchlist);

      // Fetch live quotes for all watched symbols in parallel
      if (watchlist.length > 0) {
        const results = await Promise.all(
          watchlist.map(async (w) => {
            try {
              const r = await fetch(`${BASE_URL}/api/stocks/quote/${encodeURIComponent(w.symbol)}`);
              if (!r.ok) return null;
              const d = await r.json();
              if (d.error) return null;
              return { symbol: w.symbol, data: d as QuoteData };
            } catch {
              return null;
            }
          }),
        );
        if (!mountedRef.current) return;
        const qMap = new Map<string, QuoteData>();
        for (const r of results) {
          if (r) qMap.set(r.symbol, r.data);
        }
        setQuotes(qMap);
      }
      if (mountedRef.current) setLastUpdated(new Date());
    } catch {
      // silently keep last data
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-poll every 60 seconds while the hook is mounted
  useEffect(() => {
    const id = setInterval(() => {
      if (mountedRef.current) refresh();
    }, WATCHLIST_POLL_INTERVAL);
    return () => clearInterval(id);
  }, [refresh]);

  const reorder = useCallback(async (symbols: string[]) => {
    // Optimistic update
    setItems((prev) => {
      const map = new Map(prev.map((i) => [i.symbol, i]));
      const next = symbols
        .map((s, idx) => map.get(s) ?? { symbol: s, createdAt: new Date().toISOString(), sortOrder: idx })
        .filter(Boolean) as WatchlistItem[];
       void writeCache(GUEST_CACHE_KEY, next);
      return next;
    });
  }, []);

  const add = useCallback(async (symbol: string) => {
    // Optimistic update + cache write-through
    setItems((prev) => {
      if (prev.some((i) => i.symbol === symbol)) return prev;
      const next = [{ symbol, createdAt: new Date().toISOString() }, ...prev];
      void writeCache(GUEST_CACHE_KEY, next);
      return next;
    });
  }, []);

  const remove = useCallback(async (symbol: string) => {
    // Optimistic update + cache write-through
    setItems((prev) => {
      const next = prev.filter((i) => i.symbol !== symbol);
      void writeCache(GUEST_CACHE_KEY, next);
      return next;
    });
  }, []);

  const isWatched = useCallback(
    (symbol: string) => items.some((i) => i.symbol === symbol),
    [items],
  );

  const activeAlertFor = useCallback(
    (symbol: string): AlertData | null =>
      alerts.find((a) => a.symbol === symbol && !a.firedAt) ?? null,
    [alerts],
  );

  const saveAlert = useCallback(
    async (
      symbol: string,
      direction: 'above' | 'below',
      targetPrice: number,
      pushToken: string,
    ) => {
      // Remove any existing active alert for this symbol first
      const existing = alerts.find((a) => a.symbol === symbol && !a.firedAt);
      if (existing) {
        setAlerts((prev) => prev.filter((a) => a.id !== existing.id));
      }
      const newAlert: AlertData = {
        id: `${Date.now()}-${symbol}`,
        symbol,
        direction,
        targetPrice,
        createdAt: new Date().toISOString(),
        firedAt: null,
      };
      setAlerts((prev) => [...prev, newAlert]);
    },
    [alerts],
  );

  const deleteAlert = useCallback(
    async (id: string) => {
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    },
    [],
  );

  return {
    items,
    quotes,
    alerts,
    loading,
    lastUpdated,
    refresh,
    add,
    remove,
    reorder,
    isWatched,
    activeAlertFor,
    saveAlert,
    deleteAlert,
  };
}
