/**
 * Manages the user's watchlist and price alerts.
 * Returns the list of watched tickers with live quotes, the list of alerts,
 * and functions to add/remove tickers and save/delete alerts.
 *
 * Persistence strategy:
 * - On mount, the last-known watchlist is loaded from AsyncStorage immediately
 *   so the list is visible before the API responds (and when offline/signed-out).
 * - After every successful API fetch the cache is refreshed.
 * - Add/remove write through to the cache optimistically alongside the API call.
 * - The cache is keyed per-user so switching accounts doesn't mix data.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApi } from './useApi';
import { useAuth } from '@clerk/expo';

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

const WATCHLIST_POLL_INTERVAL = 60_000;
const CACHE_KEY_PREFIX = '@stocksense/watchlist_v1/';

function cacheKey(userId: string | null | undefined) {
  // Fall back to a shared key when signed out so unauthenticated users still
  // see their locally-added tickers.
  return CACHE_KEY_PREFIX + (userId ?? '__guest__');
}

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
  const { apiFetch } = useApi();
  const { userId } = useAuth();
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
    readCache(cacheKey(userId)).then((cached) => {
      if (!cancelled && cached.length > 0) {
        setItems(cached);
      }
    });
    return () => { cancelled = true; };
  }, [userId]);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const [watchlist, alertList] = await Promise.all([
        apiFetch<WatchlistItem[]>('/api/user/watchlist').catch(() => [] as WatchlistItem[]),
        apiFetch<AlertData[]>('/api/user/alerts').catch(() => [] as AlertData[]),
      ]);
      if (!mountedRef.current) return;
      setItems(watchlist);
      setAlerts(alertList);

      // Persist fresh server list to cache
      void writeCache(cacheKey(userId), watchlist);

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
  }, [apiFetch, userId]);

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
      void writeCache(cacheKey(userId), next);
      return next;
    });
    try {
      await apiFetch('/api/user/watchlist/reorder', {
        method: 'PUT',
        body: JSON.stringify({ symbols }),
      });
    } catch {
      // Revert on failure by re-fetching
      refresh();
    }
  }, [apiFetch, refresh, userId]);

  const add = useCallback(async (symbol: string) => {
    // Optimistic update + cache write-through
    setItems((prev) => {
      if (prev.some((i) => i.symbol === symbol)) return prev;
      const next = [{ symbol, createdAt: new Date().toISOString() }, ...prev];
      void writeCache(cacheKey(userId), next);
      return next;
    });
    try {
      await apiFetch('/api/user/watchlist', {
        method: 'POST',
        body: JSON.stringify({ symbol }),
      });
    } catch {
      // Revert on error
      setItems((prev) => {
        const next = prev.filter((i) => i.symbol !== symbol);
        void writeCache(cacheKey(userId), next);
        return next;
      });
    }
  }, [apiFetch, userId]);

  const remove = useCallback(async (symbol: string) => {
    // Optimistic update + cache write-through
    setItems((prev) => {
      const next = prev.filter((i) => i.symbol !== symbol);
      void writeCache(cacheKey(userId), next);
      return next;
    });
    try {
      await apiFetch(`/api/user/watchlist/${encodeURIComponent(symbol)}`, { method: 'DELETE' });
    } catch {
      // Re-add on error
      setItems((prev) => {
        const next = [{ symbol, createdAt: new Date().toISOString() }, ...prev];
        void writeCache(cacheKey(userId), next);
        return next;
      });
    }
  }, [apiFetch, userId]);

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
        await apiFetch(`/api/user/alerts/${existing.id}`, { method: 'DELETE' }).catch(() => {});
        setAlerts((prev) => prev.filter((a) => a.id !== existing.id));
      }
      const result = await apiFetch<{ id: string }>('/api/user/alerts', {
        method: 'POST',
        body: JSON.stringify({ symbol, direction, targetPrice, pushToken }),
      });
      const newAlert: AlertData = {
        id: result.id,
        symbol,
        direction,
        targetPrice,
        createdAt: new Date().toISOString(),
        firedAt: null,
      };
      setAlerts((prev) => [...prev, newAlert]);
    },
    [apiFetch, alerts],
  );

  const deleteAlert = useCallback(
    async (id: string) => {
      setAlerts((prev) => prev.filter((a) => a.id !== id));
      await apiFetch(`/api/user/alerts/${id}`, { method: 'DELETE' }).catch(() => {});
    },
    [apiFetch],
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
