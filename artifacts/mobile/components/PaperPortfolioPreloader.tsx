import { useEffect } from 'react';
import { InteractionManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  PAPER_PORTFOLIO_PRELOAD_KEY,
  PAPER_QUOTE_CACHE_KEY,
  buildPaperPortfolioPreloadSummaries,
  createPaperPortfolioPreloadCache,
  getPaperPortfolioPreloadState,
  parsePaperPortfolioPreloadCache,
  parsePaperQuoteCache,
  persistPaperPreloadQuotes,
  preloadPaperPortfolioQuotes,
  publishPaperPortfolioPreload,
  requestPaperPreloadQuote,
} from '@/lib/paperPortfolioPreload';
import { loadOrCreatePaperCache } from '@/lib/paperCache';

export function PaperPortfolioPreloader() {
  useEffect(() => {
    let cancelled = false;
    let started = false;
    const startPreload = () => {
      if (started || cancelled) return;
      started = true;
      void (async () => {
        const [rawPortfolioCache, rawQuoteCache] = await Promise.all([
          AsyncStorage.getItem(PAPER_PORTFOLIO_PRELOAD_KEY).catch(() => null),
          AsyncStorage.getItem(PAPER_QUOTE_CACHE_KEY).catch(() => null),
        ]);
        let portfolios = parsePaperPortfolioPreloadCache(rawPortfolioCache)?.portfolios ?? null;

        if (!portfolios) {
          const paperCache = await loadOrCreatePaperCache(AsyncStorage);
          if (!paperCache) return;
          portfolios = buildPaperPortfolioPreloadSummaries(paperCache);
          await AsyncStorage.setItem(
            PAPER_PORTFOLIO_PRELOAD_KEY,
            JSON.stringify(createPaperPortfolioPreloadCache(portfolios)),
          ).catch(() => {});
        }
        if (cancelled) return;

        const cachedQuotes = parsePaperQuoteCache(rawQuoteCache);
        publishPaperPortfolioPreload(portfolios, cachedQuotes);
        const refreshedQuotes = await preloadPaperPortfolioQuotes(
          portfolios,
          getPaperPortfolioPreloadState().quotes,
          requestPaperPreloadQuote,
        );
        if (cancelled) return;

        publishPaperPortfolioPreload(portfolios, refreshedQuotes);
        void persistPaperPreloadQuotes(
          AsyncStorage,
          getPaperPortfolioPreloadState().quotes,
        );
      })().catch(() => {
        // Keep the last valid local data available if a startup quote request fails.
      });
    };
    const interactionTask = InteractionManager.runAfterInteractions(startPreload);
    const fallbackTimer = setTimeout(startPreload, 1_200);

    return () => {
      cancelled = true;
      clearTimeout(fallbackTimer);
      interactionTask.cancel();
    };
  }, []);

  return null;
}
