/**
 * Pure rules for the weekend Brew Token easter egg.
 * Kept separate from React Native so the persistence and unlock invariants
 * can be tested with Node's built-in test runner.
 */

export const BREW_TOKEN_QUOTE_THRESHOLD = 22;
export const INITIAL_BREW_TOKENS = 5;
export const BREW_TOKEN_WIN_PROBABILITY = 0.55;

export function parseStoredNonNegative(raw: string | null | undefined): number {
  if (!raw) return 0;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export function isBrewBankUnlock(prev: number, next: number): boolean {
  return prev < BREW_TOKEN_QUOTE_THRESHOLD && next >= BREW_TOKEN_QUOTE_THRESHOLD;
}

export function isWeekday(day: number): boolean {
  return day >= 1 && day <= 5;
}

export function resolveBrewBet(balance: number, bet: number, won: boolean): number {
  const safeBalance = Math.max(0, Math.floor(balance));
  const safeBet = Math.max(0, Math.min(Math.floor(bet), safeBalance));
  return won ? safeBalance + safeBet : safeBalance - safeBet;
}