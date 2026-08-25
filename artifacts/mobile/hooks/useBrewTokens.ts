import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BREW_TOKEN_QUOTE_THRESHOLD,
  BREW_BANK_ACCESS_DURATION_MS,
  buyBrewBankKey,
  buyQuickReviveBottle as purchaseQuickReviveBottle,
  buyQuickReviveUnlock,
  canActivateBrewBankKey,
  INITIAL_BREW_TOKENS,
  claimQuoteView,
  createSerialWriteQueue,
  isBrewBankHalfway,
  isBrewBankUnlock,
  isWeekday,
  hasBrewBankAccess,
  parseStoredNonNegative,
  redeemQuickReviveBottle as armQuickReviveBottle,
  resolveBrewBet,
} from '@/lib/brewTokenLogic';

const QUOTES_VIEWED_KEY = '@stocksense/biden_quotes_viewed_v1';
const BREW_UNLOCKED_KEY = '@stocksense/brew_bank_unlocked_v1';
const BREW_TOKENS_KEY = '@stocksense/brew_tokens_v1';
const BREW_SOUND_KEY = '@stocksense/brew_sound_enabled_v1';
const BREW_HAPTICS_KEY = '@stocksense/brew_haptics_enabled_v1';
const BREW_BANK_KEYS_KEY = '@stocksense/brew_bank_keys_v1';
const BREW_BANK_ACCESS_EXPIRES_KEY = '@stocksense/brew_bank_access_expires_v1';
const QUICK_REVIVE_UNLOCKED_KEY = '@stocksense/quick_revive_unlocked_v1';
const QUICK_REVIVE_BOTTLES_KEY = '@stocksense/quick_revive_bottles_v1';
const QUICK_REVIVE_ARMED_KEY = '@stocksense/quick_revive_armed_v1';

export interface BrewTokenState {
  quotesViewed: number;
  isUnlocked: boolean;
  brewTokens: number;
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  bankKeys: number;
  bankAccessExpiresAt: number | null;
  quickReviveUnlocked: boolean;
  quickReviveBottles: number;
  quickReviveArmed: boolean;
  justUnlocked: boolean;
  incrementQuoteViewed: (quoteViewId?: string) => Promise<QuoteViewUpdate>;
  resolveBet: (bet: number, won: boolean) => Promise<void>;
  setSoundEnabled: (value: boolean) => Promise<void>;
  setHapticsEnabled: (value: boolean) => Promise<void>;
  buyBankKey: () => Promise<boolean>;
  activateBankKey: (now?: number) => Promise<boolean>;
  unlockQuickRevive: () => Promise<boolean>;
  buyQuickReviveBottle: () => Promise<boolean>;
  redeemQuickReviveBottle: () => Promise<boolean>;
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
  const [quickReviveUnlocked, setQuickReviveUnlocked] = useState(false);
  const [quickReviveBottles, setQuickReviveBottles] = useState(0);
  const [quickReviveArmed, setQuickReviveArmed] = useState(false);

