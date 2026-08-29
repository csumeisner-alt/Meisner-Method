import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BREW_BANK_ACCESS_DURATION_MS,
  BREW_BANK_KEY_PRICE,
  BREW_TOKEN_WIN_PROBABILITY,
  DAIQUIRI_BOTTLE_PRICE,
  DAIQUIRI_LOSS_PROBABILITY,
  DAIQUIRI_PAYOUT_MULTIPLIER,
  DAIQUIRI_UNLOCK_PRICE,
  DAIQUIRI_WIN_PROBABILITY,
  STAMIN_UP_BOTTLE_PRICE,
  STAMIN_UP_UNLOCK_PRICE,
  SMART_PRO_BOTTLE_PRICE,
  SMART_PRO_SALE_DURATION_MS,
  SMART_PRO_UNLOCK_PRICE,
  QUICK_REVIVE_BOTTLE_PRICE,
  QUICK_REVIVE_UNLOCK_PRICE,
  QUICK_REVIVE_WIN_PROBABILITY,
  claimQuoteView,
  BREW_TOKEN_QUOTE_THRESHOLD,
  createSerialWriteQueue,
  buyBrewBankKey,
  buyQuickReviveBottle,
  buyQuickReviveUnlock,
  buyDaiquiriBottle,
  buyDaiquiriUnlock,
  buyStaminUpBottle,
  buyStaminUpUnlock,
  buySmartProBottle,
  buySmartProUnlock,
  canEnterBrewBank,
  canArmBrewBottle,
  canActivateBrewBankKey,
  formatBrewBankAccessRemaining,
  formatSmartProRemaining,
  getSmartProBottleSalePrice,
  getBrewBottleInspection,
  getBrewBottlePreview,
  getBrewWinProbability,
  getDaiquiriWinProbability,
  hasBrewBankAccess,
  hasSmartProSale,
  INITIAL_BREW_TOKENS,
  isBrewBankHalfway,
  isBrewBankUnlock,
  isWeekday,
  parseStoredNonNegative,
  resolveBrewBet,
  resolveBrewBetOutcome,
  redeemQuickReviveBottle,
  redeemDaiquiriBottle,
  redeemStaminUpBottle,
  redeemSmartProBottle,
} from '../brewTokenLogic.ts';

test('Brew Bank unlocks exactly when the quote threshold is crossed', () => {
  assert.equal(isBrewBankUnlock(BREW_TOKEN_QUOTE_THRESHOLD - 1, BREW_TOKEN_QUOTE_THRESHOLD), true);
  assert.equal(isBrewBankUnlock(BREW_TOKEN_QUOTE_THRESHOLD, BREW_TOKEN_QUOTE_THRESHOLD + 1), false);
});

test('Brew Bank halfway milestone triggers only when crossing the midpoint', () => {
  assert.equal(isBrewBankHalfway(10, 11), true);
  assert.equal(isBrewBankHalfway(11, 12), false);
  assert.equal(isBrewBankHalfway(0, 10), false);
});

test('Brew Token storage parsing rejects invalid and negative values', () => {
  assert.equal(parseStoredNonNegative('12'), 12);
  assert.equal(parseStoredNonNegative('-4'), 0);
  assert.equal(parseStoredNonNegative('not-a-number'), 0);
});

test('weekday detection includes Monday through Friday only', () => {
  assert.equal(isWeekday(1), true);
  assert.equal(isWeekday(5), true);
  assert.equal(isWeekday(0), false);
  assert.equal(isWeekday(6), false);
});

test('bank keys cost ten tokens and never overspend', () => {
  assert.deepEqual(buyBrewBankKey(12, 1), { tokenBalance: 2, keyCount: 2 });
  assert.equal(buyBrewBankKey(BREW_BANK_KEY_PRICE - 1, 0), null);
});

test('Quick Revive unlock costs forty tokens exactly once', () => {
  assert.deepEqual(buyQuickReviveUnlock(QUICK_REVIVE_UNLOCK_PRICE, false), {
    tokenBalance: 0,
    unlocked: true,
  });
  assert.equal(buyQuickReviveUnlock(QUICK_REVIVE_UNLOCK_PRICE - 1, false), null);
  assert.equal(buyQuickReviveUnlock(99, true), null);
});

