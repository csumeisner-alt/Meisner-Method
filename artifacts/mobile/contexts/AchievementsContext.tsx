import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ACHIEVEMENT_STORAGE_KEY,
  ANALYZE_SEARCH_ACHIEVEMENT_THRESHOLD,
  ANALYZE_SEARCH_COUNT_STORAGE_KEY,
  TRAINING_TAPE_OPEN_COUNT_STORAGE_KEY,
  DEFAULT_FLAG_ID,
  PRIDE_FLAG,
  PREMIUM_FLAG_STORAGE_KEY,
  claimAchievement,
  hasUnlockedPrideFlag,
  hasCompletedAllAchievements,
  getTrainingTapeAchievementsForOpenCount,
  resolvePremiumFlagSelection,
  parseEarnedAchievementIds,
  parseAnalyzeSearchCount,
  parseTrainingTapeOpenCount,
  type Achievement,
  type AchievementId,
  type FlagSelectionId,
} from '@/lib/achievements';
import { useAmericanMode } from '@/contexts/AmericanModeContext';

type AchievementsState = {
  earnedIds: AchievementId[];
  awardAchievement: (id: AchievementId) => Promise<void>;
  recordAnalyzeSearch: () => Promise<void>;
  recordTrainingTapeOpen: () => Promise<void>;
  selectedPremiumFlagId: FlagSelectionId;
  quotesViewed: number;
  prideUnlocked: boolean;
  premiumFlagReady: boolean;
  selectPremiumFlag: (id: FlagSelectionId) => void;
  galleryVisible: boolean;
  openGallery: () => void;
  closeGallery: () => void;
  toastAchievement: Achievement | null;
  dismissToast: () => void;
};

const AchievementsContext = createContext<AchievementsState | null>(null);

