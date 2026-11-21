import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ANALYZE_SEARCH_ACHIEVEMENT_THRESHOLD,
  ACHIEVEMENTS,
  getTrainingTapeAchievementsForOpenCount,
  INITIAL_ACHIEVEMENT_SEAL_STATE,
  achievementSealReducer,
  claimAchievement,
  hasCompletedAllAchievements,
  shouldPresentAchievementSeal,
  shouldPresentAchievementSealOnHydration,
  parseAchievementSealShown,
  ACHIEVEMENT_UNLOCKED_FLAGS,
  ALL_PREMIUM_FLAGS,
  DEFAULT_FLAG_ID,
  hasUnlockedPrideFlag,
  PRIDE_FLAG_QUOTE_THRESHOLD,
  parsePremiumFlagId,
  parseEarnedAchievementIds,
  parseAnalyzeSearchCount,
  parseTrainingTapeOpenCount,
  resolvePremiumFlagSelection,
  enqueueAchievementToast,
  dismissAchievementToast,
} from '../achievements.ts';

test('achievement toast queue preserves every unlock in order', () => {
  const unlocked = ACHIEVEMENTS.slice(0, 3);
  let queue: (typeof ACHIEVEMENTS)[number][] = [];

  for (const achievement of unlocked) {
    queue = enqueueAchievementToast(queue, achievement);
  }

  assert.deepEqual(queue.map(({ id }) => id), unlocked.map(({ id }) => id));
  queue = dismissAchievementToast(queue);
  assert.deepEqual(queue.map(({ id }) => id), ['quote-10', 'quote-25']);
  queue = dismissAchievementToast(queue);
  queue = dismissAchievementToast(queue);
  assert.deepEqual(queue, []);
  assert.deepEqual(dismissAchievementToast(queue), []);
});

test('claiming an achievement is one-time and returns its reward metadata', () => {
  const result = claimAchievement([], 'first-quote');
  assert.deepEqual(result?.earnedIds, ['first-quote']);
  assert.equal(result?.achievement.title, 'Signal Seeker');
  assert.equal(claimAchievement(result!.earnedIds, 'first-quote'), null);
  assert.equal(claimAchievement(result!.earnedIds, 'not-an-achievement'), null);
});

test('earned achievement storage parsing ignores unknown IDs and duplicates', () => {
  assert.deepEqual(
    parseEarnedAchievementIds(JSON.stringify(['first-paper-order', 'unknown', 'first-paper-order', 'first-quote'])),
    ['first-paper-order', 'first-quote'],
  );
  assert.deepEqual(parseEarnedAchievementIds('not-json'), []);
  assert.deepEqual(parseEarnedAchievementIds(JSON.stringify({ first: true })), []);
  assert.equal(ACHIEVEMENTS.length, 15);
});

test('Market Scholar and Oracle use the replacement milestones', () => {
  assert.equal(ANALYZE_SEARCH_ACHIEVEMENT_THRESHOLD, 15);
  assert.equal(ACHIEVEMENTS.find(({ id }) => id === 'quote-50')?.description, 'Completed five sell trades in Portfolio.');
  assert.equal(ACHIEVEMENTS.find(({ id }) => id === 'quote-100')?.description, 'Completed 15 Analyze searches.');
  assert.equal(parseAnalyzeSearchCount(null), 0);
  assert.equal(parseAnalyzeSearchCount('14'), 14);
  assert.equal(parseAnalyzeSearchCount('15'), ANALYZE_SEARCH_ACHIEVEMENT_THRESHOLD);
  assert.equal(parseAnalyzeSearchCount('-1'), 0);
  assert.equal(parseAnalyzeSearchCount('1.5'), 0);
  assert.equal(parseAnalyzeSearchCount('invalid'), 0);
});

