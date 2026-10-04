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
  assert.match(screenSource, /const summary = summarizeHeatMap\(filterableQuotes\)/);
  assert.match(screenSource, /layoutHoneycomb\(group\.quotes\.length,\s*contentWidth,\s*tileWidth\)/);
  assert.match(screenSource, /sourceQuotes\.filter\(\(quote\) => !isDisplayableHeatMapQuote\(quote, nowSeconds\)\)/);
});

test("heat-map queries and renders only the active category, period, and custom symbol set", () => {
  assert.match(screenSource, /category,\s*period,\s*\.\.\.\(category === 'custom' \? \{ symbols: customSymbols \} : \{\}\)/);
  assert.match(screenSource, /heatMapResponseMatchesSelection\(/);
  assert.match(screenSource, /testID=\{`heat-map-period-\$\{item\.id\}`\}/);
  assert.match(screenSource, /heat-map-drawer-period-/);
  assert.match(screenSource, /heat-map-selected-period/);
  assert.doesNotMatch(screenSource, /categoryRail|ScrollView horizontal/);
});

test("custom tickers stay device-local and are validated before being added", () => {
  assert.match(screenSource, /AsyncStorage\.getItem\(STORAGE_KEY\)/);
  assert.match(screenSource, /AsyncStorage\.setItem\(STORAGE_KEY/);
  assert.match(screenSource, /useValidateHeatMapSymbol\(\)/);
  assert.match(screenSource, /validateSymbol\.mutateAsync/);
  assert.match(screenSource, /removeSymbol\(symbol\)/);
  assert.match(screenSource, /normalizeCustomHeatMapSymbols/);
});

test("heat-map has a right-side filter drawer and reduced-motion-aware direction cue", () => {
  assert.match(screenSource, /Modal visible=\{drawerOpen\} transparent/);
  assert.match(screenSource, /drawerBackdrop/);
  assert.match(screenSource, /heat-map-filter-reset/);
  assert.match(screenSource, /heat-map-filter-apply/);
  assert.match(screenSource, /useReducedMotion\(\)/);
  assert.match(screenSource, /Animated\.loop/);
  assert.match(screenSource, /accessibilityLabel=\{directionalLabel\}/);
  assert.match(screenSource, /Price-return proxy/);
});