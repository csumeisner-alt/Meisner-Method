import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatLightningRoundInvitationCountdown,
  getLightningRoundInvitationAction,
  getLightningRoundInvitationPhase,
  getLightningRoundInvitationRevealMode,
  getLightningRoundInvitationStorageKey,
  markLightningRoundInvitationSeen,
  shouldShowLightningRoundInvitationCountdown,
} from '../lightningRoundInvitation.ts';

const schedule = {
  startAtMs: 10_000_000,
  endAtMs: 10_000_000 + 24 * 60 * 60 * 1000,
};

test('Lightning invitation phase uses the official schedule and exact display boundaries', () => {
  assert.equal(getLightningRoundInvitationPhase(schedule, schedule.startAtMs - 72 * 60 * 60 * 1000 - 1), null);
  assert.equal(getLightningRoundInvitationPhase(schedule, schedule.startAtMs - 72 * 60 * 60 * 1000), 'preparation');
  assert.equal(getLightningRoundInvitationPhase(schedule, schedule.startAtMs), 'active');
  assert.equal(getLightningRoundInvitationPhase(schedule, schedule.endAtMs - 1), 'active');
  assert.equal(getLightningRoundInvitationPhase(schedule, schedule.endAtMs), 'post-event');
  assert.equal(getLightningRoundInvitationPhase(schedule, schedule.endAtMs + 48 * 60 * 60 * 1000 - 1), 'post-event');
  assert.equal(getLightningRoundInvitationPhase(schedule, schedule.endAtMs + 48 * 60 * 60 * 1000), null);
});

test('first-view reveal is one-time per user and event and is disabled for reduced motion', () => {
  const firstUserFirstEvent = getLightningRoundInvitationStorageKey('install-a', 'lightning-2026-12-11');
  assert.notEqual(firstUserFirstEvent, getLightningRoundInvitationStorageKey('install-b', 'lightning-2026-12-11'));
  assert.notEqual(firstUserFirstEvent, getLightningRoundInvitationStorageKey('install-a', 'lightning-2026-12-18'));
  assert.equal(getLightningRoundInvitationRevealMode(false, false), 'reveal');
  assert.equal(getLightningRoundInvitationRevealMode(true, false), 'static');
  assert.equal(getLightningRoundInvitationRevealMode(false, true), 'static');
});

test('seen markers persist once for each user and event', async () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value); },
  };
  assert.equal(await markLightningRoundInvitationSeen(storage, 'install-a', 'lightning-2026-12-11', 123), false);
  assert.equal(await markLightningRoundInvitationSeen(storage, 'install-a', 'lightning-2026-12-11', 456), true);
  assert.equal(await markLightningRoundInvitationSeen(storage, 'install-a', 'lightning-2026-12-18', 789), false);
  assert.equal(await markLightningRoundInvitationSeen(storage, 'install-b', 'lightning-2026-12-11', 789), false);
  assert.equal(values.size, 3);
});

test('invitation action follows enrollment and event phase', () => {
  assert.equal(getLightningRoundInvitationAction(false, 'preparation'), 'JOIN');
  assert.equal(getLightningRoundInvitationAction(false, 'active'), 'ENTER');
  assert.equal(getLightningRoundInvitationAction(false, 'post-event'), 'ENTER');
  assert.equal(getLightningRoundInvitationAction(true, 'preparation'), 'VIEW EVENT');
  assert.equal(getLightningRoundInvitationAction(true, 'active'), 'VIEW EVENT');
});

test('countdown is reserved for wider headers and uses official start or end timestamps', () => {
  assert.equal(shouldShowLightningRoundInvitationCountdown(375), false);
  assert.equal(shouldShowLightningRoundInvitationCountdown(420), true);
  assert.equal(formatLightningRoundInvitationCountdown(schedule, 'preparation', schedule.startAtMs - 90 * 60 * 1000), 'STARTS IN 01H 30M');
  assert.equal(formatLightningRoundInvitationCountdown(schedule, 'active', schedule.startAtMs), 'ENDS IN 1D 00H 00M');
  assert.equal(formatLightningRoundInvitationCountdown(schedule, 'post-event', schedule.endAtMs), 'CLOSES IN 2D 00H 00M');
});
