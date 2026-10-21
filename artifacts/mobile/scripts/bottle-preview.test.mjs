import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const bankSource = readFileSync(
  resolve(scriptDir, "../components/BrewTokenBank.tsx"),
  "utf8",
);

test("tapping each unlocked bottle opens its preview and plays the animation without buying or redeeming", () => {
  assert.match(
    bankSource,
    /const openBottleInspection = \(kind: BottleBurstKind, unlocked: boolean\) => \{\s*setBottlePreview\(kind\);\s*if \(unlocked\) triggerBottleBurst\(kind, 'preview'\);\s*\};/,
  );

  for (const [kind, unlockedState] of [
    ["quickRevive", "quickReviveUnlocked"],
    ["daiquiri", "daiquiriUnlocked"],
    ["staminUp", "staminUpUnlocked"],
    ["smartPro", "smartProUnlocked"],
  ]) {
    assert.match(
      bankSource,
      new RegExp(`onPress=\\{\\(\\) => openBottleInspection\\('${kind}', ${unlockedState}\\)\\}`),
    );
  }

  const inspectionHandler = bankSource.match(
    /const openBottleInspection = \(kind: BottleBurstKind, unlocked: boolean\) => \{[\s\S]*?\n  \};/,
  )?.[0];
  assert.ok(inspectionHandler);
  assert.doesNotMatch(inspectionHandler, /onBuy|onRedeem/);
});