export function AchievementsProvider({ children }: { children: React.ReactNode }) {
  const { brew } = useAmericanMode();
  const [earnedIds, setEarnedIds] = useState<AchievementId[]>([]);
  const [storedFlagSelection, setStoredFlagSelection] = useState<FlagSelectionId>(DEFAULT_FLAG_ID);
  const [premiumFlagReady, setPremiumFlagReady] = useState(false);
  const [galleryVisible, setGalleryVisible] = useState(false);
  const [toastAchievement, setToastAchievement] = useState<Achievement | null>(null);
  const idsRef = useRef<AchievementId[]>([]);
  const hydratedRef = useRef(false);
  const premiumFlagHydratedRef = useRef(false);
  const pendingAwardsRef = useRef<AchievementId[]>([]);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const analyzeSearchCountRef = useRef<number | null>(null);
  const analyzeSearchWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
  const trainingTapeOpenCountRef = useRef<number | null>(null);
  const trainingTapeWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
  const prideUnlocked = hasUnlockedPrideFlag(brew.quotesViewed);
  const selectedPremiumFlagId = storedFlagSelection === PRIDE_FLAG.id && !prideUnlocked
    ? 'heritage'
    : storedFlagSelection;

  const awardAchievement = useCallback(async (id: AchievementId) => {
    if (!hydratedRef.current) {
      pendingAwardsRef.current.push(id);
      return;
    }

    const result = claimAchievement(idsRef.current, id);
    if (!result) return;

    idsRef.current = result.earnedIds;
    setEarnedIds(result.earnedIds);
    setToastAchievement(result.achievement);
    writeQueueRef.current = writeQueueRef.current
      .then(() => AsyncStorage.setItem(ACHIEVEMENT_STORAGE_KEY, JSON.stringify(result.earnedIds)))
      .catch((error) => {
        console.warn('[achievements] Could not save earned achievements:', error);
      });
    await writeQueueRef.current;
  }, []);

  const recordAnalyzeSearch = useCallback(() => {
    const nextWrite = analyzeSearchWriteQueueRef.current.catch(() => {}).then(async () => {
      let previousCount = analyzeSearchCountRef.current;
      if (previousCount === null) {
        try {
          previousCount = parseAnalyzeSearchCount(
            await AsyncStorage.getItem(ANALYZE_SEARCH_COUNT_STORAGE_KEY),
          );
        } catch (error) {
          previousCount = 0;
          console.warn('[achievements] Could not load Analyze search progress:', error);
        }
      }

      const nextCount = previousCount + 1;
      analyzeSearchCountRef.current = nextCount;
      if (nextCount >= ANALYZE_SEARCH_ACHIEVEMENT_THRESHOLD) {
        void awardAchievement('quote-100');
      }

      try {
        await AsyncStorage.setItem(ANALYZE_SEARCH_COUNT_STORAGE_KEY, String(nextCount));
      } catch (error) {
        console.warn('[achievements] Could not save Analyze search progress:', error);
      }
    });
    analyzeSearchWriteQueueRef.current = nextWrite;
    return nextWrite;
  }, [awardAchievement]);

  const recordTrainingTapeOpen = useCallback(() => {
    const nextWrite = trainingTapeWriteQueueRef.current.catch(() => {}).then(async () => {
      let previousCount = trainingTapeOpenCountRef.current;
      if (previousCount === null) {
        try {
          previousCount = parseTrainingTapeOpenCount(
            await AsyncStorage.getItem(TRAINING_TAPE_OPEN_COUNT_STORAGE_KEY),
          );
        } catch (error) {
          previousCount = 0;
          console.warn('[achievements] Could not load Training Tape opening progress:', error);
        }
        // Older versions only persisted displayed Biden quotes. Each of those
        // was also a Tape opening, so preserve that progress as a lower bound.
        previousCount = Math.max(previousCount, brew.quotesViewed);
      }

      const nextCount = previousCount + 1;
      trainingTapeOpenCountRef.current = nextCount;
      for (const id of getTrainingTapeAchievementsForOpenCount(nextCount)) {
        void awardAchievement(id);
      }

      try {
        await AsyncStorage.setItem(TRAINING_TAPE_OPEN_COUNT_STORAGE_KEY, String(nextCount));
      } catch (error) {
        console.warn('[achievements] Could not save Training Tape opening progress:', error);
      }
    });
    trainingTapeWriteQueueRef.current = nextWrite;
    return nextWrite;
  }, [awardAchievement, brew.quotesViewed]);

  const selectPremiumFlag = useCallback((id: FlagSelectionId) => {
    if (
      !hydratedRef.current ||
      !premiumFlagHydratedRef.current ||
      !hasCompletedAllAchievements(idsRef.current) ||
      (id === PRIDE_FLAG.id && !prideUnlocked)
    ) return;
    setStoredFlagSelection(id);
    void AsyncStorage.setItem(PREMIUM_FLAG_STORAGE_KEY, id).catch((error) => {
      console.warn('[achievements] Could not save premium flag selection:', error);
    });
  }, [prideUnlocked]);

  useEffect(() => {
    let mounted = true;
    void AsyncStorage.getItem(ACHIEVEMENT_STORAGE_KEY)
      .then((raw) => {
        if (!mounted) return;
        const loadedIds = parseEarnedAchievementIds(raw);
        idsRef.current = loadedIds;
        hydratedRef.current = true;
        setEarnedIds(loadedIds);

        const pending = pendingAwardsRef.current.splice(0);
        for (const id of pending) void awardAchievement(id);
      })
      .catch((error) => {
        if (!mounted) return;
        console.warn('[achievements] Could not load earned achievements:', error);
        hydratedRef.current = true;
        const pending = pendingAwardsRef.current.splice(0);
        for (const id of pending) void awardAchievement(id);
      });
    return () => {
      mounted = false;
    };
  }, [awardAchievement]);

  useEffect(() => {
    let mounted = true;
    void AsyncStorage.getItem(PREMIUM_FLAG_STORAGE_KEY)
      .then((raw) => {
        if (!mounted) return;
        setStoredFlagSelection(resolvePremiumFlagSelection(raw));
      })
      .catch((error) => {
        if (mounted) console.warn('[achievements] Could not load premium flag selection:', error);
      })
      .finally(() => {
        if (!mounted) return;
        premiumFlagHydratedRef.current = true;
        setPremiumFlagReady(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!toastAchievement) return;
    const timeout = setTimeout(() => setToastAchievement(null), 2_700);
    return () => clearTimeout(timeout);
  }, [toastAchievement]);

  const openGallery = useCallback(() => setGalleryVisible(true), []);
  const closeGallery = useCallback(() => setGalleryVisible(false), []);
  const dismissToast = useCallback(() => setToastAchievement(null), []);

  return (
    <AchievementsContext.Provider
      value={{
        earnedIds,
        awardAchievement,
        recordAnalyzeSearch,
        recordTrainingTapeOpen,
        selectedPremiumFlagId,
        quotesViewed: brew.quotesViewed,
        prideUnlocked,
        premiumFlagReady,
        selectPremiumFlag,
        galleryVisible,
        openGallery,
        closeGallery,
        toastAchievement,
        dismissToast,
      }}
    >
      {children}
    </AchievementsContext.Provider>
  );
}

export function useAchievements(): AchievementsState {
  const context = useContext(AchievementsContext);
  if (!context) throw new Error('useAchievements must be used within AchievementsProvider');
  return context;
}
