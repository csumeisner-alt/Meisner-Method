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
import { useApi } from './useApi';
import { getInstallationId } from '@/lib/installation';

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

const WATCHLIST_POLL_INTERVAL = 60_000;
const CACHE_KEY_PREFIX = '@stocksense/watchlist_v1/';

const GUEST_CACHE_KEY = CACHE_KEY_PREFIX + '__guest__';
const QUOTE_CACHE_KEY = CACHE_KEY_PREFIX + '__quotes__';
const ALERT_CACHE_KEY = '@stocksense/price_alerts_v1';

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

async function readQuoteCache(): Promise<Map<string, QuoteData>> {
  try {
    const raw = await AsyncStorage.getItem(QUOTE_CACHE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, QuoteData>;
    const cached = new Map<string, QuoteData>();
    for (const [symbol, quote] of Object.entries(parsed)) {
      if (
        Number.isFinite(quote?.currentPrice) &&
        Number.isFinite(quote?.priceChange) &&
        Number.isFinite(quote?.priceChangePercent)
      ) {
        cached.set(symbol, quote);
      }
    }
    return cached;
  } catch {
    return new Map();
  }
}

async function writeQuoteCache(quotes: Map<string, QuoteData>) {
  try {
    await AsyncStorage.setItem(QUOTE_CACHE_KEY, JSON.stringify(Object.fromEntries(quotes)));
  } catch {
    // Non-fatal — quote cache failure should never affect live refreshes.
  }
}

async function readAlertCache(): Promise<AlertData[]> {
  try {
    const raw = await AsyncStorage.getItem(ALERT_CACHE_KEY);
    return raw ? JSON.parse(raw) as AlertData[] : [];
  } catch {
    return [];
  }
}

async function writeAlertCache(alerts: AlertData[]) {
  try {
    await AsyncStorage.setItem(ALERT_CACHE_KEY, JSON.stringify(alerts));
  } catch {
    // Non-fatal — the server remains the source of truth for alerts.
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

  // Seed cached prices independently of the watchlist/API refresh so returning
  // users see useful prices immediately while fresh quotes load in the background.
  useEffect(() => {
    let cancelled = false;
    readQuoteCache().then((cached) => {
      if (!cancelled && cached.size > 0) setQuotes(cached);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    readAlertCache().then((cached) => {
      if (!cancelled && cached.length > 0) setAlerts(cached);
    });
    return () => { cancelled = true; };
  }, []);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const [watchlist, cachedAlerts] = await Promise.all([
        readCache(GUEST_CACHE_KEY),
        readAlertCache(),
      ]);
      if (!mountedRef.current) return;

      // Make the locally saved list available before waiting on alert or quote
      // requests. This keeps the list interactive even on a slow connection.
      setItems(watchlist);
      setAlerts(cachedAlerts);

      // Persist fresh server list to cache
      void writeCache(GUEST_CACHE_KEY, watchlist);

      const installationIdPromise = getInstallationId();
      const alertPromise = installationIdPromise
        .then((installationId) => apiFetch<AlertData[]>(
          `/api/notifications/alerts?installationId=${encodeURIComponent(installationId)}`,
        ))
        .then((alertList) => {
          void writeAlertCache(alertList);
          return alertList;
        })
        .catch(() => {
          // Keep the local copy visible while offline; saves still require the
          // server so the user is never promised an undeliverable alert.
          return cachedAlerts;
        });

      // Fetch live quotes in parallel with alerts rather than making the
      // watchlist wait for the alert request first.
      const quotePromise = Promise.all(
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
      ).then((results) => {
        const qMap = new Map<string, QuoteData>();
        for (const r of results) {
          if (r) qMap.set(r.symbol, r.data);
        }
        return qMap;
      });

      const [alertList, freshQuotes] = await Promise.all([alertPromise, quotePromise]);
      if (!mountedRef.current) return;
      setAlerts(alertList);
      if (freshQuotes.size > 0) {
        setQuotes(freshQuotes);
        void writeQuoteCache(freshQuotes);
      }
      if (mountedRef.current) setLastUpdated(new Date());
    } catch {
      // silently keep last data
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [apiFetch]);

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
      const installationId = await getInstallationId();
      const saved = await apiFetch<AlertData>('/api/notifications/alerts', {
        method: 'POST',
        body: JSON.stringify({ installationId, symbol, direction, targetPrice, pushToken }),
      });
      // Remove any existing active alert for this symbol first
      const existing = alerts.find((a) => a.symbol === symbol && !a.firedAt);
      if (existing) {
        setAlerts((prev) => prev.filter((a) => a.id !== existing.id));
      }
      setAlerts((prev) => {
        const next = [...prev.filter((a) => a.id !== existing?.id), saved];
        void writeAlertCache(next);
        return next;
      });
    },
    [alerts, apiFetch],
  );

  const deleteAlert = useCallback(
    async (id: string) => {
      const installationId = await getInstallationId();
      await apiFetch(`/api/notifications/alerts/${encodeURIComponent(id)}?installationId=${encodeURIComponent(installationId)}`, {
        method: 'DELETE',
      });
      setAlerts((prev) => {
        const next = prev.filter((a) => a.id !== id);
        void writeAlertCache(next);
        return next;
      });
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