test('Training Tape achievements count openings independently of displayed Biden quotes', () => {
  assert.equal(parseTrainingTapeOpenCount(null), 0);
  assert.equal(parseTrainingTapeOpenCount('24'), 24);
  assert.equal(parseTrainingTapeOpenCount('-1'), 0);
  assert.deepEqual(getTrainingTapeAchievementsForOpenCount(0), []);
  assert.deepEqual(getTrainingTapeAchievementsForOpenCount(1), ['first-quote']);
  assert.deepEqual(getTrainingTapeAchievementsForOpenCount(9), ['first-quote']);
  assert.deepEqual(getTrainingTapeAchievementsForOpenCount(10), ['first-quote', 'quote-10']);
  assert.deepEqual(
    getTrainingTapeAchievementsForOpenCount(25),
    ['first-quote', 'quote-10', 'quote-25'],
  );
  assert.equal(ACHIEVEMENTS.find(({ id }) => id === 'quote-10')?.description, 'Opened Training Tape 10 times.');
  assert.equal(ACHIEVEMENTS.find(({ id }) => id === 'quote-25')?.description, 'Opened Training Tape 25 times.');
});

test('premium flag badge unlock requires all 15 unique achievements', () => {
  const ids = ACHIEVEMENTS.map((achievement) => achievement.id);
  assert.equal(hasCompletedAllAchievements(ids), true);
  assert.equal(hasCompletedAllAchievements(ids.slice(1)), false);
  assert.equal(hasCompletedAllAchievements([...ids, ids[0]]), true);
});

test('Final Seal appears only for the newly earned 15th achievement and only once', () => {
  let earnedIds: (typeof ACHIEVEMENTS)[number]['id'][] = [];
  let sealState = INITIAL_ACHIEVEMENT_SEAL_STATE;

  for (const achievement of ACHIEVEMENTS.slice(0, -1)) {
    const claim = claimAchievement(earnedIds, achievement.id);
    assert.ok(claim);
    earnedIds = claim.earnedIds;
    assert.equal(
      shouldPresentAchievementSeal(sealState, claim.achievement.id, earnedIds),
      false,
    );
    sealState = achievementSealReducer(sealState, {
      type: 'achievement-toast',
      achievementId: claim.achievement.id,
      earnedIds,
    });
    assert.equal(sealState.visible, false);
  }

  const finalAchievement = ACHIEVEMENTS[ACHIEVEMENTS.length - 1];
  const finalClaim = claimAchievement(earnedIds, finalAchievement.id);
  assert.ok(finalClaim);
  earnedIds = finalClaim.earnedIds;
  assert.equal(earnedIds.length, 15);
  assert.equal(shouldPresentAchievementSeal(sealState, finalClaim.achievement.id, earnedIds), true);
  sealState = achievementSealReducer(sealState, {
    type: 'achievement-toast',
    achievementId: finalClaim.achievement.id,
    earnedIds,
  });
  assert.deepEqual(sealState, { visible: true, shown: true });

  const rerenderState = achievementSealReducer(sealState, {
    type: 'achievement-toast',
    achievementId: finalClaim.achievement.id,
    earnedIds,
  });
  assert.equal(rerenderState, sealState);
  assert.equal(shouldPresentAchievementSeal(sealState, finalClaim.achievement.id, earnedIds), false);
  assert.equal(shouldPresentAchievementSeal(sealState, ACHIEVEMENTS[0].id, earnedIds), false);
  assert.equal(claimAchievement(earnedIds, finalAchievement.id), null);

  // Hydration restores completion, and the one-time marker controls catch-up.
  const reopenedState = INITIAL_ACHIEVEMENT_SEAL_STATE;
  assert.equal(hasCompletedAllAchievements(earnedIds), true);
  assert.equal(reopenedState.visible, false);
  assert.equal(reopenedState.shown, false);
  assert.equal(shouldPresentAchievementSealOnHydration(reopenedState, earnedIds, false, false), false);
  assert.equal(shouldPresentAchievementSealOnHydration(reopenedState, earnedIds, true, false), true);
  assert.equal(shouldPresentAchievementSealOnHydration(reopenedState, earnedIds, true, true), false);
  const catchUpState = achievementSealReducer(reopenedState, {
    type: 'completion-hydrated',
    earnedIds,
  });
  assert.deepEqual(catchUpState, { visible: true, shown: true });
});

