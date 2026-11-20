import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const screenSource = readFileSync(
  fileURLToPath(new URL("../app/(tabs)/index.tsx", import.meta.url)),
  "utf8",
);
const trendingSection = screenSource.match(
  /\{\/\* Trending tickers \*\/\}([\s\S]*?)\{\/\* Disclaimer \*\/\}/,
)?.[1];

test("trending tickers have an accessible, persisted collapse control", () => {
  assert.ok(trendingSection, "the Analyze screen contains a trending ticker section");
  assert.match(screenSource, /const TRENDING_COLLAPSED_KEY = '@stocksense\/trending_collapsed';/);
  assert.match(screenSource, /AsyncStorage\.getItem\(TRENDING_COLLAPSED_KEY\)/);
  assert.match(
    screenSource,
    /AsyncStorage\.setItem\(TRENDING_COLLAPSED_KEY, next \? '1' : '0'\)/,
  );
  assert.match(trendingSection, /onPress=\{toggleTrendingTickers\}/);
  assert.match(
    trendingSection,
    /accessibilityLabel=\{\`\$\{trendingCollapsed \? 'Expand' : 'Collapse'\} trending tickers\`\}/,
  );
  assert.match(
    trendingSection,
    /name=\{trendingCollapsed \? 'chevron-right' : 'chevron-down'\}/,
  );
  assert.match(trendingSection, /\{!trendingCollapsed &&/);
});