import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BREW_TOKEN_QUOTE_THRESHOLD,
  INITIAL_BREW_TOKENS,
  claimQuoteView,
  createSerialWriteQueue,
  isBrewBankHalfway,
  isBrewBankUnlock,
  isWeekday,
  parseStoredNonNegative,
  resolveBrewBet,
} from '@/lib/brewTokenLogic';

const QUOTES_VIEWED_KEY = '@stocksense/biden_quotes_viewed_v1';
const BREW_UNLOCKED_KEY = '@stocksense/brew_bank_unlocked_v1';
const BREW_TOKENS_KEY = '@stocksense/brew_tokens_v1';
const BREW_SOUND_KEY = '@stocksense/brew_sound_enabled_v1';
const BREW_HAPTICS_KEY = '@stocksense/brew_haptics_enabled_v1';

export interface BrewTokenState {
  quotesViewed: number;
  isUnlocked: boolean;
  brewTokens: number;
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  justUnlocked: boolean;
  incrementQuoteViewed: (quoteViewId?: string) => Promise<QuoteViewUpdate>;
  resolveBet: (bet: number, won: boolean) => Promise<void>;
  setSoundEnabled: (value: boolean) => Promise<void>;
  setHapticsEnabled: (value: boolean) => Promise<void>;
  clearJustUnlocked: () => void;
}

export interface QuoteViewUpdate {
  earnedToken: boolean;
  halfway: boolean;
}

export function useBrewTokens(): BrewTokenState {
  const [quotesViewed, setQuotesViewed] = useState(0);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [brewTokens, setBrewTokens] = useState(0);
  const [soundEnabled, setSoundEnabledState] = useState(true);
  const [hapticsEnabled, setHapticsEnabledState] = useState(true);
  const [justUnlocked, setJustUnlocked] = useState(false);

  const quotesRef = useRef(0);
  const unlockedRef = useRef(false);
  const tokensRef = useRef(0);
  const rememberedQuoteViewsRef = useRef(new Set<string>());
  const writeQueueRef = useRef<ReturnType<typeof createSerialWriteQueue> | null>(null);
  const hydrationRef = useRef<{ promise: Promise<void>; resolve: () => void } | null>(null);

  if (!writeQueueRef.current) {
    writeQueueRef.current = createSerialWriteQueue();
  }

  if (!hydrationRef.current) {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => { resolve = r; });
    hydrationRef.current = { promise, resolve };
  }

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(QUOTES_VIEWED_KEY),
      AsyncStorage.getItem(BREW_UNLOCKED_KEY),
      AsyncStorage.getItem(BREW_TOKENS_KEY),
      AsyncStorage.getItem(BREW_SOUND_KEY),
      AsyncStorage.getItem(BREW_HAPTICS_KEY),
    ]).then(([rawQuotes, rawUnlocked, rawTokens, rawSound, rawHaptics]) => {
      const viewed = parseStoredNonNegative(rawQuotes);
      const unlocked = viewed >= BREW_TOKEN_QUOTE_THRESHOLD || rawUnlocked === 'true';
      const tokens = unlocked
        ? rawTokens == null ? INITIAL_BREW_TOKENS : parseStoredNonNegative(rawTokens)
        : 0;

      quotesRef.current = viewed;
      unlockedRef.current = unlocked;
      tokensRef.current = tokens;
      setQuotesViewed(viewed);
      setIsUnlocked(unlocked);
      setBrewTokens(tokens);
      setSoundEnabledState(rawSound !== 'false');
      setHapticsEnabledState(rawHaptics !== 'false');
    }).catch(() => {
      // Storage failure should not block the app or the quote experience.
    }).finally(() => {
      hydrationRef.current!.resolve();
    });
  }, []);

  const incrementQuoteViewed = useCallback(async (quoteViewId?: string) => {
    await hydrationRef.current!.promise;

    if (quoteViewId && !claimQuoteView(rememberedQuoteViewsRef.current, quoteViewId)) {
      return { earnedToken: false, halfway: false };
    }

    const previous = quotesRef.current;
    const next = previous + 1;
    const halfway = isBrewBankHalfway(previous, next);
    quotesRef.current = next;
    setQuotesViewed(next);

    let tokenWrite: (() => Promise<void>) | null = null;
    let earnedToken = false;
    if (!unlockedRef.current && isBrewBankUnlock(previous, next)) {
      unlockedRef.current = true;
      tokensRef.current = INITIAL_BREW_TOKENS;
      setIsUnlocked(true);
      setBrewTokens(INITIAL_BREW_TOKENS);
      setJustUnlocked(true);
      tokenWrite = () => Promise.all([
        AsyncStorage.setItem(BREW_UNLOCKED_KEY, 'true'),
        AsyncStorage.setItem(BREW_TOKENS_KEY, String(INITIAL_BREW_TOKENS)),
      ]).then(() => undefined);
    } else if (unlockedRef.current && isWeekday(new Date().getDay())) {
      const nextTokens = tokensRef.current + 1;
      tokensRef.current = nextTokens;
      setBrewTokens(nextTokens);
      earnedToken = true;
      tokenWrite = () => AsyncStorage.setItem(BREW_TOKENS_KEY, String(nextTokens));
    }

    await writeQueueRef.current!(async () => {
      await AsyncStorage.setItem(QUOTES_VIEWED_KEY, String(next));
      if (tokenWrite) await tokenWrite();
    }).catch(() => {});
    return { earnedToken, halfway };
  }, []);

  const resolveBet = useCallback(async (bet: number, won: boolean) => {
    await hydrationRef.current!.promise;

    const next = resolveBrewBet(tokensRef.current, bet, won);
    tokensRef.current = next;
    setBrewTokens(next);
    await writeQueueRef.current!(
      () => AsyncStorage.setItem(BREW_TOKENS_KEY, String(next)),
    ).catch(() => {});
  }, []);

  const setSoundEnabled = useCallback(async (value: boolean) => {
    await hydrationRef.current!.promise;
    setSoundEnabledState(value);
    await writeQueueRef.current!(
      () => AsyncStorage.setItem(BREW_SOUND_KEY, value ? 'true' : 'false'),
    ).catch(() => {});
  }, []);

  const setHapticsEnabled = useCallback(async (value: boolean) => {
    await hydrationRef.current!.promise;
    setHapticsEnabledState(value);
    await writeQueueRef.current!(
      () => AsyncStorage.setItem(BREW_HAPTICS_KEY, value ? 'true' : 'false'),
    ).catch(() => {});
  }, []);

  const clearJustUnlocked = useCallback(() => setJustUnlocked(false), []);

  return {
    quotesViewed,
    isUnlocked,
    brewTokens,
    soundEnabled,
    hapticsEnabled,
    justUnlocked,
    incrementQuoteViewed,
    resolveBet,
    setSoundEnabled,
    setHapticsEnabled,
    clearJustUnlocked,
  };
}