test('completion celebration marker parses persisted state and prevents another catch-up', () => {
  const earnedIds = ACHIEVEMENTS.map(({ id }) => id);
  assert.equal(parseAchievementSealShown(null), false);
  assert.equal(parseAchievementSealShown('false'), false);
  assert.equal(parseAchievementSealShown('true'), true);

  const afterDismissal = achievementSealReducer(
    achievementSealReducer(
      INITIAL_ACHIEVEMENT_SEAL_STATE,
      { type: 'completion-hydrated', earnedIds },
    ),
    { type: 'dismiss' },
  );
  assert.deepEqual(afterDismissal, { visible: false, shown: true });
  assert.equal(
    shouldPresentAchievementSealOnHydration(afterDismissal, earnedIds, true, parseAchievementSealShown('true')),
    false,
  );
});

test('Final Seal dismiss and choose actions close the celebration without resetting its one-time gate', () => {
  const earnedIds = ACHIEVEMENTS.map((achievement) => achievement.id);
  const shownState = achievementSealReducer(INITIAL_ACHIEVEMENT_SEAL_STATE, {
    type: 'achievement-toast',
    achievementId: ACHIEVEMENTS[ACHIEVEMENTS.length - 1].id,
    earnedIds,
  });
  assert.deepEqual(shownState, { visible: true, shown: true });

  const dismissedState = achievementSealReducer(shownState, { type: 'dismiss' });
  assert.deepEqual(dismissedState, { visible: false, shown: true });
  assert.equal(
    shouldPresentAchievementSeal(dismissedState, ACHIEVEMENTS[ACHIEVEMENTS.length - 1].id, earnedIds),
    false,
  );

  const chooseFlagsState = achievementSealReducer(shownState, { type: 'choose-title-flag' });
  assert.deepEqual(chooseFlagsState, { visible: false, shown: true });
  assert.equal(
    shouldPresentAchievementSeal(chooseFlagsState, ACHIEVEMENTS[ACHIEVEMENTS.length - 1].id, earnedIds),
    false,
  );
});

test('five achievement flags, default flag, and quote-gated Pride are validated', () => {
  assert.equal(ACHIEVEMENT_UNLOCKED_FLAGS.length, 5);
  assert.equal(ALL_PREMIUM_FLAGS.length, 6);
  assert.equal(PRIDE_FLAG_QUOTE_THRESHOLD, 30);
  assert.equal(hasUnlockedPrideFlag(21), false);
  assert.equal(hasUnlockedPrideFlag(22), false);
  assert.equal(hasUnlockedPrideFlag(29), false);
  assert.equal(hasUnlockedPrideFlag(30), true);
  assert.equal(parsePremiumFlagId('midnight'), 'midnight');
  assert.equal(parsePremiumFlagId('southern-cross'), 'southern-cross');
  assert.equal(parsePremiumFlagId('default'), 'default');
  assert.equal(parsePremiumFlagId('eagle'), 'eagle');
  assert.equal(parsePremiumFlagId('unknown'), null);
  assert.equal(parsePremiumFlagId(null), null);
  assert.equal(resolvePremiumFlagSelection(null), DEFAULT_FLAG_ID);
  assert.equal(resolvePremiumFlagSelection('unknown'), DEFAULT_FLAG_ID);
  assert.equal(resolvePremiumFlagSelection('default'), DEFAULT_FLAG_ID);
  for (const flag of ALL_PREMIUM_FLAGS) {
    assert.equal(resolvePremiumFlagSelection(flag.id), flag.id);
  }
  for (const flag of ACHIEVEMENT_UNLOCKED_FLAGS) {
    assert.equal(resolvePremiumFlagSelection(flag.id), flag.id);
  }
});
