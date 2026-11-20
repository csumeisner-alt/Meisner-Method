import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const paper = readFileSync(new URL('../app/(tabs)/paper.tsx', import.meta.url), 'utf8');
const lightning = readFileSync(new URL('../components/LightningRoundScreen.tsx', import.meta.url), 'utf8');
const arena = readFileSync(new URL('../components/EventArenaScreen.tsx', import.meta.url), 'utf8');
const leaderboard = readFileSync(new URL('../components/PaperChallengeLeaderboard.tsx', import.meta.url), 'utf8');

test('Paper account management exposes guest pairing and code restore controls', () => {
  assert.match(paper, /testID="create-saved-data-transfer-code"/);
  assert.match(paper, /testID="open-event-arena-restore"/);
  assert.match(paper, /testID="saved-data-device-transfer-code-input"/);
  assert.match(paper, /testID="replace-conflicting-transfer-data"/);
  assert.match(paper, /createDeviceTransfer\(\{ bundle \}/);
  assert.match(paper, /redeemDeviceTransfer\(\{ code, destinationToken \}/);
  assert.match(paper, /\/api\/event-arena\/device-pairing\/redeem/);
  assert.match(paper, /await restoreLegacyEventArenaTransfer\(\)/);
  assert.match(paper, /saveAll\(\s*nextCache\.accounts/);
});

test('paired Event Arena screens retain the original Lightning participant identity', () => {
  for (const screen of [paper, lightning, arena, leaderboard]) {
    assert.match(screen, /getEventArenaParticipantId/);
  }
});

test('paired paper writes use revision-checked sync without changing staged-order execution ownership', () => {
  assert.match(paper, /X-Event-Arena-Revision/);
  assert.match(paper, /\/api\/event-arena\/device-sync/);
  assert.match(paper, /The server worker, not this foreground loop, owns staged fills/);
});
