/**
 * Pure functions for fact-count logic — extracted so they can be tested
 * with Node's built-in runner without needing React or AsyncStorage.
 */

export const AMERICAN_MODE_THRESHOLD = 1_776;

/** Parse a raw AsyncStorage string into a safe integer count. */
export function parseStoredCount(raw: string | null | undefined): number {
  if (!raw) return 0;
  const n = parseInt(raw, 10);
  return isNaN(n) || n < 0 ? 0 : n;
}

/** Compute the next count from a hydrated baseline. */
export function computeNextCount(hydratedCount: number): number {
  return hydratedCount + 1;
}

/**
 * Returns true when incrementing from `prev` to `next` crosses the unlock
 * threshold for the first time (i.e. was below, now at or above).
 */
export function isUnlockTriggered(prev: number, next: number): boolean {
  return prev < AMERICAN_MODE_THRESHOLD && next >= AMERICAN_MODE_THRESHOLD;
}
