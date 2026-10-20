import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACHIEVEMENTS,
  claimAchievement,
  hasCompletedAllAchievements,
  PREMIUM_FLAGS,
  parsePremiumFlagId,
  parseEarnedAchievementIds,
} from '../achievements.ts';

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

test('premium flag badge unlock requires all 15 unique achievements', () => {
  const ids = ACHIEVEMENTS.map((achievement) => achievement.id);
  assert.equal(hasCompletedAllAchievements(ids), true);
  assert.equal(hasCompletedAllAchievements(ids.slice(1)), false);
  assert.equal(hasCompletedAllAchievements([...ids, ids[0]]), true);
});

test('all five premium American flag choices and saved selections are validated', () => {
  assert.equal(PREMIUM_FLAGS.length, 5);
  assert.equal(parsePremiumFlagId('midnight'), 'midnight');
  assert.equal(parsePremiumFlagId('unknown'), null);
  assert.equal(parsePremiumFlagId(null), null);
});
