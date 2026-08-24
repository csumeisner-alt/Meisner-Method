import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BREW_TOKEN_QUOTE_THRESHOLD,
  BREW_BANK_ACCESS_DURATION_MS,
  buyBrewBankKey,
  canActivateBrewBankKey,
  INITIAL_BREW_TOKENS,
  claimQuoteView,
  createSerialWriteQueue,
  isBrewBankHalfway,
  isBrewBankUnlock,
  isWeekday,
  hasBrewBankAccess,
  parseStoredNonNegative,
  resolveBrewBet,
} from '@/lib/brewTokenLogic';

const QUOTES_VIEWED_KEY = '@stocksense/biden_quotes_viewed_v1';
const BREW_UNLOCKED_KEY = '@stocksense/brew_bank_unlocked_v1';
const BREW_TOKENS_KEY = '@stocksense/brew_tokens_v1';
const BREW_SOUND_KEY = '@stocksense/brew_sound_enabled_v1';
const BREW_HAPTICS_KEY = '@stocksense/brew_haptics_enabled_v1';
const BREW_BANK_KEYS_KEY = '@stocksense/brew_bank_keys_v1';
const BREW_BANK_ACCESS_EXPIRES_KEY = '@stocksense/brew_bank_access_expires_v1';

export interface BrewTokenState {
  quotesViewed: number;
  isUnlocked: boolean;
  brewTokens: number;
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  bankKeys: number;
  bankAccessExpiresAt: number | null;
  justUnlocked: boolean;
  incrementQuoteViewed: (quoteViewId?: string) => Promise<QuoteViewUpdate>;
  resolveBet: (bet: number, won: boolean) => Promise<void>;
  setSoundEnabled: (value: boolean) => Promise<void>;
  setHapticsEnabled: (value: boolean) => Promise<void>;
  buyBankKey: () => Promise<boolean>;
  activateBankKey: (now?: number) => Promise<boolean>;
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
  const [bankKeys, setBankKeys] = useState(0);
  const [bankAccessExpiresAt, setBankAccessExpiresAt] = useState<number | null>(null);

  const quotesRef = useRef(0);
  const unlockedRef = useRef(false);
  const tokensRef = useRef(0);
  const bankKeysRef = useRef(0);
  const bankAccessExpiresAtRef = useRef<number | null>(null);
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
      AsyncStorage.getItem(BREW_BANK_KEYS_KEY),
      AsyncStorage.getItem(BREW_BANK_ACCESS_EXPIRES_KEY),
    ]).then(([rawQuotes, rawUnlocked, rawTokens, rawSound, rawHaptics, rawKeys, rawAccessExpires]) => {
      const viewed = parseStoredNonNegative(rawQuotes);
      const unlocked = viewed >= BREW_TOKEN_QUOTE_THRESHOLD || rawUnlocked === 'true';
      const tokens = unlocked
        ? rawTokens == null ? INITIAL_BREW_TOKENS : parseStoredNonNegative(rawTokens)
        : 0;
      const keys = parseStoredNonNegative(rawKeys);
      const parsedExpires = rawAccessExpires == null ? null : Number(rawAccessExpires);
      const accessExpires = parsedExpires != null && Number.isFinite(parsedExpires) && parsedExpires > 0
        ? parsedExpires
        : null;

      quotesRef.current = viewed;
      unlockedRef.current = unlocked;
      tokensRef.current = tokens;
      bankKeysRef.current = keys;
      bankAccessExpiresAtRef.current = accessExpires;
      setQuotesViewed(viewed);
      setIsUnlocked(unlocked);
      setBrewTokens(tokens);
      setBankKeys(keys);
      setBankAccessExpiresAt(accessExpires);
      setSoundEnabledState(rawSound !== 'false');
      setHapticsEnabledState(rawHaptics !== 'false');
    }).catch(() => {
      // Storage failure should not block the app or the quote experience.
    }).finally(() => {
      hydrationRef.current!.resolve();
    });
  }, []);

  useEffect(() => {
    const expiresAt = bankAccessExpiresAt;
    if (expiresAt == null) return;

    const clearExpiredAccess = () => {
      if (bankAccessExpiresAtRef.current !== expiresAt) return;
      if (hasBrewBankAccess(expiresAt, Date.now())) return;
      bankAccessExpiresAtRef.current = null;
      setBankAccessExpiresAt(null);
    };

    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      clearExpiredAccess();
      return;
    }

    const timeout = setTimeout(clearExpiredAccess, remaining);
    return () => clearTimeout(timeout);
  }, [bankAccessExpiresAt]);

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

  const buyBankKey = useCallback(async () => {
    await hydrationRef.current!.promise;
    const next = buyBrewBankKey(tokensRef.current, bankKeysRef.current);
    if (!next) return false;
    tokensRef.current = next.tokenBalance;
    bankKeysRef.current = next.keyCount;
    setBrewTokens(next.tokenBalance);
    setBankKeys(next.keyCount);
    await writeQueueRef.current!(() => Promise.all([
      AsyncStorage.setItem(BREW_TOKENS_KEY, String(next.tokenBalance)),
      AsyncStorage.setItem(BREW_BANK_KEYS_KEY, String(next.keyCount)),
    ])).catch(() => {});
    return true;
  }, []);

  const activateBankKey = useCallback(async (now = Date.now()) => {
    await hydrationRef.current!.promise;
    if (!canActivateBrewBankKey(bankKeysRef.current, new Date(now).getDay(), bankAccessExpiresAtRef.current, now)) {
      return false;
    }
    const expiresAt = now + BREW_BANK_ACCESS_DURATION_MS;
    bankKeysRef.current -= 1;
    bankAccessExpiresAtRef.current = expiresAt;
    setBankKeys(bankKeysRef.current);
    setBankAccessExpiresAt(expiresAt);
    await writeQueueRef.current!(() => Promise.all([
      AsyncStorage.setItem(BREW_BANK_KEYS_KEY, String(bankKeysRef.current)),
      AsyncStorage.setItem(BREW_BANK_ACCESS_EXPIRES_KEY, String(expiresAt)),
    ])).catch(() => {});
    return true;
  }, []);

  const clearJustUnlocked = useCallback(() => setJustUnlocked(false), []);

  return {
    quotesViewed,
    isUnlocked,
    brewTokens,
    soundEnabled,
    hapticsEnabled,
    bankKeys,
    bankAccessExpiresAt,
    justUnlocked,
    incrementQuoteViewed,
    resolveBet,
    setSoundEnabled,
    setHapticsEnabled,
    buyBankKey,
    activateBankKey,
    clearJustUnlocked,
  };
}