import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const portfolioSource = readFileSync(
  resolve(scriptDir, "../app/(tabs)/portfolio.tsx"),
  "utf8",
);

test("portfolio trade deletion confirms in web preview and preserves native confirmation", () => {
  const handler = portfolioSource.match(
    /function handleDelete\(id: string\) \{([\s\S]*?)\n  \}/,
  )?.[1];

  assert.ok(handler, "the portfolio should define its trade deletion handler");
  assert.match(handler, /Platform\.OS === 'web'/);
  assert.match(handler, /window\.confirm\('Remove this trade\?'\)/);
  assert.match(handler, /if \(window\.confirm\('Remove this trade\?'\)\) removeTrade\(\)/);
  assert.match(handler, /Alert\.alert\('Remove Trade', 'Remove this trade\?'/);
  assert.match(handler, /onPress: removeTrade/);
  assert.match(portfolioSource, /onDelete=\{\(\) => handleDelete\(trade\.id\)\}/);
});
