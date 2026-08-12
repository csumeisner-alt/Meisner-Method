/**
 * Tracks how many Meisner Method facts the user has read across all sessions,
 * and manages the Patriot Mode unlock state.
 *
 * HYDRATION GATE: `incrementFact` and `setAmericanModeActive` both await a
 * hydration promise before touching countRef or AsyncStorage. This prevents
 * the race where an early tap (before AsyncStorage loads) starts countRef at 0
 * and overwrites the user's real persisted count (e.g. 347) with 1.
 *
 * This hook is meant to be called ONCE inside AmericanModeContext and
 * consumed by all components via useAmericanMode().
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  parseStoredCount,
  computeNextCount,
  isUnlockTriggered,
  AMERICAN_MODE_THRESHOLD,
} from '@/lib/factCountLogic';

export { AMERICAN_MODE_THRESHOLD };

const FACTS_KEY = '@stocksense/facts_read_v1';
const AM_UNLOCKED_KEY = '@stocksense/american_mode_unlocked_v1';
const AM_ACTIVE_KEY = '@stocksense/american_mode_v1';

export interface FactCountState {
  factsRead: number;
  isUnlocked: boolean;
  isActive: boolean;
  /** True for one render cycle after hitting the threshold — use to trigger the celebration. */
  justUnlocked: boolean;
  incrementFact: () => Promise<void>;
  setAmericanModeActive: (value: boolean) => Promise<void>;
  clearJustUnlocked: () => void;
}

export function useFactCount(): FactCountState {
  const [factsRead, setFactsRead] = useState(0);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [justUnlocked, setJustUnlocked] = useState(false);

  // Mutable ref for the current count — updated atomically with AsyncStorage writes.
  const countRef = useRef(0);

  // Hydration gate: a promise that resolves once AsyncStorage has been read.
  // Both incrementFact and setAmericanModeActive await this before writing,
  // so they always operate on the real persisted baseline, not the initial 0.
  const hydrationRef = useRef<{ promise: Promise<void>; resolve: () => void } | null>(null);
  if (!hydrationRef.current) {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => { resolve = r; });
    hydrationRef.current = { promise, resolve };
  }

  // Load persisted state on mount. Resolves the hydration gate when done so
  // any queued increments can proceed with the correct baseline.
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(FACTS_KEY),
      AsyncStorage.getItem(AM_UNLOCKED_KEY),
      AsyncStorage.getItem(AM_ACTIVE_KEY),
    ]).then(([rawCount, rawUnlocked, rawActive]) => {
      const count = parseStoredCount(rawCount);
      const unlocked = count >= AMERICAN_MODE_THRESHOLD || rawUnlocked === 'true';
      const active = unlocked && rawActive === 'true';
      countRef.current = count;
      setFactsRead(count);
      setIsUnlocked(unlocked);
      setIsActive(active);
    }).catch(() => {
      // If storage fails, proceed with defaults — don't hang the gate.
    }).finally(() => {
      hydrationRef.current!.resolve();
    });
  }, []);

  const incrementFact = useCallback(async () => {
    // Wait for hydration so countRef holds the real persisted value, not 0.
    await hydrationRef.current!.promise;

    const prev = countRef.current;
    const next = computeNextCount(prev);
    countRef.current = next;
    setFactsRead(next);
    await AsyncStorage.setItem(FACTS_KEY, String(next)).catch(() => {});

    if (isUnlockTriggered(prev, next)) {
      await Promise.all([
        AsyncStorage.setItem(AM_UNLOCKED_KEY, 'true'),
        AsyncStorage.setItem(AM_ACTIVE_KEY, 'true'),
      ]).catch(() => {});
      setIsUnlocked(true);
      setIsActive(true);
      setJustUnlocked(true);
    }
  }, []);

  const setAmericanModeActive = useCallback(async (value: boolean) => {
    // Also gated: toggle must not run before we know whether the user is unlocked.
    await hydrationRef.current!.promise;
    setIsActive(value);
    await AsyncStorage.setItem(AM_ACTIVE_KEY, value ? 'true' : 'false').catch(() => {});
  }, []);

  const clearJustUnlocked = useCallback(() => setJustUnlocked(false), []);

  return {
    factsRead,
    isUnlocked,
    isActive,
    justUnlocked,
    incrementFact,
    setAmericanModeActive,
    clearJustUnlocked,
  };
}
