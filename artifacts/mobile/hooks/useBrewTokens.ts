import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BREW_TOKEN_QUOTE_THRESHOLD,
  BREW_BANK_ACCESS_DURATION_MS,
  DAIQUIRI_BOTTLE_PRICE,
  DAIQUIRI_UNLOCK_PRICE,
  QUICK_REVIVE_BOTTLE_PRICE,
  QUICK_REVIVE_UNLOCK_PRICE,
  STAMIN_UP_BOTTLE_PRICE,
  STAMIN_UP_UNLOCK_PRICE,
  buyBrewBankKey,
  buyQuickReviveBottle as purchaseQuickReviveBottle,
  buyQuickReviveUnlock,
  buyDaiquiriBottle as purchaseDaiquiriBottle,
  buyDaiquiriUnlock,
  buyStaminUpBottle as purchaseStaminUpBottle,
  buyStaminUpUnlock,
  buySmartProBottle as purchaseSmartProBottle,
  buySmartProUnlock,
  canArmBrewBottle,
  canActivateBrewBankKey,
  INITIAL_BREW_TOKENS,
  createSerialWriteQueue,
  isBrewBankHalfway,
  isBrewBankUnlock,
  isWeekday,
  hasBrewBankAccess,
  getSmartProBottleSalePrice,
  hasSmartProSale,
  parseStoredNonNegative,
  redeemQuickReviveBottle as armQuickReviveBottle,
  redeemDaiquiriBottle as armDaiquiriBottle,
  redeemStaminUpBottle as armStaminUpBottle,
  redeemSmartProBottle as activateSmartProSale,
  resolveBrewBetOutcome,
  type BrewBetEffect,
} from '@/lib/brewTokenLogic';
import {
  BREW_ECONOMY_SNAPSHOT_KEY,
  createBrewEconomySnapshot,
  migrateLegacyBrewEconomy,
  parseBrewEconomySnapshot,
  persistBrewEconomySnapshot,
  type BrewEconomySnapshot,
} from '@/lib/brewTokenPersistence';

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
const DAIQUIRI_UNLOCKED_KEY = '@stocksense/daiquiri_unlocked_v1';
const DAIQUIRI_BOTTLES_KEY = '@stocksense/daiquiri_bottles_v1';
const DAIQUIRI_ARMED_KEY = '@stocksense/daiquiri_armed_v1';
const STAMIN_UP_UNLOCKED_KEY = '@stocksense/stamin_up_unlocked_v1';
const STAMIN_UP_BOTTLES_KEY = '@stocksense/stamin_up_bottles_v1';
const STAMIN_UP_ARMED_KEY = '@stocksense/stamin_up_armed_v1';
const SMART_PRO_UNLOCKED_KEY = '@stocksense/smart_pro_unlocked_v1';
const SMART_PRO_BOTTLES_KEY = '@stocksense/smart_pro_bottles_v1';
const SMART_PRO_SALE_EXPIRES_KEY = '@stocksense/smart_pro_sale_expires_v1';
const DARK_BREW_TOKENS_KEY = '@stocksense/dark_brew_tokens_v1';

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
  daiquiriUnlocked: boolean;
  daiquiriBottles: number;
  daiquiriArmed: boolean;
  staminUpUnlocked: boolean;
  staminUpBottles: number;
  staminUpArmed: boolean;
  smartProUnlocked: boolean;
  smartProBottles: number;
  smartProSaleExpiresAt: number | null;
  darkBrewTokens: number;
  justUnlocked: boolean;
  incrementQuoteViewed: (quoteViewId?: string) => Promise<QuoteViewUpdate>;
  resolveBet: (bet: number, won: boolean, effect?: BrewBetEffect) => Promise<void>;
  setSoundEnabled: (value: boolean) => Promise<void>;
  setHapticsEnabled: (value: boolean) => Promise<void>;
  buyBankKey: () => Promise<boolean>;
  activateBankKey: (now?: number) => Promise<boolean>;
  unlockQuickRevive: () => Promise<boolean>;
  buyQuickReviveBottle: () => Promise<boolean>;
  redeemQuickReviveBottle: () => Promise<boolean>;
  unlockDaiquiri: () => Promise<boolean>;
  buyDaiquiriBottle: () => Promise<boolean>;
  redeemDaiquiriBottle: () => Promise<boolean>;
  unlockStaminUp: () => Promise<boolean>;
  buyStaminUpBottle: () => Promise<boolean>;
  redeemStaminUpBottle: () => Promise<boolean>;
  unlockSmartPro: () => Promise<boolean>;
  buySmartProBottle: () => Promise<boolean>;
  redeemSmartProBottle: () => Promise<boolean>;
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
  const [daiquiriUnlocked, setDaiquiriUnlocked] = useState(false);
  const [daiquiriBottles, setDaiquiriBottles] = useState(0);
  const [daiquiriArmed, setDaiquiriArmed] = useState(false);
  const [staminUpUnlocked, setStaminUpUnlocked] = useState(false);
  const [staminUpBottles, setStaminUpBottles] = useState(0);
  const [staminUpArmed, setStaminUpArmed] = useState(false);
  const [smartProUnlocked, setSmartProUnlocked] = useState(false);
  const [smartProBottles, setSmartProBottles] = useState(0);
  const [smartProSaleExpiresAt, setSmartProSaleExpiresAt] = useState<number | null>(null);
  const [darkBrewTokens, setDarkBrewTokens] = useState(0);

  const quotesRef = useRef(0);
  const unlockedRef = useRef(false);
  const tokensRef = useRef(0);
  const bankKeysRef = useRef(0);
  const bankAccessExpiresAtRef = useRef<number | null>(null);
  const quickReviveUnlockedRef = useRef(false);
  const quickReviveBottlesRef = useRef(0);
  const quickReviveArmedRef = useRef(false);
  const daiquiriUnlockedRef = useRef(false);
  const daiquiriBottlesRef = useRef(0);
  const daiquiriArmedRef = useRef(false);
  const staminUpUnlockedRef = useRef(false);
  const staminUpBottlesRef = useRef(0);
  const staminUpArmedRef = useRef(false);
  const smartProUnlockedRef = useRef(false);
  const smartProBottlesRef = useRef(0);
  const smartProSaleExpiresAtRef = useRef<number | null>(null);
  const darkBrewTokensRef = useRef(0);
  const rememberedQuoteViewsRef = useRef(new Set<string>());
  const economyRef = useRef<BrewEconomySnapshot | null>(null);
  const hydrationFailedRef = useRef(false);
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

  const applyEconomySnapshot = (snapshot: BrewEconomySnapshot) => {
    economyRef.current = snapshot;
    rememberedQuoteViewsRef.current = new Set(snapshot.claimedQuoteViewIds);
    quotesRef.current = snapshot.quotesViewed;
    unlockedRef.current = snapshot.isUnlocked;
    tokensRef.current = snapshot.brewTokens;
    bankKeysRef.current = snapshot.bankKeys;
    bankAccessExpiresAtRef.current = snapshot.bankAccessExpiresAt;
    quickReviveUnlockedRef.current = snapshot.quickReviveUnlocked;
    quickReviveBottlesRef.current = snapshot.quickReviveBottles;
    quickReviveArmedRef.current = snapshot.quickReviveArmed;
    daiquiriUnlockedRef.current = snapshot.daiquiriUnlocked;
    daiquiriBottlesRef.current = snapshot.daiquiriBottles;
    daiquiriArmedRef.current = snapshot.daiquiriArmed;
    staminUpUnlockedRef.current = snapshot.staminUpUnlocked;
    staminUpBottlesRef.current = snapshot.staminUpBottles;
    staminUpArmedRef.current = snapshot.staminUpArmed;
    smartProUnlockedRef.current = snapshot.smartProUnlocked;
    smartProBottlesRef.current = snapshot.smartProBottles;
    smartProSaleExpiresAtRef.current = snapshot.smartProSaleExpiresAt;
    darkBrewTokensRef.current = snapshot.darkBrewTokens;
    setQuotesViewed(snapshot.quotesViewed);
    setIsUnlocked(snapshot.isUnlocked);
    setBrewTokens(snapshot.brewTokens);
    setBankKeys(snapshot.bankKeys);
    setBankAccessExpiresAt(snapshot.bankAccessExpiresAt);
    setQuickReviveUnlocked(snapshot.quickReviveUnlocked);
    setQuickReviveBottles(snapshot.quickReviveBottles);
    setQuickReviveArmed(snapshot.quickReviveArmed);
    setDaiquiriUnlocked(snapshot.daiquiriUnlocked);
    setDaiquiriBottles(snapshot.daiquiriBottles);
    setDaiquiriArmed(snapshot.daiquiriArmed);
    setStaminUpUnlocked(snapshot.staminUpUnlocked);
    setStaminUpBottles(snapshot.staminUpBottles);
    setStaminUpArmed(snapshot.staminUpArmed);
    setSmartProUnlocked(snapshot.smartProUnlocked);
    setSmartProBottles(snapshot.smartProBottles);
    setSmartProSaleExpiresAt(snapshot.smartProSaleExpiresAt);
    setDarkBrewTokens(snapshot.darkBrewTokens);
  };

  const commitEconomyMutation = async <T,>(
    mutate: (current: BrewEconomySnapshot) => { snapshot: BrewEconomySnapshot; result: T } | null,
  ): Promise<T | null> => {
    await hydrationRef.current!.promise;
    if (hydrationFailedRef.current || !economyRef.current) return null;

    return writeQueueRef.current!(async () => {
      const current = economyRef.current;
      if (!current) return null;
      const mutation = mutate(current);
      if (!mutation || !(await persistBrewEconomySnapshot(AsyncStorage, mutation.snapshot))) return null;
      applyEconomySnapshot(mutation.snapshot);
      return mutation.result;
    }).catch(() => null);
  };

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(BREW_ECONOMY_SNAPSHOT_KEY),
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
      AsyncStorage.getItem(DAIQUIRI_UNLOCKED_KEY),
      AsyncStorage.getItem(DAIQUIRI_BOTTLES_KEY),
      AsyncStorage.getItem(DAIQUIRI_ARMED_KEY),
      AsyncStorage.getItem(STAMIN_UP_UNLOCKED_KEY),
      AsyncStorage.getItem(STAMIN_UP_BOTTLES_KEY),
      AsyncStorage.getItem(STAMIN_UP_ARMED_KEY),
      AsyncStorage.getItem(SMART_PRO_UNLOCKED_KEY),
      AsyncStorage.getItem(SMART_PRO_BOTTLES_KEY),
      AsyncStorage.getItem(SMART_PRO_SALE_EXPIRES_KEY),
      AsyncStorage.getItem(DARK_BREW_TOKENS_KEY),
    ]).then(([
      rawSnapshot,
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
      rawDaiquiriUnlocked,
      rawDaiquiriBottles,
      rawDaiquiriArmed,
      rawStaminUpUnlocked,
      rawStaminUpBottles,
      rawStaminUpArmed,
      rawSmartProUnlocked,
      rawSmartProBottles,
      rawSmartProSaleExpires,
      rawDarkBrewTokens,
    ]) => {
      const parsedSnapshot = parseBrewEconomySnapshot(rawSnapshot);
      const snapshot = parsedSnapshot ?? migrateLegacyBrewEconomy({
        rawQuotes,
        rawUnlocked,
        rawTokens,
        rawKeys,
        rawAccessExpires,
        rawQuickReviveUnlocked,
        rawQuickReviveBottles,
        rawQuickReviveArmed,
        rawDaiquiriUnlocked,
        rawDaiquiriBottles,
        rawDaiquiriArmed,
        rawStaminUpUnlocked,
        rawStaminUpBottles,
        rawStaminUpArmed,
        rawSmartProUnlocked,
        rawSmartProBottles,
        rawSmartProSaleExpires,
        rawDarkBrewTokens,
      });

      applyEconomySnapshot(snapshot);
      setSoundEnabledState(rawSound !== 'false');
      setHapticsEnabledState(rawHaptics !== 'false');

      if (!parsedSnapshot) {
        void writeQueueRef.current!(
          () => persistBrewEconomySnapshot(AsyncStorage, snapshot),
        ).catch(() => {});
      }
    }).catch(() => {
      // Keep default UI state visible, but prevent it from overwriting storage
      // that could not be read during hydration.
      hydrationFailedRef.current = true;
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
      void commitEconomyMutation((current) => current.bankAccessExpiresAt === expiresAt
        ? {
            snapshot: createBrewEconomySnapshot({ ...current, bankAccessExpiresAt: null }),
            result: true,
          }
        : null);
    };

    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      clearExpiredAccess();
      return;
    }

    const timeout = setTimeout(clearExpiredAccess, remaining);
    return () => clearTimeout(timeout);
  }, [bankAccessExpiresAt]);

  useEffect(() => {
    const expiresAt = smartProSaleExpiresAt;
    if (expiresAt == null) return;

    const clearExpiredSale = () => {
      if (smartProSaleExpiresAtRef.current !== expiresAt) return;
      if (hasSmartProSale(expiresAt, Date.now())) return;
      void commitEconomyMutation((current) => current.smartProSaleExpiresAt === expiresAt
        ? {
            snapshot: createBrewEconomySnapshot({ ...current, smartProSaleExpiresAt: null }),
            result: true,
          }
        : null);
    };

    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      clearExpiredSale();
      return;
    }

    const timeout = setTimeout(clearExpiredSale, remaining);
    return () => clearTimeout(timeout);
  }, [smartProSaleExpiresAt]);

  const incrementQuoteViewed = useCallback(async (quoteViewId?: string) => {
    const outcome = await commitEconomyMutation((current) => {
      if (quoteViewId && current.claimedQuoteViewIds.includes(quoteViewId)) return null;

      const previous = current.quotesViewed;
      const nextQuotesViewed = previous + 1;
      const halfway = isBrewBankHalfway(previous, nextQuotesViewed);
      const justUnlocked = !current.isUnlocked && isBrewBankUnlock(previous, nextQuotesViewed);
      const earnedToken = current.isUnlocked && isWeekday(new Date().getDay());
      const nextClaimedQuoteViewIds = quoteViewId
        ? [...current.claimedQuoteViewIds, quoteViewId]
        : current.claimedQuoteViewIds;

      const snapshot = createBrewEconomySnapshot({
        ...current,
        quotesViewed: nextQuotesViewed,
        isUnlocked: current.isUnlocked || justUnlocked,
        brewTokens: justUnlocked
          ? INITIAL_BREW_TOKENS
          : earnedToken
            ? current.brewTokens + 1
            : current.brewTokens,
        claimedQuoteViewIds: nextClaimedQuoteViewIds,
      });

      return {
        snapshot,
        result: { earnedToken, halfway, justUnlocked },
      };
    });

    if (!outcome) return { earnedToken: false, halfway: false };
    if (outcome.justUnlocked) setJustUnlocked(true);
    return { earnedToken: outcome.earnedToken, halfway: outcome.halfway };
  }, []);

  const resolveBet = useCallback(async (bet: number, won: boolean, effect: BrewBetEffect = {}) => {
    const outcome = await commitEconomyMutation((current) => {
      const next = resolveBrewBetOutcome(current.brewTokens, current.darkBrewTokens, bet, won, effect);
      return {
        snapshot: createBrewEconomySnapshot({
          ...current,
          brewTokens: next.brewTokens,
          darkBrewTokens: next.darkBrewTokens,
          quickReviveArmed: false,
          daiquiriArmed: false,
          staminUpArmed: false,
        }),
        result: true,
      };
    });
    void outcome;
  }, []);

  const setSoundEnabled = useCallback(async (value: boolean) => {
    await hydrationRef.current!.promise;
    if (hydrationFailedRef.current) return;
    const saved = await writeQueueRef.current!(
      () => AsyncStorage.setItem(BREW_SOUND_KEY, value ? 'true' : 'false'),
    ).then(() => true).catch(() => false);
    if (saved) setSoundEnabledState(value);
  }, []);

  const setHapticsEnabled = useCallback(async (value: boolean) => {
    await hydrationRef.current!.promise;
    if (hydrationFailedRef.current) return;
    const saved = await writeQueueRef.current!(
      () => AsyncStorage.setItem(BREW_HAPTICS_KEY, value ? 'true' : 'false'),
    ).then(() => true).catch(() => false);
    if (saved) setHapticsEnabledState(value);
  }, []);

  const buyBankKey = useCallback(async () => {
    const outcome = await commitEconomyMutation((current) => {
      const next = buyBrewBankKey(current.brewTokens, current.bankKeys);
      return next
        ? {
            snapshot: createBrewEconomySnapshot({
              ...current,
              brewTokens: next.tokenBalance,
              bankKeys: next.keyCount,
            }),
            result: true,
          }
        : null;
    });
    return outcome === true;
  }, []);

  const activateBankKey = useCallback(async (now = Date.now()) => {
    const outcome = await commitEconomyMutation((current) => {
      if (!canActivateBrewBankKey(current.bankKeys, new Date(now).getDay(), current.bankAccessExpiresAt, now)) {
        return null;
      }
      return {
        snapshot: createBrewEconomySnapshot({
          ...current,
          bankKeys: current.bankKeys - 1,
          bankAccessExpiresAt: now + BREW_BANK_ACCESS_DURATION_MS,
        }),
        result: true,
      };
    });
    return outcome === true;
  }, []);

  const unlockQuickRevive = useCallback(async () => {
    const outcome = await commitEconomyMutation((current) => {
      const next = buyQuickReviveUnlock(current.brewTokens, current.quickReviveUnlocked, QUICK_REVIVE_UNLOCK_PRICE);
      return next
        ? {
            snapshot: createBrewEconomySnapshot({
              ...current,
              brewTokens: next.tokenBalance,
              quickReviveUnlocked: next.unlocked,
            }),
            result: true,
          }
        : null;
    });
    return outcome === true;
  }, []);

  const buyQuickReviveBottle = useCallback(async () => {
    const outcome = await commitEconomyMutation((current) => {
      const next = purchaseQuickReviveBottle(
        current.brewTokens,
        current.quickReviveBottles,
        current.quickReviveUnlocked,
        getSmartProBottleSalePrice(QUICK_REVIVE_BOTTLE_PRICE, hasSmartProSale(current.smartProSaleExpiresAt, Date.now())),
      );
      return next
        ? {
            snapshot: createBrewEconomySnapshot({
              ...current,
              brewTokens: next.tokenBalance,
              quickReviveBottles: next.bottleCount,
            }),
            result: true,
          }
        : null;
    });
    return outcome === true;
  }, []);

  const redeemQuickReviveBottle = useCallback(async () => {
    const outcome = await commitEconomyMutation((current) => {
      if (!canArmBrewBottle(current.quickReviveArmed, current.daiquiriArmed, current.staminUpArmed)) return null;
      const next = armQuickReviveBottle(current.quickReviveBottles, current.quickReviveArmed);
      return next
        ? {
            snapshot: createBrewEconomySnapshot({
              ...current,
              quickReviveBottles: next.bottleCount,
              quickReviveArmed: next.armed,
            }),
            result: true,
          }
        : null;
    });
    return outcome === true;
  }, []);

  const unlockDaiquiri = useCallback(async () => {
    const outcome = await commitEconomyMutation((current) => {
      const next = buyDaiquiriUnlock(current.brewTokens, current.daiquiriUnlocked, DAIQUIRI_UNLOCK_PRICE);
      return next
        ? {
            snapshot: createBrewEconomySnapshot({
              ...current,
              brewTokens: next.tokenBalance,
              daiquiriUnlocked: next.unlocked,
            }),
            result: true,
          }
        : null;
    });
    return outcome === true;
  }, []);

  const buyDaiquiriBottle = useCallback(async () => {
    const outcome = await commitEconomyMutation((current) => {
      const next = purchaseDaiquiriBottle(
        current.brewTokens,
        current.daiquiriBottles,
        current.daiquiriUnlocked,
        getSmartProBottleSalePrice(DAIQUIRI_BOTTLE_PRICE, hasSmartProSale(current.smartProSaleExpiresAt, Date.now())),
      );
      return next
        ? {
            snapshot: createBrewEconomySnapshot({
              ...current,
              brewTokens: next.tokenBalance,
              daiquiriBottles: next.bottleCount,
            }),
            result: true,
          }
        : null;
    });
    return outcome === true;
  }, []);

  const redeemDaiquiriBottle = useCallback(async () => {
    const outcome = await commitEconomyMutation((current) => {
      if (!canArmBrewBottle(current.quickReviveArmed, current.daiquiriArmed, current.staminUpArmed)) return null;
      const next = armDaiquiriBottle(current.daiquiriBottles, current.daiquiriArmed);
      return next
        ? {
            snapshot: createBrewEconomySnapshot({
              ...current,
              daiquiriBottles: next.bottleCount,
              daiquiriArmed: next.armed,
            }),
            result: true,
          }
        : null;
    });
    return outcome === true;
  }, []);

  const unlockStaminUp = useCallback(async () => {
    const outcome = await commitEconomyMutation((current) => {
      const next = buyStaminUpUnlock(current.brewTokens, current.staminUpUnlocked, STAMIN_UP_UNLOCK_PRICE);
      return next
        ? {
            snapshot: createBrewEconomySnapshot({
              ...current,
              brewTokens: next.tokenBalance,
              staminUpUnlocked: next.unlocked,
            }),
            result: true,
          }
        : null;
    });
    return outcome === true;
  }, []);

  const buyStaminUpBottle = useCallback(async () => {
    const outcome = await commitEconomyMutation((current) => {
      const next = purchaseStaminUpBottle(
        current.brewTokens,
        current.staminUpBottles,
        current.staminUpUnlocked,
        getSmartProBottleSalePrice(STAMIN_UP_BOTTLE_PRICE, hasSmartProSale(current.smartProSaleExpiresAt, Date.now())),
      );
      return next
        ? {
            snapshot: createBrewEconomySnapshot({
              ...current,
              brewTokens: next.tokenBalance,
              staminUpBottles: next.bottleCount,
            }),
            result: true,
          }
        : null;
    });
    return outcome === true;
  }, []);

  const redeemStaminUpBottle = useCallback(async () => {
    const outcome = await commitEconomyMutation((current) => {
      if (!canArmBrewBottle(current.quickReviveArmed, current.daiquiriArmed, current.staminUpArmed)) return null;
      const next = armStaminUpBottle(current.staminUpBottles, current.staminUpArmed);
      return next
        ? {
            snapshot: createBrewEconomySnapshot({
              ...current,
              staminUpBottles: next.bottleCount,
              staminUpArmed: next.armed,
            }),
            result: true,
          }
        : null;
    });
    return outcome === true;
  }, []);

  const unlockSmartPro = useCallback(async () => {
    const outcome = await commitEconomyMutation((current) => {
      const next = buySmartProUnlock(current.brewTokens, current.smartProUnlocked);
      return next
        ? {
            snapshot: createBrewEconomySnapshot({
              ...current,
              brewTokens: next.tokenBalance,
              smartProUnlocked: next.unlocked,
            }),
            result: true,
          }
        : null;
    });
    return outcome === true;
  }, []);

  const buySmartProBottle = useCallback(async () => {
    const outcome = await commitEconomyMutation((current) => {
      const next = purchaseSmartProBottle(
        current.brewTokens,
        current.smartProBottles,
        current.smartProUnlocked,
      );
      return next
        ? {
            snapshot: createBrewEconomySnapshot({
              ...current,
              brewTokens: next.tokenBalance,
              smartProBottles: next.bottleCount,
            }),
            result: true,
          }
        : null;
    });
    return outcome === true;
  }, []);

  const redeemSmartProBottle = useCallback(async () => {
    const outcome = await commitEconomyMutation((current) => {
      const now = Date.now();
      const next = activateSmartProSale(current.smartProBottles, now, current.smartProSaleExpiresAt);
      return next
        ? {
            snapshot: createBrewEconomySnapshot({
              ...current,
              smartProBottles: next.bottleCount,
              smartProSaleExpiresAt: next.expiresAt,
            }),
            result: true,
          }
        : null;
    });
    return outcome === true;
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
    daiquiriUnlocked,
    daiquiriBottles,
    daiquiriArmed,
    staminUpUnlocked,
    staminUpBottles,
    staminUpArmed,
    smartProUnlocked,
    smartProBottles,
    smartProSaleExpiresAt,
    darkBrewTokens,
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
    unlockDaiquiri,
    buyDaiquiriBottle,
    redeemDaiquiriBottle,
    unlockStaminUp,
    buyStaminUpBottle,
    redeemStaminUpBottle,
    unlockSmartPro,
    buySmartProBottle,
    redeemSmartProBottle,
    clearJustUnlocked,
  };
}