import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  formatHeatMapNextOpen,
  getHeatMapMarketStatus,
} from "../lib/heatMapQuoteDisplay.ts";

const screenSource = readFileSync(new URL("../app/heat-map.tsx", import.meta.url), "utf8");

test("heat-map tiles render the session and age from each quote's own metadata", () => {
  assert.match(screenSource, /getHeatMapSessionLabel\(quote\.marketSession\)/);
  assert.match(screenSource, /formatHeatMapQuoteAge\(quote\.priceTimestamp\)/);
  assert.match(screenSource, /formatHeatMapNextOpen\(\s*quote\.nextRegularOpenTimestamp,\s*quote\.marketSession,\s*quote\.assetType,\s*quote\.exchangeTimezone,/);
  assert.match(screenSource, /testID=\{`heat-map-session-\$\{quote\.symbol\}`\}/);
  assert.match(screenSource, /showNextOpen && nextOpen && <Text testID=\{`heat-map-next-open-\$\{quote\.symbol\}`\}/);
  assert.match(screenSource, /testID=\{`heat-map-quote-age-\$\{quote\.symbol\}`\}/);
  assert.match(screenSource, /getHeatMapMarketStatus\(validAgeQuotes\)/);
  assert.match(screenSource, /testID="heat-map-market-status"/);
});

test("next-open time uses the listed exchange timezone", () => {
  const nextOpen = Date.parse("2024-12-27T08:00:00Z") / 1000;
  assert.equal(
    formatHeatMapNextOpen(nextOpen, "closed", "stock", "Europe/London", nextOpen - 1),
    "Next open: Dec 27\n8:00 AM GMT",
  );
  assert.equal(
    formatHeatMapNextOpen(nextOpen, "closed", "stock", null, nextOpen - 1),
    null,
  );
});

test("shared market status distinguishes open, pre-market, extended, closed, mixed, and unknown sessions", () => {
  assert.equal(getHeatMapMarketStatus([{ marketSession: "regular" }]), "open");
  assert.equal(getHeatMapMarketStatus([{ marketSession: "pre_market" }]), "pre_market");
  assert.equal(getHeatMapMarketStatus([{ marketSession: "after_hours" }]), "extended");
  assert.equal(getHeatMapMarketStatus([{ marketSession: "closed" }]), "closed");
  assert.equal(getHeatMapMarketStatus([
    { marketSession: "regular" },
    { marketSession: "closed" },
  ]), "mixed");
  assert.equal(getHeatMapMarketStatus([
    { marketSession: "regular" },
    { marketSession: "unknown" },
  ]), "open");
  assert.equal(getHeatMapMarketStatus([{ marketSession: "unknown" }]), "unknown");
  assert.equal(getHeatMapMarketStatus([]), "unknown");
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
  assert.match(screenSource, /\.\.\.\(requestedSector \? \{ sector: requestedSector \} : \{\}\)/);
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
  assert.match(screenSource, /removeSymbol\(quote\.symbol\)/);
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

test("heat-map loading reveals shuffled hexagons and respects reduced motion", () => {
  assert.match(screenSource, /testID="heat-map-loading-state"/);
  assert.match(screenSource, /getHeatMapLoadingDelays\(layout\.positions\.length\)/);
  assert.match(screenSource, /withDelay\(\s*delayMs,\s*withTiming\(1/);
  assert.match(screenSource, /reduceMotion\s*\?\s*1\s*:\s*0/);
  assert.match(screenSource, /reduceMotion=\{reduceMotion\}/);
});

test("loaded quote hexagons fade in with a randomized, reduced-motion-aware cascade", () => {
  assert.match(screenSource, /getHeatMapRevealDelays\(tileSymbols\.length,\s*HEX_REVEAL_SPREAD_MS\)/);
  assert.match(screenSource, /revealDelayMs=\{revealDelayBySymbol\.get\(quote\.symbol\)\s*\?\?\s*0\}/);
  assert.match(screenSource, /withDelay\(\s*revealDelayMs,\s*withTiming\(1/);
  assert.match(screenSource, /duration:\s*HEX_REVEAL_DURATION_MS/);
  assert.match(screenSource, /testID=\{`heat-map-hex-tile-\$\{quote\.symbol\}`\}/);
});

test("stock sector selection offers all supported sectors and requests matching expanded data", () => {
  assert.match(screenSource, /const STOCK_SECTORS: GetMarketHeatMapSector\[\] = \[/);
  assert.match(screenSource, /category === 'stocks'\s*&&\s*filters\.sector !== 'Unknown'/);
  assert.match(screenSource, /requestedSector,\s*\);/);
});

test("custom heat-map search offers company suggestions and adds a selected ticker through validation", () => {
  assert.match(screenSource, /useSearchStockSymbols/);
  assert.match(screenSource, /getSearchStockSymbolsQueryKey\(\{ q: debouncedSymbolSearch \}\)/);
  assert.match(screenSource, /getStockSearchQueryFromKey\(stockSearch\.queryKey\)/);
  assert.match(screenSource, /isStockSearchCurrent\(\{/);
  assert.match(screenSource, /placeholder="Ticker or company name"/);
  assert.match(screenSource, /\{suggestion\.name\}/);
  assert.match(screenSource, /\{suggestion\.symbol\}/);
  assert.match(screenSource, /onPress=\{\(\) => void addSymbol\(suggestion\.symbol\)\}/);
  assert.match(screenSource, /validateSymbol\.mutateAsync\(\{ data: \{ symbol \} \}\)/);
  assert.match(screenSource, /keyboardShouldPersistTaps="handled"/);
});

test("custom map removal uses an edit toggle and animated, tappable hexagons instead of ticker chips", () => {
  assert.match(screenSource, /testID="heat-map-custom-edit"/);
  assert.match(screenSource, /isEditingCustomMap \? 'Done editing custom heat map' : 'Edit custom heat map'/);
  assert.match(screenSource, /Animated\.loop\(Animated\.sequence\(\[/);
  assert.match(screenSource, /editing=\{category === 'custom' && isEditingCustomMap\}/);
  assert.match(screenSource, /testID=\{`heat-map-remove-tile-\$\{quote\.symbol\}`\}/);
  assert.match(screenSource, /onRemove=\{\(\) => void removeSymbol\(quote\.symbol\)\}/);
  assert.match(screenSource, /editFallbackSymbols\.map\(\(symbol\)/);
  assert.match(screenSource, /const next = customSymbols\.filter\(\(item\) => item !== symbol\)/);
  assert.match(screenSource, /await AsyncStorage\.setItem\(STORAGE_KEY, JSON\.stringify\(next\)\)/);
  assert.match(screenSource, /testID=\{`heat-map-remove-unavailable-\$\{symbol\}`\}/);
  assert.match(screenSource, /No visible hexagon for these tickers\. Tap to remove:/);
  assert.doesNotMatch(screenSource, /styles\.chipList|styles\.symbolChip|styles\.chipText/);
});