test('Quick Revive bottles cost two tokens only after the item is unlocked', () => {
  assert.equal(buyQuickReviveBottle(20, 0, false), null);
  assert.equal(buyQuickReviveBottle(QUICK_REVIVE_BOTTLE_PRICE - 1, 0, true), null);
  assert.deepEqual(buyQuickReviveBottle(7, 2, true), { tokenBalance: 5, bottleCount: 3 });
  assert.deepEqual(buyQuickReviveBottle(2.9, -6, true), { tokenBalance: 0, bottleCount: 1 });
});

test('Quick Revive consumes one bottle to arm one boosted toss', () => {
  assert.deepEqual(redeemQuickReviveBottle(2, false), { bottleCount: 1, armed: true });
  assert.equal(redeemQuickReviveBottle(0, false), null);
  assert.equal(redeemQuickReviveBottle(1, true), null);
  assert.equal(getBrewWinProbability(false), BREW_TOKEN_WIN_PROBABILITY);
  assert.equal(getBrewWinProbability(true), QUICK_REVIVE_WIN_PROBABILITY);
});

test('bottle inspection metadata mirrors shop costs, odds, and Stamin Up conversion', () => {
  assert.deepEqual(getBrewBottlePreview('quickRevive'), {
    kind: 'quickRevive',
    title: 'QUICK REVIVE',
    unlockPrice: QUICK_REVIVE_UNLOCK_PRICE,
    bottlePrice: QUICK_REVIVE_BOTTLE_PRICE,
    winProbability: QUICK_REVIVE_WIN_PROBABILITY,
    lossProbability: 1 - QUICK_REVIVE_WIN_PROBABILITY,
    description: 'Break one into the machine before a toss to raise your next win chance by 7 points, from 55% to 62%.',
    conversionCopy: null,
  });
  assert.equal(getBrewBottlePreview('daiquiri').lossProbability, DAIQUIRI_LOSS_PROBABILITY);
  assert.equal(getBrewBottlePreview('staminUp').conversionCopy, 'Stamin Up keeps your Brew Token stake on a win and sends an equal reward to Dark Brew Tokens. Dark Brew Tokens cannot be bet or lost.');
});

test('opening and closing every bottle inspection preserves balance, inventory, and armed state', () => {
  const before = {
    tokens: 47,
    quickReviveUnlocked: true,
    quickReviveBottles: 3,
    quickReviveArmed: false,
    daiquiriUnlocked: true,
    daiquiriBottles: 2,
    daiquiriArmed: true,
    staminUpUnlocked: true,
    staminUpBottles: 4,
    staminUpArmed: false,
    smartProUnlocked: true,
    smartProBottles: 5,
    smartProActive: false,
  };

  const expected = {
    quickRevive: { bottlePrice: 2, odds: '62% WIN · 38% LOSS', bottles: 3, armed: false },
    daiquiri: { bottlePrice: 8, odds: '45% WIN · 65% LOSS', bottles: 2, armed: true },
    staminUp: { bottlePrice: 16, odds: '55% WIN · 45% LOSS', bottles: 4, armed: false },
    smartPro: { bottlePrice: 3, odds: '55% WIN · 45% LOSS', bottles: 5, armed: false },
  } as const;

  for (const kind of ['quickRevive', 'daiquiri', 'staminUp', 'smartPro'] as const) {
    const inspection = getBrewBottleInspection(kind, before);

    assert.equal(inspection.preview.bottlePrice, expected[kind].bottlePrice);
    assert.equal(
      `${Math.round(inspection.preview.winProbability * 100)}% WIN · ${Math.round(inspection.preview.lossProbability * 100)}% LOSS`,
      expected[kind].odds,
    );
    assert.equal(inspection.bottleCount, expected[kind].bottles);
    assert.equal(inspection.armed, expected[kind].armed);
    assert.equal(inspection.snapshot.tokens, before.tokens);

    // Closing the preview returns the unchanged account snapshot; inspection
    // itself has no purchase, redemption, or balance mutation side effect.
    assert.deepEqual(inspection.snapshot, before);
  }
});

