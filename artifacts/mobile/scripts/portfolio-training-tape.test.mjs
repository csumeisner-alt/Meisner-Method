import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const portfolioSource = readFileSync(
  resolve(scriptDir, "../app/portfolio.tsx"),
  "utf8",
);
const trainingTapeSource = readFileSync(
  resolve(scriptDir, "../components/TrainingTapeModal.tsx"),
  "utf8",
);

test("training tape opens by click in web preview and remains available by long press on mobile", () => {
  assert.match(
    portfolioSource,
    /onPress=\{Platform\.OS === 'web' \? handleHeaderLongPress : showHeaderHint\}/,
  );
  assert.match(portfolioSource, /onLongPress=\{handleHeaderLongPress\}/);
  assert.match(portfolioSource, /testID="grade-history-tape-trigger"/);
  assert.match(portfolioSource, /testID="open-training-tape"/);
  assert.match(portfolioSource, /accessibilityLabel="Open Training Tape"/);
  assert.match(portfolioSource, /<TrainingTapeModal\s+visible=\{trainingTapeVisible\}/);
});

test("training tape prefetches and reuses a recent market snapshot on open", () => {
  assert.match(portfolioSource, /if \(visible\) prefetchTrainingTapeSnapshot\(\)/);
  assert.match(trainingTapeSource, /const MARKET_SNAPSHOT_FRESH_MS = 60_000/);
  assert.match(trainingTapeSource, /if \(marketSnapshotRequest\) return marketSnapshotRequest/);
  assert.match(trainingTapeSource, /setMarketSnapshot\(cachedSnapshot\?\.snapshot \?\? null\)/);
  assert.match(trainingTapeSource, /if \(cacheIsFresh\)/);
});
