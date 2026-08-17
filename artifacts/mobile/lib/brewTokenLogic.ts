/**
 * Pure rules for the weekend Brew Token easter egg.
 * Kept separate from React Native so the persistence and unlock invariants
 * can be tested with Node's built-in test runner.
 */

export const BREW_TOKEN_QUOTE_THRESHOLD = 22;
export const INITIAL_BREW_TOKENS = 5;
export const BREW_TOKEN_WIN_PROBABILITY = 0.55;
export const MAX_REMEMBERED_QUOTE_VIEWS = 32;

export function parseStoredNonNegative(raw: string | null | undefined): number {
  if (!raw) return 0;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export function isBrewBankUnlock(prev: number, next: number): boolean {
  return prev < BREW_TOKEN_QUOTE_THRESHOLD && next >= BREW_TOKEN_QUOTE_THRESHOLD;
}

export function isBrewBankHalfway(prev: number, next: number): boolean {
  return prev < BREW_TOKEN_QUOTE_THRESHOLD / 2 && next >= BREW_TOKEN_QUOTE_THRESHOLD / 2;
}

export function isWeekday(day: number): boolean {
  return day >= 1 && day <= 5;
}

export function resolveBrewBet(balance: number, bet: number, won: boolean): number {
  const safeBalance = Math.max(0, Math.floor(balance));
  const safeBet = Math.max(0, Math.min(Math.floor(bet), safeBalance));
  return won ? safeBalance + safeBet : safeBalance - safeBet;
}

/**
 * Serializes persistence mutations without adding a dependency or blocking
 * the UI. A failed write is isolated so later writes can still run.
 */
export function createSerialWriteQueue() {
  let tail: Promise<void> = Promise.resolve();

  return function enqueue<T>(write: () => Promise<T>): Promise<T> {
    const next = tail.then(() => write());
    tail = next.then(() => undefined, () => undefined);
    return next;
  };
}

/**
 * Prevents the same Training Tape display from awarding more than once if
 * React re-runs an effect or a callback is delivered twice.
 */
export function claimQuoteView(
  remembered: Set<string>,
  quoteViewId: string,
  maxEntries = MAX_REMEMBERED_QUOTE_VIEWS,
): boolean {
  if (remembered.has(quoteViewId)) return false;

  remembered.add(quoteViewId);
  while (remembered.size > maxEntries) {
    const oldest = remembered.values().next().value;
    if (oldest === undefined) break;
    remembered.delete(oldest);
  }
  return true;
}