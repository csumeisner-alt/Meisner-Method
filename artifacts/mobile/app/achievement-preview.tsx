import React from 'react';
import { Redirect, router } from 'expo-router';
import { AchievementSealCelebration } from '@/components/AchievementsOverlay';
import { useReduceMotion } from '@/hooks/useReduceMotion';

export default function AchievementPreviewScreen() {
  const reduceMotion = useReduceMotion();

  if (!__DEV__) {
    return <Redirect href="/" />;
  }

  const returnToApp = () => router.dismissTo('/');

  return (
    <AchievementSealCelebration
      reducedMotion={reduceMotion}
      onDismiss={returnToApp}
      onChooseFlags={returnToApp}
    />
  );
}