  const quotesRef = useRef(0);
  const unlockedRef = useRef(false);
  const tokensRef = useRef(0);
  const bankKeysRef = useRef(0);
  const bankAccessExpiresAtRef = useRef<number | null>(null);
  const quickReviveUnlockedRef = useRef(false);
  const quickReviveBottlesRef = useRef(0);
  const quickReviveArmedRef = useRef(false);
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
      AsyncStorage.getItem(QUICK_REVIVE_UNLOCKED_KEY),
      AsyncStorage.getItem(QUICK_REVIVE_BOTTLES_KEY),
      AsyncStorage.getItem(QUICK_REVIVE_ARMED_KEY),
    ]).then(([
      rawQuotes,
      rawUnlocked,
      rawTokens,
      rawSound,
      rawHaptics,
      rawKeys,
      rawAccessExpires,
      rawQuickReviveUnlocked,
      rawQuickReviveBottles,
      rawQuickReviveArmed,
    ]) => {
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
      const reviveUnlocked = rawQuickReviveUnlocked === 'true';
      const reviveBottles = reviveUnlocked ? parseStoredNonNegative(rawQuickReviveBottles) : 0;
      const reviveArmed = reviveUnlocked && rawQuickReviveArmed === 'true';

      quotesRef.current = viewed;
      unlockedRef.current = unlocked;
      tokensRef.current = tokens;
      bankKeysRef.current = keys;
      bankAccessExpiresAtRef.current = accessExpires;
      quickReviveUnlockedRef.current = reviveUnlocked;
      quickReviveBottlesRef.current = reviveBottles;
      quickReviveArmedRef.current = reviveArmed;
      setQuotesViewed(viewed);
      setIsUnlocked(unlocked);
      setBrewTokens(tokens);
      setBankKeys(keys);
      setBankAccessExpiresAt(accessExpires);
      setQuickReviveUnlocked(reviveUnlocked);
      setQuickReviveBottles(reviveBottles);
      setQuickReviveArmed(reviveArmed);
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
    const hadQuickReviveArmed = quickReviveArmedRef.current;
    quickReviveArmedRef.current = false;
    setQuickReviveArmed(false);
    await writeQueueRef.current!(
      () => Promise.all([
        AsyncStorage.setItem(BREW_TOKENS_KEY, String(next)),
        ...(hadQuickReviveArmed ? [AsyncStorage.removeItem(QUICK_REVIVE_ARMED_KEY)] : []),
      ]).then(() => undefined),
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

  const unlockQuickRevive = useCallback(async () => {
    await hydrationRef.current!.promise;
    const next = buyQuickReviveUnlock(tokensRef.current, quickReviveUnlockedRef.current);
    if (!next) return false;
    tokensRef.current = next.tokenBalance;
    quickReviveUnlockedRef.current = true;
    setBrewTokens(next.tokenBalance);
    setQuickReviveUnlocked(true);
    await writeQueueRef.current!(() => Promise.all([
      AsyncStorage.setItem(BREW_TOKENS_KEY, String(next.tokenBalance)),
      AsyncStorage.setItem(QUICK_REVIVE_UNLOCKED_KEY, 'true'),
    ]).then(() => undefined)).catch(() => {});
    return true;
  }, []);

  const buyQuickReviveBottle = useCallback(async () => {
    await hydrationRef.current!.promise;
    const next = purchaseQuickReviveBottle(
      tokensRef.current,
      quickReviveBottlesRef.current,
      quickReviveUnlockedRef.current,
    );
    if (!next) return false;
    tokensRef.current = next.tokenBalance;
    quickReviveBottlesRef.current = next.bottleCount;
    setBrewTokens(next.tokenBalance);
    setQuickReviveBottles(next.bottleCount);
    await writeQueueRef.current!(() => Promise.all([
      AsyncStorage.setItem(BREW_TOKENS_KEY, String(next.tokenBalance)),
      AsyncStorage.setItem(QUICK_REVIVE_BOTTLES_KEY, String(next.bottleCount)),
    ]).then(() => undefined)).catch(() => {});
    return true;
  }, []);

  const redeemQuickReviveBottle = useCallback(async () => {
    await hydrationRef.current!.promise;
    const next = armQuickReviveBottle(quickReviveBottlesRef.current, quickReviveArmedRef.current);
    if (!next) return false;
    quickReviveBottlesRef.current = next.bottleCount;
    quickReviveArmedRef.current = true;
    setQuickReviveBottles(next.bottleCount);
    setQuickReviveArmed(true);
    await writeQueueRef.current!(() => Promise.all([
      AsyncStorage.setItem(QUICK_REVIVE_BOTTLES_KEY, String(next.bottleCount)),
      AsyncStorage.setItem(QUICK_REVIVE_ARMED_KEY, 'true'),
    ]).then(() => undefined)).catch(() => {});
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
    quickReviveUnlocked,
    quickReviveBottles,
    quickReviveArmed,
    justUnlocked,
    incrementQuoteViewed,
    resolveBet,
    setSoundEnabled,
    setHapticsEnabled,
    buyBankKey,
    activateBankKey,
    unlockQuickRevive,
    buyQuickReviveBottle,
    redeemQuickReviveBottle,
    clearJustUnlocked,
  };
}