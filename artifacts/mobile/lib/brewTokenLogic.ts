/**
 * Pure rules for the weekend Brew Token easter egg.
 * Kept separate from React Native so the persistence and unlock invariants
 * can be tested with Node's built-in test runner.
 */

export const BREW_TOKEN_QUOTE_THRESHOLD = 22;
export const INITIAL_BREW_TOKENS = 5;
export const BREW_TOKEN_WIN_PROBABILITY = 0.55;
export const QUICK_REVIVE_WIN_PROBABILITY = 0.62;
export const MAX_REMEMBERED_QUOTE_VIEWS = 32;
export const BREW_BANK_KEY_PRICE = 10;
export const BREW_BANK_ACCESS_DURATION_MS = 12 * 60 * 60 * 1000;
export const QUICK_REVIVE_UNLOCK_PRICE = 40;
export const QUICK_REVIVE_BOTTLE_PRICE = 2;
export const DAIQUIRI_WIN_PROBABILITY = 0.45;
export const DAIQUIRI_LOSS_PROBABILITY = 0.65;
export const DAIQUIRI_PAYOUT_MULTIPLIER = 2;
export const DAIQUIRI_UNLOCK_PRICE = 100;
export const DAIQUIRI_BOTTLE_PRICE = 8;
export const STAMIN_UP_UNLOCK_PRICE = 500;
export const STAMIN_UP_BOTTLE_PRICE = 16;

export type BrewBottlePreviewKind = 'quickRevive' | 'daiquiri' | 'staminUp';

export type BrewBottlePreview = {
  kind: BrewBottlePreviewKind;
  title: string;
  unlockPrice: number;
  bottlePrice: number;
  winProbability: number;
  lossProbability: number;
  description: string;
  conversionCopy: string | null;
};

export type BrewBottleInspectionSnapshot = {
  tokens: number;
  quickReviveUnlocked: boolean;
  quickReviveBottles: number;
  quickReviveArmed: boolean;
  daiquiriUnlocked: boolean;
  daiquiriBottles: number;
  daiquiriArmed: boolean;
  staminUpUnlocked: boolean;
  staminUpBottles: number;
  staminUpArmed: boolean;
};

export type BrewBottleInspection = {
  preview: BrewBottlePreview;
  unlocked: boolean;
  bottleCount: number;
  armed: boolean;
  snapshot: BrewBottleInspectionSnapshot;
};

export function getBrewBottlePreview(kind: BrewBottlePreviewKind): BrewBottlePreview {
  switch (kind) {
    case 'quickRevive':
      return {
        kind,
        title: 'QUICK REVIVE',
        unlockPrice: QUICK_REVIVE_UNLOCK_PRICE,
        bottlePrice: QUICK_REVIVE_BOTTLE_PRICE,
        winProbability: QUICK_REVIVE_WIN_PROBABILITY,
        lossProbability: 1 - QUICK_REVIVE_WIN_PROBABILITY,
        description: 'Break one into the machine before a toss to raise your next win chance by 7 points, from 55% to 62%.',
        conversionCopy: null,
      };
    case 'daiquiri':
      return {
        kind,
        title: 'DAVE RAMSEY DAIQUIRI',
        unlockPrice: DAIQUIRI_UNLOCK_PRICE,
        bottlePrice: DAIQUIRI_BOTTLE_PRICE,
        winProbability: DAIQUIRI_WIN_PROBABILITY,
        lossProbability: DAIQUIRI_LOSS_PROBABILITY,
        description: 'Crack one into the machine before a toss: 45% win odds, 65% loss odds, and a double award if it pays.',
        conversionCopy: null,
      };
    case 'staminUp':
      return {
        kind,
        title: 'STAMIN UP',
        unlockPrice: STAMIN_UP_UNLOCK_PRICE,
        bottlePrice: STAMIN_UP_BOTTLE_PRICE,
        winProbability: BREW_TOKEN_WIN_PROBABILITY,
        lossProbability: 1 - BREW_TOKEN_WIN_PROBABILITY,
        description: 'A rare amber soda. Break one into the machine and a winning toss pays Dark Brew Tokens instead of normal Brew Token winnings.',
        conversionCopy: 'Stamin Up keeps your Brew Token stake on a win and sends an equal reward to Dark Brew Tokens. Dark Brew Tokens cannot be bet or lost.',
      };
  }
}

