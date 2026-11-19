import { useEffect } from 'react';
import { InteractionManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  findLightningRoundWindow,
  getPaperChallengeWindow,
  PAPER_CHALLENGE_STORAGE_KEY,
  loadPaperChallengeStore,
} from '@/lib/paperChallenge';
import type { PaperChallengeWindow } from '@/lib/paperChallenge';
import {
  parseAccountValueSnapshots,
  type PaperAccountValueSnapshot,
} from '@/lib/paperMath';
import { PAPER_CACHE_KEY, parsePaperCache } from '@/lib/paperCache';
import {
  getPaperPortfolioPreloadState,
  mergePaperPreloadQuotes,
  PAPER_QUOTE_CACHE_KEY,
  parsePaperQuoteCache,
  persistPaperPreloadQuotes,
  requestPaperPreloadQuote,
} from '@/lib/paperPortfolioPreload';
import {
  eventArenaPreloadSymbols,
  mergeEventArenaPreloadQuotes,
  publishEventArenaPreload,
  refreshEventArenaQuotes,
} from '@/lib/eventArenaPreload';

const PAPER_VALUE_SNAPSHOT_KEY = '@stocksense/paper_equity_snapshots_v1';

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function EventArenaPreloader() {
  useEffect(() => {
    let cancelled = false;
    let started = false;
    const startPreload = () => {
      if (cancelled || started) return;
      started = true;
      void (async () => {
        const [rawChallenge, rawPaper, rawSnapshots, rawQuotes] = await Promise.all([
          AsyncStorage.getItem(PAPER_CHALLENGE_STORAGE_KEY),
          AsyncStorage.getItem(PAPER_CACHE_KEY),
          AsyncStorage.getItem(PAPER_VALUE_SNAPSHOT_KEY),
          AsyncStorage.getItem(PAPER_QUOTE_CACHE_KEY),
        ]);
        const store = await loadPaperChallengeStore({
          getItem: async () => rawChallenge,
        });
        const cache = parsePaperCache(rawPaper);
        const snapshots: PaperAccountValueSnapshot[] = parseAccountValueSnapshots(
          parseJson<unknown>(rawSnapshots, []),
        );
        const accountData = {
          accounts: cache?.accounts ?? [],
          positions: cache?.positions ?? [],
          transactions: cache?.transactions ?? [],
          orders: cache?.orders ?? [],
          snapshots,
        };
        const quotes = parsePaperQuoteCache(rawQuotes);
        const nowMs = Date.now();
        let currentEvent: PaperChallengeWindow | null = null;
        let lightningWindow: PaperChallengeWindow | null = null;
        try {
          currentEvent = getPaperChallengeWindow(nowMs);
        } catch {
          // The Event Arena screen presents the existing calendar error state.
        }
        try {
          lightningWindow = findLightningRoundWindow(nowMs);
        } catch {
          // A missing Lightning Round window does not invalidate regular events.
        }
        mergePaperPreloadQuotes(quotes);
        const preloadState = publishEventArenaPreload({
          store,
          accountData,
          quotes,
          currentEvent,
          lightningWindow,
          nowMs,
        });
        if (cancelled) return;

        const symbols = eventArenaPreloadSymbols(preloadState);
        if (symbols.length === 0) return;
        const refreshed = await refreshEventArenaQuotes(
          symbols,
          quotes,
          requestPaperPreloadQuote,
        );
        if (cancelled) return;
        const refreshedQuotes = refreshed.quotes;
        mergePaperPreloadQuotes(refreshedQuotes);
        mergeEventArenaPreloadQuotes(refreshedQuotes);
        await persistPaperPreloadQuotes(AsyncStorage, getPaperPortfolioPreloadState().quotes);
      })().catch(() => {
        // Keep valid local enrollment, account, and quote data available offline.
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