test('Dave Ramsey Daiquiri unlock costs one hundred tokens exactly once', () => {
  assert.deepEqual(buyDaiquiriUnlock(DAIQUIRI_UNLOCK_PRICE, false), {
    tokenBalance: 0,
    unlocked: true,
  });
  assert.equal(buyDaiquiriUnlock(DAIQUIRI_UNLOCK_PRICE - 1, false), null);
  assert.equal(buyDaiquiriUnlock(200, true), null);
});

test('Dave Ramsey Daiquiri bottles cost eight tokens only after unlock', () => {
  assert.equal(buyDaiquiriBottle(99, 0, false), null);
  assert.equal(buyDaiquiriBottle(DAIQUIRI_BOTTLE_PRICE - 1, 0, true), null);
  assert.deepEqual(buyDaiquiriBottle(16, 2, true), { tokenBalance: 8, bottleCount: 3 });
  assert.deepEqual(buyDaiquiriBottle(8.9, -2, true), { tokenBalance: 0, bottleCount: 1 });
});

test('Dave Ramsey Daiquiri consumes one bottle and applies its requested odds for one toss', () => {
  assert.deepEqual(redeemDaiquiriBottle(2, false), { bottleCount: 1, armed: true });
  assert.equal(redeemDaiquiriBottle(0, false), null);
  assert.equal(redeemDaiquiriBottle(1, true), null);
  assert.equal(getDaiquiriWinProbability(false), BREW_TOKEN_WIN_PROBABILITY);
  assert.equal(getDaiquiriWinProbability(true), DAIQUIRI_WIN_PROBABILITY);
  assert.equal(DAIQUIRI_LOSS_PROBABILITY, 0.65);
});

test('Stamin Up unlocks at five hundred tokens and its bottles cost sixteen tokens', () => {
  assert.deepEqual(buyStaminUpUnlock(STAMIN_UP_UNLOCK_PRICE, false), {
    tokenBalance: 0,
    unlocked: true,
  });
  assert.equal(buyStaminUpUnlock(STAMIN_UP_UNLOCK_PRICE - 1, false), null);
  assert.equal(buyStaminUpUnlock(900, true), null);
  assert.equal(buyStaminUpBottle(20, 0, false), null);
  assert.equal(buyStaminUpBottle(STAMIN_UP_BOTTLE_PRICE - 1, 0, true), null);
  assert.deepEqual(buyStaminUpBottle(32, -2, true), { tokenBalance: 16, bottleCount: 1 });
});

test('Stamin Up consumes exactly one bottle and no two bottle effects can arm together', () => {
  assert.deepEqual(redeemStaminUpBottle(2, false), { bottleCount: 1, armed: true });
  assert.equal(redeemStaminUpBottle(0, false), null);
  assert.equal(redeemStaminUpBottle(1, true), null);
  assert.equal(canArmBrewBottle(false, false, false), true);
  assert.equal(canArmBrewBottle(true, false, false), false);
  assert.equal(canArmBrewBottle(false, true, false), false);
  assert.equal(canArmBrewBottle(false, false, true), false);
});

test('SmartPro unlocks for one hundred tokens and its own bottles always cost three', () => {
  assert.deepEqual(buySmartProUnlock(SMART_PRO_UNLOCK_PRICE, false), {
    tokenBalance: 0,
    unlocked: true,
  });
  assert.equal(buySmartProUnlock(SMART_PRO_UNLOCK_PRICE - 1, false), null);
  assert.equal(buySmartProUnlock(200, true), null);
  assert.equal(buySmartProBottle(20, 0, false), null);
  assert.equal(buySmartProBottle(SMART_PRO_BOTTLE_PRICE - 1, 0, true), null);
  assert.deepEqual(buySmartProBottle(9, 2, true), { tokenBalance: 6, bottleCount: 3 });
});

test('SmartPro redemption consumes one bottle and activates a restart-safe 90-second sale', () => {
  const now = new Date('2026-08-29T12:00:00').getTime();
  const redeemed = redeemSmartProBottle(2, now);
  assert.deepEqual(redeemed, {
    bottleCount: 1,
    expiresAt: now + SMART_PRO_SALE_DURATION_MS,
  });
  assert.equal(hasSmartProSale(redeemed!.expiresAt, now + 89_999), true);
  assert.equal(hasSmartProSale(redeemed!.expiresAt, now + 90_000), false);
  assert.equal(redeemSmartProBottle(1, now + 1_000, redeemed!.expiresAt), null);
  assert.equal(redeemSmartProBottle(0, now), null);
  assert.equal(formatSmartProRemaining(redeemed!.expiresAt, now), '1:30');
  assert.equal(formatSmartProRemaining(redeemed!.expiresAt, now + 89_001), '0:01');
  assert.equal(formatSmartProRemaining(redeemed!.expiresAt, now + 90_000), null);
});

