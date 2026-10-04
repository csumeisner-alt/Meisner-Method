import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const screenSource = readFileSync(new URL("../app/heat-map.tsx", import.meta.url), "utf8");

test("heat-map tiles render the session and age from each quote's own metadata", () => {
  assert.match(screenSource, /getHeatMapSessionLabel\(quote\.marketSession\)/);
  assert.match(screenSource, /formatHeatMapQuoteAge\(quote\.priceTimestamp\)/);
  assert.match(screenSource, /testID=\{`heat-map-session-\$\{quote\.symbol\}`\}/);
  assert.match(screenSource, /testID=\{`heat-map-quote-age-\$\{quote\.symbol\}`\}/);
});

test("heat-map filters stale and undated quotes before summarizing and rendering tiles", () => {
  assert.match(screenSource, /setInterval\(\(\) => setNowSeconds\(Date\.now\(\) \/ 1000\), 60_000\)/);
  assert.match(screenSource, /sourceQuotes\.filter\(\(quote\) => isDisplayableHeatMapQuote\(quote, nowSeconds\)\)/);
  assert.match(screenSource, /const summary = summarizeHeatMap\(quotes\)/);
  assert.match(screenSource, /group\.quotes\.map\(\(quote, index\) =>/);
  assert.match(screenSource, /sourceQuotes\.filter\(\(quote\) => !isDisplayableHeatMapQuote\(quote, nowSeconds\)\)/);
});