import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ACHIEVEMENT_STORAGE_KEY,
  PREMIUM_FLAG_STORAGE_KEY,
  claimAchievement,
  hasCompletedAllAchievements,
  parsePremiumFlagId,
  parseEarnedAchievementIds,
  type Achievement,
  type AchievementId,
  type PremiumFlagId,
} from '@/lib/achievements';

type AchievementsState = {
  earnedIds: AchievementId[];
  awardAchievement: (id: AchievementId) => Promise<void>;
  selectedPremiumFlagId: PremiumFlagId;
  premiumFlagReady: boolean;
  selectPremiumFlag: (id: PremiumFlagId) => void;
  galleryVisible: boolean;
  openGallery: () => void;
  closeGallery: () => void;
  toastAchievement: Achievement | null;
  dismissToast: () => void;
};

const AchievementsContext = createContext<AchievementsState | null>(null);

export function AchievementsProvider({ children }: { children: React.ReactNode }) {
  const [earnedIds, setEarnedIds] = useState<AchievementId[]>([]);
  const [selectedPremiumFlagId, setSelectedPremiumFlagId] = useState<PremiumFlagId>('heritage');
  const [premiumFlagReady, setPremiumFlagReady] = useState(false);
  const [galleryVisible, setGalleryVisible] = useState(false);
  const [toastAchievement, setToastAchievement] = useState<Achievement | null>(null);
  const idsRef = useRef<AchievementId[]>([]);
  const hydratedRef = useRef(false);
  const premiumFlagHydratedRef = useRef(false);
  const pendingAwardsRef = useRef<AchievementId[]>([]);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());

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

  const selectPremiumFlag = useCallback((id: PremiumFlagId) => {
    if (
      !hydratedRef.current ||
      !premiumFlagHydratedRef.current ||
      !hasCompletedAllAchievements(idsRef.current)
    ) return;
    setSelectedPremiumFlagId(id);
    void AsyncStorage.setItem(PREMIUM_FLAG_STORAGE_KEY, id).catch((error) => {
      console.warn('[achievements] Could not save premium flag selection:', error);
    });
  }, []);

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
        const loadedId = parsePremiumFlagId(raw);
        if (loadedId) setSelectedPremiumFlagId(loadedId);
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
        selectedPremiumFlagId,
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
