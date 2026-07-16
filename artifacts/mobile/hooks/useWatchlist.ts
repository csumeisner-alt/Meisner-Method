/**
 * Manages the user's watchlist and price alerts.
 * Returns the list of watched tickers with live quotes, the list of alerts,
 * and functions to add/remove tickers and save/delete alerts.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useApi } from './useApi';

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

export interface WatchlistItem {
  symbol: string;
  createdAt: string;
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
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

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
    } catch {
      // silently keep last data
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const add = useCallback(async (symbol: string) => {
    // Optimistic update
    setItems((prev) =>
      prev.some((i) => i.symbol === symbol)
        ? prev
        : [{ symbol, createdAt: new Date().toISOString() }, ...prev],
    );
    try {
      await apiFetch('/api/user/watchlist', {
        method: 'POST',
        body: JSON.stringify({ symbol }),
      });
    } catch {
      // Revert on error
      setItems((prev) => prev.filter((i) => i.symbol !== symbol));
    }
  }, [apiFetch]);

  const remove = useCallback(async (symbol: string) => {
    // Optimistic update
    setItems((prev) => prev.filter((i) => i.symbol !== symbol));
    try {
      await apiFetch(`/api/user/watchlist/${encodeURIComponent(symbol)}`, { method: 'DELETE' });
    } catch {
      // Re-add on error
      setItems((prev) => [{ symbol, createdAt: new Date().toISOString() }, ...prev]);
    }
  }, [apiFetch]);

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
    refresh,
    add,
    remove,
    isWatched,
    activeAlertFor,
    saveAlert,
    deleteAlert,
  };
}
