/**
 * AmericanModeContext — provides the Patriot Mode unlock/active state
 * (and the underlying fact counter) to the entire app.
 *
 * Wrap the root layout with <AmericanModeProvider> once; consume with
 * useAmericanMode() anywhere in the tree.
 */
import React, { createContext, useContext } from 'react';
import { useFactCount, type FactCountState, AMERICAN_MODE_THRESHOLD } from '@/hooks/useFactCount';

export { AMERICAN_MODE_THRESHOLD };

// Exported so useColors can do a raw useContext without the guard
export const AmericanModeContext = createContext<FactCountState | null>(null);

export function AmericanModeProvider({ children }: { children: React.ReactNode }) {
  const state = useFactCount();
  return (
    <AmericanModeContext.Provider value={state}>
      {children}
    </AmericanModeContext.Provider>
  );
}

export function useAmericanMode(): FactCountState {
  const ctx = useContext(AmericanModeContext);
  if (!ctx) {
    throw new Error('useAmericanMode must be used inside <AmericanModeProvider>');
  }
  return ctx;
}
