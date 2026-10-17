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

test("Brew Bank prominently explains the quote reward and weekend eligibility", () => {
  assert.match(bankSource, /testID="brew-token-quote-reminder"/);
  assert.match(bankSource, /\+1 BREW TOKEN PER QUOTE/);
  assert.match(
    bankSource,
    /After the Bank unlocks, each Biden quote you view earns 1 token—even on weekends\./,
  );
  assert.match(bankSource, /\+1 per quote after unlock/);
  assert.doesNotMatch(bankSource, /earn 1 token per weekday quote/);
});
