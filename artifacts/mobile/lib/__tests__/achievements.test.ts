import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACHIEVEMENTS,
  claimAchievement,
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
  assert.equal(ACHIEVEMENTS.length, 3);
});
