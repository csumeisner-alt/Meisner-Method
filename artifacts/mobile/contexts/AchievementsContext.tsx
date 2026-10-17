import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ACHIEVEMENT_STORAGE_KEY,
  claimAchievement,
  parseEarnedAchievementIds,
  type Achievement,
  type AchievementId,
} from '@/lib/achievements';

type AchievementsState = {
  earnedIds: AchievementId[];
  awardAchievement: (id: AchievementId) => Promise<void>;
  galleryVisible: boolean;
  openGallery: () => void;
  closeGallery: () => void;
  toastAchievement: Achievement | null;
  dismissToast: () => void;
};

const AchievementsContext = createContext<AchievementsState | null>(null);

export function AchievementsProvider({ children }: { children: React.ReactNode }) {
  const [earnedIds, setEarnedIds] = useState<AchievementId[]>([]);
  const [galleryVisible, setGalleryVisible] = useState(false);
  const [toastAchievement, setToastAchievement] = useState<Achievement | null>(null);
  const idsRef = useRef<AchievementId[]>([]);
  const hydratedRef = useRef(false);
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