/**
 * Builds the read-only view for a bottle inspection. Keeping the account
 * snapshot in the result makes it explicit that opening or closing a preview
 * cannot spend tokens, consume a bottle, or arm an effect.
 */
export function getBrewBottleInspection(
  kind: BrewBottlePreviewKind,
  snapshot: BrewBottleInspectionSnapshot,
): BrewBottleInspection {
  const selected = kind === 'quickRevive'
    ? {
        unlocked: snapshot.quickReviveUnlocked,
        bottleCount: snapshot.quickReviveBottles,
        armed: snapshot.quickReviveArmed,
      }
    : kind === 'daiquiri'
      ? {
          unlocked: snapshot.daiquiriUnlocked,
          bottleCount: snapshot.daiquiriBottles,
          armed: snapshot.daiquiriArmed,
        }
      : {
          unlocked: snapshot.staminUpUnlocked,
          bottleCount: snapshot.staminUpBottles,
          armed: snapshot.staminUpArmed,
        };

  return {
    preview: getBrewBottlePreview(kind),
    ...selected,
    snapshot: { ...snapshot },
  };
}

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

export function hasBrewBankAccess(expiresAt: number | null | undefined, now: number): boolean {
  return typeof expiresAt === 'number' && Number.isFinite(expiresAt) && expiresAt > now;
}

export function canEnterBrewBank(
  day: number,
  expiresAt: number | null | undefined,
  now: number,
): boolean {
  return !isWeekday(day) || hasBrewBankAccess(expiresAt, now);
}