test('SmartPro halves other bottle prices while unlocks, key, and SmartPro stay full price', () => {
  assert.equal(getSmartProBottleSalePrice(QUICK_REVIVE_BOTTLE_PRICE, true), 1);
  assert.equal(getSmartProBottleSalePrice(DAIQUIRI_BOTTLE_PRICE, true), 4);
  assert.equal(getSmartProBottleSalePrice(STAMIN_UP_BOTTLE_PRICE, true), 8);
  assert.deepEqual(buyQuickReviveUnlock(QUICK_REVIVE_UNLOCK_PRICE, false, QUICK_REVIVE_UNLOCK_PRICE), { tokenBalance: 0, unlocked: true });
  assert.deepEqual(buyDaiquiriUnlock(DAIQUIRI_UNLOCK_PRICE, false, DAIQUIRI_UNLOCK_PRICE), { tokenBalance: 0, unlocked: true });
  assert.deepEqual(buyStaminUpUnlock(STAMIN_UP_UNLOCK_PRICE, false, STAMIN_UP_UNLOCK_PRICE), { tokenBalance: 0, unlocked: true });
  assert.deepEqual(buyQuickReviveUnlock(20, false, 20), { tokenBalance: 0, unlocked: true });
  assert.deepEqual(buyDaiquiriBottle(4, 0, true, 4), { tokenBalance: 0, bottleCount: 1 });
  assert.deepEqual(buyStaminUpUnlock(250, false, 250), { tokenBalance: 0, unlocked: true });
  assert.deepEqual(buyBrewBankKey(BREW_BANK_KEY_PRICE, 0), { tokenBalance: 0, keyCount: 1 });
  assert.deepEqual(buySmartProBottle(SMART_PRO_BOTTLE_PRICE, 0, true), { tokenBalance: 0, bottleCount: 1 });
});

test('SmartPro inspection is read-only and applies sale prices only to other bottles', () => {
  const activeSnapshot = {
    tokens: 180,
    quickReviveUnlocked: false,
    quickReviveBottles: 0,
    quickReviveArmed: false,
    daiquiriUnlocked: false,
    daiquiriBottles: 0,
    daiquiriArmed: false,
    staminUpUnlocked: false,
    staminUpBottles: 0,
    staminUpArmed: false,
    smartProUnlocked: true,
    smartProBottles: 2,
    smartProActive: true,
  };

  assert.equal(getBrewBottleInspection('quickRevive', activeSnapshot).preview.unlockPrice, QUICK_REVIVE_UNLOCK_PRICE);
  assert.equal(getBrewBottleInspection('quickRevive', activeSnapshot).preview.bottlePrice, 1);
  assert.equal(getBrewBottleInspection('daiquiri', activeSnapshot).preview.unlockPrice, DAIQUIRI_UNLOCK_PRICE);
  assert.equal(getBrewBottleInspection('daiquiri', activeSnapshot).preview.bottlePrice, 4);
  assert.equal(getBrewBottleInspection('staminUp', activeSnapshot).preview.unlockPrice, STAMIN_UP_UNLOCK_PRICE);
  assert.equal(getBrewBottleInspection('staminUp', activeSnapshot).preview.bottlePrice, 8);
  const smartProInspection = getBrewBottleInspection('smartPro', activeSnapshot);
  assert.equal(smartProInspection.preview.unlockPrice, SMART_PRO_UNLOCK_PRICE);
  assert.equal(smartProInspection.preview.bottlePrice, SMART_PRO_BOTTLE_PRICE);
  assert.equal(smartProInspection.armed, true);
  assert.deepEqual(smartProInspection.snapshot, activeSnapshot);
});

