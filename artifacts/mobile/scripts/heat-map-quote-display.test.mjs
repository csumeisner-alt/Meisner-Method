import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  formatHeatMapNextOpen,
  getHeatMapMarketStatus,
} from "../lib/heatMapQuoteDisplay.ts";
import { hasUsableHeatMapPerformanceSnapshot } from "../lib/heatMapMetrics.ts";

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
  assert.match(screenSource, /testID=\{`heat-map-custom-type-\$\{assetType\.id\}`\}/);
  assert.match(screenSource, /testID="heat-map-custom-asset-choices"/);
});

test("heat-map keeps the six-hex loader for an incomplete quick snapshot", () => {
  assert.equal(hasUsableHeatMapPerformanceSnapshot([
    { price: 12, returnPercent: 0.5 },
    { price: 30, returnPercent: null },
    { price: 42, returnPercent: null },
  ]), false);
  assert.match(screenSource, /const breadthSnapshotQuotes = \(marketBreadthQuery\.data\?\.quotes \?\? \[\]\)\s*\.filter\(\(quote\) => isDisplayableHeatMapQuote\(quote, nowSeconds\)\)/);
  assert.match(screenSource, /showingBreadthSnapshot = !fullResponseMatches && canUseFastSnapshot\s*&& hasUsableHeatMapPerformanceSnapshot\(breadthSnapshotQuotes\)/);
});