export function formatBrewBankAccessRemaining(
  expiresAt: number | null | undefined,
  now: number,
): string | null {
  if (!hasBrewBankAccess(expiresAt, now)) return null;
  const remainingMinutes = Math.ceil((expiresAt! - now) / 60_000);
  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, '0')}m remaining`;
}

export function canActivateBrewBankKey(
  keyCount: number,
  day: number,
  expiresAt: number | null | undefined,
  now: number,
): boolean {
  return isWeekday(day) && keyCount > 0 && !hasBrewBankAccess(expiresAt, now);
}

export function buyBrewBankKey(
  tokenBalance: number,
  keyCount: number,
): { tokenBalance: number; keyCount: number } | null {
  const safeBalance = Math.max(0, Math.floor(tokenBalance));
  const safeKeys = Math.max(0, Math.floor(keyCount));
  if (safeBalance < BREW_BANK_KEY_PRICE) return null;
  return {
    tokenBalance: safeBalance - BREW_BANK_KEY_PRICE,
    keyCount: safeKeys + 1,
  };
}

export function buyQuickReviveUnlock(
  tokenBalance: number,
  alreadyUnlocked: boolean,
): { tokenBalance: number; unlocked: true } | null {
  const safeBalance = Math.max(0, Math.floor(tokenBalance));
  if (alreadyUnlocked || safeBalance < QUICK_REVIVE_UNLOCK_PRICE) return null;
  return { tokenBalance: safeBalance - QUICK_REVIVE_UNLOCK_PRICE, unlocked: true };
}

export function buyQuickReviveBottle(
  tokenBalance: number,
  bottleCount: number,
  unlocked: boolean,
): { tokenBalance: number; bottleCount: number } | null {
  const safeBalance = Math.max(0, Math.floor(tokenBalance));
  const safeBottles = Math.max(0, Math.floor(bottleCount));
  if (!unlocked || safeBalance < QUICK_REVIVE_BOTTLE_PRICE) return null;
  return {
    tokenBalance: safeBalance - QUICK_REVIVE_BOTTLE_PRICE,
    bottleCount: safeBottles + 1,
  };
}

export function redeemQuickReviveBottle(
  bottleCount: number,
  alreadyArmed: boolean,
): { bottleCount: number; armed: true } | null {
  const safeBottles = Math.max(0, Math.floor(bottleCount));
  if (alreadyArmed || safeBottles < 1) return null;
  return { bottleCount: safeBottles - 1, armed: true };
}

export function getBrewWinProbability(quickReviveArmed: boolean): number {
  return quickReviveArmed ? QUICK_REVIVE_WIN_PROBABILITY : BREW_TOKEN_WIN_PROBABILITY;
}

export function buyDaiquiriUnlock(
  tokenBalance: number,
  alreadyUnlocked: boolean,
): { tokenBalance: number; unlocked: true } | null {
  const safeBalance = Math.max(0, Math.floor(tokenBalance));
  if (alreadyUnlocked || safeBalance < DAIQUIRI_UNLOCK_PRICE) return null;
  return { tokenBalance: safeBalance - DAIQUIRI_UNLOCK_PRICE, unlocked: true };
}

export function buyDaiquiriBottle(
  tokenBalance: number,
  bottleCount: number,
  unlocked: boolean,
): { tokenBalance: number; bottleCount: number } | null {
  const safeBalance = Math.max(0, Math.floor(tokenBalance));
  const safeBottles = Math.max(0, Math.floor(bottleCount));
  if (!unlocked || safeBalance < DAIQUIRI_BOTTLE_PRICE) return null;
  return {
    tokenBalance: safeBalance - DAIQUIRI_BOTTLE_PRICE,
    bottleCount: safeBottles + 1,
  };
}

export function redeemDaiquiriBottle(
  bottleCount: number,
  alreadyArmed: boolean,
): { bottleCount: number; armed: true } | null {
  const safeBottles = Math.max(0, Math.floor(bottleCount));
  if (alreadyArmed || safeBottles < 1) return null;
  return { bottleCount: safeBottles - 1, armed: true };
}

export function buyStaminUpUnlock(
  tokenBalance: number,
  alreadyUnlocked: boolean,
): { tokenBalance: number; unlocked: true } | null {
  const safeBalance = Math.max(0, Math.floor(tokenBalance));
  if (alreadyUnlocked || safeBalance < STAMIN_UP_UNLOCK_PRICE) return null;
  return { tokenBalance: safeBalance - STAMIN_UP_UNLOCK_PRICE, unlocked: true };
}

export function buyStaminUpBottle(
  tokenBalance: number,
  bottleCount: number,
  unlocked: boolean,
): { tokenBalance: number; bottleCount: number } | null {
  const safeBalance = Math.max(0, Math.floor(tokenBalance));
  const safeBottles = Math.max(0, Math.floor(bottleCount));
  if (!unlocked || safeBalance < STAMIN_UP_BOTTLE_PRICE) return null;
  return {
    tokenBalance: safeBalance - STAMIN_UP_BOTTLE_PRICE,
    bottleCount: safeBottles + 1,
  };
}

export function redeemStaminUpBottle(
  bottleCount: number,
  alreadyArmed: boolean,
): { bottleCount: number; armed: true } | null {
  const safeBottles = Math.max(0, Math.floor(bottleCount));
  if (alreadyArmed || safeBottles < 1) return null;
  return { bottleCount: safeBottles - 1, armed: true };
}

export function canArmBrewBottle(
  quickReviveArmed: boolean,
  daiquiriArmed: boolean,
  staminUpArmed: boolean,
): boolean {
  return !quickReviveArmed && !daiquiriArmed && !staminUpArmed;
}

export function getDaiquiriWinProbability(daiquiriArmed: boolean): number {
  return daiquiriArmed ? DAIQUIRI_WIN_PROBABILITY : BREW_TOKEN_WIN_PROBABILITY;
}

export type BrewBetEffect = {
  payoutMultiplier?: number;
  rewardAsDarkBrew?: boolean;
};

export function resolveBrewBetOutcome(
  brewTokenBalance: number,
  darkBrewTokenBalance: number,
  bet: number,
  won: boolean,
  effect: BrewBetEffect = {},
): { brewTokens: number; darkBrewTokens: number } {
  const safeBrewBalance = Math.max(0, Math.floor(brewTokenBalance));
  const safeDarkBalance = Math.max(0, Math.floor(darkBrewTokenBalance));
  const safeBet = Math.max(0, Math.min(Math.floor(bet), safeBrewBalance));

  if (effect.rewardAsDarkBrew && won) {
    return { brewTokens: safeBrewBalance, darkBrewTokens: safeDarkBalance + safeBet };
  }

  return {
    brewTokens: resolveBrewBet(safeBrewBalance, safeBet, won, effect.payoutMultiplier),
    darkBrewTokens: safeDarkBalance,
  };
}

export function resolveBrewBet(
  balance: number,
  bet: number,
  won: boolean,
  payoutMultiplier = 1,
): number {
  const safeBalance = Math.max(0, Math.floor(balance));
  const safeBet = Math.max(0, Math.min(Math.floor(bet), safeBalance));
  const safeMultiplier = Math.max(1, Math.floor(payoutMultiplier));
  return won ? safeBalance + safeBet * safeMultiplier : safeBalance - safeBet;
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