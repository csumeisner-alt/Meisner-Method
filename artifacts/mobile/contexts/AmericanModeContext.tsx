/**
 * AmericanModeContext — provides the Patriot Mode unlock/active state
 * (and the underlying fact counter) to the entire app.
 *
 * Wrap the root layout with <AmericanModeProvider> once; consume with
 * useAmericanMode() anywhere in the tree.
 */
import React, { createContext, useCallback, useContext, useEffect } from 'react';
import { useFactCount, type FactCountState, AMERICAN_MODE_THRESHOLD } from '@/hooks/useFactCount';
import { useBrewTokens, type BrewTokenState } from '@/hooks/useBrewTokens';
import { NEON_GUCCI_UNLOCK_COST } from '@/lib/brewTokenLogic';

export { AMERICAN_MODE_THRESHOLD, NEON_GUCCI_UNLOCK_COST };

export interface AppThemeState extends FactCountState {
  brew: BrewTokenState;
  neonGucciActive: boolean;
  neonGucciUnlocked: boolean;
  setNeonGucciActive: (value: boolean) => Promise<boolean>;
}

// Exported so useColors can do a raw useContext without the guard
export const AmericanModeContext = createContext<AppThemeState | null>(null);

export function AmericanModeProvider({ children }: { children: React.ReactNode }) {
  const factState = useFactCount();
  const brew = useBrewTokens();
  const neonGucciUnlocked = brew.darkBrewTokens >= NEON_GUCCI_UNLOCK_COST;

  useEffect(() => {
    if (brew.neonGucciActive && factState.isActive) {
      factState.setAmericanModeActive(false);
    }
  }, [brew.neonGucciActive, factState.isActive, factState.setAmericanModeActive]);

  const setAmericanModeActive = useCallback(async (value: boolean) => {
    if (value && brew.neonGucciActive) {
      await brew.setNeonGucciActive(false);
    }
    await factState.setAmericanModeActive(value);
  }, [brew.neonGucciActive, brew.setNeonGucciActive, factState.setAmericanModeActive]);

  const setNeonGucciActive = useCallback(async (value: boolean) => {
    if (value && !neonGucciUnlocked) return false;
    const updated = await brew.setNeonGucciActive(value);
    if (updated && value && factState.isActive) {
      await factState.setAmericanModeActive(false);
    }
    return updated;
  }, [brew.setNeonGucciActive, factState.isActive, factState.setAmericanModeActive, neonGucciUnlocked]);

  const state: AppThemeState = {
    ...factState,
    setAmericanModeActive,
    brew,
    neonGucciActive: brew.neonGucciActive,
    neonGucciUnlocked,
    setNeonGucciActive,
  };

  return (
    <AmericanModeContext.Provider value={state}>
      {children}
    </AmericanModeContext.Provider>
  );
}

export function useAmericanMode(): AppThemeState {
  const ctx = useContext(AmericanModeContext);
  if (!ctx) {
    throw new Error('useAmericanMode must be used inside <AmericanModeProvider>');
  }
  return ctx;
}
