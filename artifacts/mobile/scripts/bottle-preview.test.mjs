import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { requestBrewConfirmation } from "../lib/brewConfirmation.ts";

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

test("web confirmation invokes a Brew Bank purchase only after confirmation", () => {
  let economy = { tokens: 40, recipes: 0, keys: 0 };
  let prompt = "";

  requestBrewConfirmation(
    "web",
    "UNLOCK QUICK REVIVE?",
    "Spend 40 Brew Tokens to unlock this recipe?",
    () => {
      economy = { tokens: economy.tokens - 40, recipes: economy.recipes + 1, keys: economy.keys };
    },
    (message) => {
      prompt = message;
      return true;
    },
    () => assert.fail("Web confirmation must not use the native alert"),
  );

  assert.equal(prompt, "UNLOCK QUICK REVIVE?\n\nSpend 40 Brew Tokens to unlock this recipe?");
  assert.deepEqual(economy, { tokens: 0, recipes: 1, keys: 0 });
});

test("cancelling a web confirmation leaves the Brew Bank economy unchanged", () => {
  const economy = { tokens: 5, recipes: 0, keys: 0 };
  let purchaseCalls = 0;

  requestBrewConfirmation(
    "web",
    "BUY CENTRAL BANK KEY?",
    "Spend 5 Brew Tokens for one weekday access key?",
    () => {
      purchaseCalls += 1;
      economy.tokens -= 5;
      economy.keys += 1;
    },
    () => false,
    () => assert.fail("Web confirmation must not use the native alert"),
  );

  assert.equal(purchaseCalls, 0);
  assert.deepEqual(economy, { tokens: 5, recipes: 0, keys: 0 });
});

test("native confirmation still defers the purchase until its confirm action runs", () => {
  let nativeAction;
  let purchaseCalls = 0;

  requestBrewConfirmation(
    "native",
    "BUY CENTRAL BANK KEY?",
    "Spend 5 Brew Tokens for one weekday access key?",
    () => {
      purchaseCalls += 1;
    },
    () => assert.fail("Native confirmation must not use the browser prompt"),
    (title, message, onConfirm) => {
      assert.equal(title, "BUY CENTRAL BANK KEY?");
      assert.equal(message, "Spend 5 Brew Tokens for one weekday access key?");
      nativeAction = onConfirm;
    },
  );

  assert.equal(purchaseCalls, 0);
  nativeAction();
  assert.equal(purchaseCalls, 1);
});

test("Brew Bank key and recipe unlock handlers keep their existing purchases behind confirmation", () => {
  const keyHandler = bankSource.match(/const handleBuyKey = async \(confirmed = false\) => \{[\s\S]*?\n  \};/)?.[0];
  assert.ok(keyHandler);
  assert.match(keyHandler, /confirmExpensiveAction\(/);
  assert.match(keyHandler, /runShopAction\(onBuyBankKey\)/);

  for (const handlerName of [
    "handleUnlockQuickRevive",
    "handleUnlockDaiquiri",
    "handleUnlockStaminUp",
    "handleUnlockSmartPro",
    "handleUnlockNeonGucciPhrases",
  ]) {
    const handler = bankSource.match(
      new RegExp(`const ${handlerName} = async \\(confirmed = false\\) => \\{[\\s\\S]*?\\n  \\};`),
    )?.[0];
    assert.ok(handler, `${handlerName} exists`);
    assert.match(handler, /confirmExpensiveAction\(/, `${handlerName} requests confirmation`);
    assert.match(handler, /runShopAction\(onUnlock/, `${handlerName} uses its existing purchase callback`);
  }

  assert.match(bankSource, /Alert\.alert\(nativeTitle, nativeMessage/);
  assert.match(bankSource, /window\.confirm\(confirmationMessage\)/);
});