test("heat-map loading visuals receive the active Patriot or Neon Gucci theme", () => {
  assert.match(screenSource, /getHeatMapLoadingTheme\(\s*themeState\?\.isActive \?\? false,\s*themeState\?\.neonGucciActive \?\? false,/);
  assert.match(screenSource, /theme=\{loadingTheme\}/);
  assert.match(screenSource, /getHeatMapLoadingHexColors\(theme, index, colors\)/);
});

test("custom tickers stay device-local and are validated before being added", () => {
  assert.match(screenSource, /AsyncStorage\.getItem\(STORAGE_KEY\)/);
  assert.match(screenSource, /AsyncStorage\.setItem\(STORAGE_KEY/);
  assert.match(screenSource, /useValidateHeatMapSymbol\(\)/);
  assert.match(screenSource, /validateSymbol\.mutateAsync/);
  assert.match(screenSource, /removeSymbol\(quote\.symbol\)/);
  assert.match(screenSource, /normalizeCustomHeatMapSymbols/);
});

test("custom non-stock search shows provider categories and validates before saving", () => {
  assert.match(screenSource, /useSearchHeatMapInstruments/);
  assert.match(screenSource, /getSearchHeatMapInstrumentsQueryKey/);
  assert.match(screenSource, /const instrumentSearchEnabled = category === 'custom' && debouncedSymbolSearch\.length >= 2/);
  assert.match(screenSource, /category: 'etfs'/);
  assert.match(screenSource, /category: 'commodities'/);
  assert.match(screenSource, /category: 'futures'/);
  assert.match(screenSource, /category: 'cryptocurrency'/);
  assert.match(screenSource, /testID="heat-map-custom-instrument-suggestions"/);
  assert.match(screenSource, /suggestion\.category === 'etf'/);
  assert.match(screenSource, /suggestion\.category === 'commodity'/);
  assert.match(screenSource, /onPress=\{\(\) => void addSymbol\(suggestion\.symbol\)\}/);
  assert.match(screenSource, /isn't a supported instrument or has no recent quote/);
});

test("heat-map has a right-side filter drawer and reduced-motion-aware direction cue", () => {
  assert.match(screenSource, /Modal visible=\{drawerOpen\} transparent/);
  assert.match(screenSource, /drawerBackdrop/);
  assert.match(screenSource, /heat-map-filter-reset/);
  assert.match(screenSource, /heat-map-filter-apply/);
  assert.match(screenSource, /testID="heat-map-sort-highest"/);
  assert.match(screenSource, /testID="heat-map-sort-lowest"/);
  assert.match(screenSource, /setReturnSort\(draftReturnSort\)/);
  assert.match(screenSource, /sortHeatMapQuotesByReturn\(filterableQuotes, returnSort\)/);
  assert.match(screenSource, /Unavailable means there is not enough price history for the selected period/);
  assert.match(screenSource, /useReducedMotion\(\)/);
  assert.match(screenSource, /Animated\.loop/);
  assert.match(screenSource, /accessibilityLabel=\{directionalLabel\}/);
  assert.match(screenSource, /Price-return proxy/);
});

test("heat-map loading reveals shuffled hexagons and respects reduced motion", () => {
  assert.match(screenSource, /testID="heat-map-loading-state"/);
  assert.match(screenSource, /getHeatMapLoadingDelays\(layout\.positions\.length\)/);
  assert.match(screenSource, /withDelay\(\s*delayMs,\s*withTiming\(1/);
  assert.match(screenSource, /delayMs \+ LOADING_HEX_REVEAL_MS/);
  assert.match(screenSource, /withRepeat\(\s*withSequence\(/);
  assert.match(screenSource, /pulse\.value \* 0\.16/);
  assert.match(screenSource, /reduceMotion\s*\?\s*1\s*:\s*0/);
  assert.match(screenSource, /reduceMotion=\{reduceMotion\}/);
});

test("loaded quote hexagons fade in with a randomized, reduced-motion-aware cascade", () => {
  assert.match(screenSource, /getHeatMapRevealDelays\(symbols\.length,\s*HEX_REVEAL_SPREAD_MS\)/);
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

test("custom heat-map search offers company and category-aware asset suggestions before validation", () => {
  assert.match(screenSource, /useSearchStockSymbols/);
  assert.match(screenSource, /CUSTOM_HEAT_MAP_ASSET_TYPES\.map/);
  assert.match(screenSource, /searchCustomHeatMapAssets\(searchText\)/);
  assert.match(screenSource, /enabled: category === 'custom' && debouncedSymbolSearch\.length >= 2/);
  assert.match(screenSource, /getSearchStockSymbolsQueryKey\(\{ q: debouncedSymbolSearch \}\)/);
  assert.match(screenSource, /getStockSearchQueryFromKey\(stockSearch\.queryKey\)/);
  assert.match(screenSource, /isStockSearchCurrent\(\{/);
  assert.match(screenSource, /placeholder="Search name or enter ticker"/);
  assert.match(screenSource, /\{suggestion\.name\}/);
  assert.match(screenSource, /\{suggestion\.symbol\}/);
  assert.match(screenSource, /onPress=\{\(\) => toggleCustomAssetSelection\(asset\.asset\.symbol\)\}/);
  assert.match(screenSource, /testID="heat-map-custom-batch-add"/);
  assert.match(screenSource, /planCustomHeatMapBatchAdd\(customSymbols, selectedCustomAssetSymbols\)/);
  assert.match(screenSource, /\{assetTypeLabel\}/);
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
  assert.match(screenSource, /removeCustomHeatMapSymbolFromSavedOrder\(customSymbols, symbol\)/);
  assert.match(screenSource, /await AsyncStorage\.setItem\(STORAGE_KEY, JSON\.stringify\(next\)\)/);
  assert.match(screenSource, /testID=\{`heat-map-remove-unavailable-\$\{symbol\}`\}/);
  assert.match(screenSource, /No visible hexagon for these tickers\. Tap to remove:/);
  assert.doesNotMatch(screenSource, /styles\.chipList|styles\.symbolChip|styles\.chipText/);
});

test("custom map edit mode exposes accessible controls to persist instrument order", () => {
  assert.match(screenSource, /testID="heat-map-custom-reorder-list"/);
  assert.match(screenSource, /accessibilityLabel=\{`Move \$\{symbol\} up`\}/);
  assert.match(screenSource, /accessibilityLabel=\{`Move \$\{symbol\} down`\}/);
  assert.match(screenSource, /await persistSymbols\(next\)/);
  assert.match(screenSource, /if \(category === 'custom'\) \{\s+const order = new Map\(customSymbols\.map/);
});