test('bank key access can only activate on weekdays and lasts twelve hours', () => {
  const mondayMorning = new Date('2026-08-17T09:00:00').getTime();
  assert.equal(canActivateBrewBankKey(1, 1, null, mondayMorning), true);
  assert.equal(canActivateBrewBankKey(1, 0, null, mondayMorning), false);
  assert.equal(canActivateBrewBankKey(1, 1, mondayMorning + 1_000, mondayMorning), false);
  assert.equal(hasBrewBankAccess(mondayMorning + BREW_BANK_ACCESS_DURATION_MS, mondayMorning), true);
  assert.equal(hasBrewBankAccess(mondayMorning + BREW_BANK_ACCESS_DURATION_MS, mondayMorning + BREW_BANK_ACCESS_DURATION_MS), false);
});

test('weekday bank entry requires redeemed active access', () => {
  const mondayMorning = new Date('2026-08-17T09:00:00').getTime();
  assert.equal(canEnterBrewBank(1, null, mondayMorning), false);
  assert.equal(canEnterBrewBank(1, mondayMorning + 1_000, mondayMorning), true);
  assert.equal(canEnterBrewBank(0, null, mondayMorning), true);
});

test('bank access countdown formats remaining hours and minutes and expires at zero', () => {
  const now = new Date('2026-08-17T09:00:00').getTime();
  assert.equal(formatBrewBankAccessRemaining(now + 2 * 60 * 60 * 1000 + 31_000, now), '2h 01m remaining');
  assert.equal(formatBrewBankAccessRemaining(now + 59_000, now), '0h 01m remaining');
  assert.equal(formatBrewBankAccessRemaining(now, now), null);
});

test('winning a bet returns the stake as profit and losing removes only the stake', () => {
  assert.equal(resolveBrewBet(INITIAL_BREW_TOKENS, 2, true), 7);
  assert.equal(resolveBrewBet(INITIAL_BREW_TOKENS, 2, false), 3);
  assert.equal(resolveBrewBet(1, 4, false), 0);
});

test('Dave Ramsey Daiquiri doubles a winning award but never reduces a losing stake', () => {
  assert.equal(resolveBrewBet(10, 3, true, DAIQUIRI_PAYOUT_MULTIPLIER), 16);
  assert.equal(resolveBrewBet(10, 3, false, DAIQUIRI_PAYOUT_MULTIPLIER), 7);
  assert.equal(resolveBrewBet(10, 3, true, 0), 13);
});

test('Stamin Up sends only a win award to Dark Brew Tokens and never allows them to be lost', () => {
  assert.deepEqual(resolveBrewBetOutcome(10, 4, 3, true, { rewardAsDarkBrew: true }), {
    brewTokens: 10,
    darkBrewTokens: 7,
  });
  assert.deepEqual(resolveBrewBetOutcome(10, 4, 3, false, { rewardAsDarkBrew: true }), {
    brewTokens: 7,
    darkBrewTokens: 4,
  });
  assert.deepEqual(resolveBrewBetOutcome(10, -3, 8, true, { rewardAsDarkBrew: true }), {
    brewTokens: 10,
    darkBrewTokens: 8,
  });
});

test('quote view claims are idempotent and bounded', () => {
  const remembered = new Set<string>();
  assert.equal(claimQuoteView(remembered, 'tape-1', 2), true);
  assert.equal(claimQuoteView(remembered, 'tape-1', 2), false);
  assert.equal(claimQuoteView(remembered, 'tape-2', 2), true);
  assert.equal(claimQuoteView(remembered, 'tape-3', 2), true);
  assert.equal(remembered.has('tape-1'), false);
  assert.equal(claimQuoteView(remembered, 'tape-1', 2), true);
});

test('serial write queue preserves mutation order after an earlier failure', async () => {
  const queue = createSerialWriteQueue();
  const events: string[] = [];

  const first = queue(async () => {
    events.push('first:start');
    await new Promise(resolve => setTimeout(resolve, 5));
    events.push('first:fail');
    throw new Error('simulated storage failure');
  }).catch(() => {});
  const second = queue(async () => {
    events.push('second:start');
    events.push('second:finish');
  });

  await Promise.all([first, second]);
  assert.deepEqual(events, ['first:start', 'first:fail', 'second:start', 'second:finish']);
});