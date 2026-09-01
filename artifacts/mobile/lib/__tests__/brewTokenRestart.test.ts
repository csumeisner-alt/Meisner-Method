import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NEON_GUCCI_PHRASE_PACK_PRICE,
  buyNeonGucciPhrasePack,
  getNeonGucciPhrasePackDisplay,
} from '../brewTokenLogic.ts';
import {
  createBrewEconomySnapshot,
  parseBrewEconomySnapshot,
  persistBrewEconomySnapshot,
  serializeBrewEconomySnapshot,
  type BrewEconomySnapshot,
  type BrewEconomySnapshotStorage,
} from '../brewTokenPersistence.ts';
import {
  ANALYSIS_LOADING_STAGES,
  getAnalysisLoadingStages,
} from '../analysisLoadingStages.ts';

class RestartStorage implements BrewEconomySnapshotStorage {
  private value: string | null = null;

  async getItem(_key: string): Promise<string | null> {
    return this.value;
  }

  async setItem(_key: string, value: string): Promise<void> {
    this.value = value;
  }
}

function initialSnapshot(): BrewEconomySnapshot {
  return createBrewEconomySnapshot({
    quotesViewed: 22,
    isUnlocked: true,
    brewTokens: 20,
    bankKeys: 0,
    bankAccessExpiresAt: null,
    quickReviveUnlocked: false,
    quickReviveBottles: 0,
    quickReviveArmed: false,
    daiquiriUnlocked: false,
    daiquiriBottles: 0,
    daiquiriArmed: false,
    staminUpUnlocked: false,
    staminUpBottles: 0,
    staminUpArmed: false,
    smartProUnlocked: false,
    smartProBottles: 0,
    smartProSaleExpiresAt: null,
    darkBrewTokens: 10_000,
    neonGucciActive: true,
    neonGucciPhrasesUnlocked: false,
    neonGucciPhrasesActive: false,
    claimedQuoteViewIds: [],
    activityLog: [],
  });
}

async function reload(storage: RestartStorage): Promise<BrewEconomySnapshot> {
  const raw = await storage.getItem('@stocksense/brew_economy_snapshot_v1');
  const snapshot = parseBrewEconomySnapshot(raw);
  assert.ok(snapshot, 'the app should hydrate a valid Brew economy snapshot after restart');
  return snapshot;
}

async function persistMutation(
  storage: RestartStorage,
  current: BrewEconomySnapshot,
  next: Partial<BrewEconomySnapshot>,
): Promise<BrewEconomySnapshot> {
  const snapshot = createBrewEconomySnapshot({ ...current, ...next });
  assert.equal(await persistBrewEconomySnapshot(storage, snapshot), true);
  return reload(storage);
}

test('phrase-pack settings survive Central Bank restart flow without changing the visual theme', async () => {
  const storage = new RestartStorage();
  const starting = initialSnapshot();
  assert.equal(await persistBrewEconomySnapshot(storage, starting), true);

  const purchased = buyNeonGucciPhrasePack(
    starting.brewTokens,
    starting.neonGucciPhrasesUnlocked,
  );
  assert.deepEqual(purchased, {
    tokenBalance: starting.brewTokens - NEON_GUCCI_PHRASE_PACK_PRICE,
    unlocked: true,
    active: true,
  });

  const afterPurchase = await persistMutation(storage, starting, {
    brewTokens: purchased!.tokenBalance,
    neonGucciPhrasesUnlocked: purchased!.unlocked,
    neonGucciPhrasesActive: purchased!.active,
  });
  assert.equal(afterPurchase.brewTokens, 10, 'the pack purchase costs exactly 10 Brew Tokens');
  assert.equal(afterPurchase.neonGucciPhrasesUnlocked, true);
  assert.equal(afterPurchase.neonGucciPhrasesActive, true);
  assert.equal(afterPurchase.neonGucciActive, true);
  assert.deepEqual(getNeonGucciPhrasePackDisplay(
    afterPurchase.neonGucciPhrasesUnlocked,
    afterPurchase.neonGucciPhrasesActive,
  ), {
    pill: 'ON',
    title: 'UNHINGED LOADING COPY',
    subtitle: 'The 15-pack is active',
  });

  // A fresh hook mount reads the same snapshot the Central Bank writes.
  const afterRestart = await reload(storage);
  assert.equal(afterRestart.brewTokens, 10);
  assert.equal(afterRestart.neonGucciPhrasesUnlocked, true);
  assert.equal(afterRestart.neonGucciPhrasesActive, true);
  assert.equal(afterRestart.neonGucciActive, true);
  assert.equal(getAnalysisLoadingStages(afterRestart.neonGucciPhrasesActive).length, 15);

  const afterToggleOff = await persistMutation(storage, afterRestart, {
    neonGucciPhrasesActive: false,
  });
  assert.equal(afterToggleOff.brewTokens, 10);
  assert.equal(afterToggleOff.neonGucciPhrasesUnlocked, true, 'turning the pack off does not revoke ownership');
  assert.equal(afterToggleOff.neonGucciPhrasesActive, false);
  assert.equal(afterToggleOff.neonGucciActive, true, 'phrase settings do not change Hybrid Neon Gucci');
  assert.deepEqual(getNeonGucciPhrasePackDisplay(
    afterToggleOff.neonGucciPhrasesUnlocked,
    afterToggleOff.neonGucciPhrasesActive,
  ), {
    pill: 'OFF',
    title: 'NORMAL LOADING COPY',
    subtitle: 'The 15-pack is resting',
  });

  const finalRestart = await reload(storage);
  assert.equal(finalRestart.brewTokens, 10);
  assert.equal(finalRestart.neonGucciPhrasesUnlocked, true);
  assert.equal(finalRestart.neonGucciPhrasesActive, false);
  assert.equal(finalRestart.neonGucciActive, true);
  assert.deepEqual(getAnalysisLoadingStages(finalRestart.neonGucciPhrasesActive), ANALYSIS_LOADING_STAGES);
  assert.equal(serializeBrewEconomySnapshot(finalRestart), serializeBrewEconomySnapshot(afterToggleOff));
});