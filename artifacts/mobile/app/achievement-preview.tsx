import React from 'react';
import { Redirect, router } from 'expo-router';
import { AchievementSealCelebration } from '@/components/AchievementsOverlay';
import { useAmericanMode } from '@/contexts/AmericanModeContext';
import { useReduceMotion } from '@/hooks/useReduceMotion';

export default function AchievementPreviewScreen() {
  const reduceMotion = useReduceMotion();
  const { brew } = useAmericanMode();

  if (!__DEV__) {
    return <Redirect href="/" />;
  }

  const returnToApp = () => router.dismissTo('/');

  return (
    <AchievementSealCelebration
      visible
      reducedMotion={reduceMotion}
      hapticsEnabled={brew.hapticsEnabled}
      onDismiss={returnToApp}
      onChooseFlags={returnToApp}
    />
  );
}
