import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isStockSearchSelectionCurrent } from "../lib/stockSearch.ts";

const homeScreen = readFileSync(
  fileURLToPath(new URL("../app/index.tsx", import.meta.url)),
  "utf8",
);

test("home search input invalidates old suggestions before the debounce settles", () => {
  const inputBlock = homeScreen.match(
    /placeholder="Search by name or symbol"([\s\S]*?)returnKeyType="search"/,
  )?.[1];
  assert.ok(inputBlock, "the home company-search input should remain identifiable");

  const inputHandler = inputBlock.match(
    /onChangeText=\{\(value\) => \{([\s\S]*?)\}\}/,
  )?.[1];
  assert.ok(inputHandler, "typing should have an explicit home search handler");
  assert.match(
    inputHandler,
    /latestSearchInputRef\.current = value;\s*setSelectedStock\(null\);\s*setSelectedEtf\(null\);\s*setQuery\(value\);/,
    "the latest input ref must update synchronously before React state and debounce",
  );

  const selectionHandler = homeScreen.match(
    /const selectStock = \(stock: StockSymbolSuggestion, selectionQuery: string \| null\) => \{([\s\S]*?)\n  \};/,
  )?.[1];
  assert.ok(selectionHandler, "the home suggestion selection handler should remain identifiable");
  assert.match(
    selectionHandler,
    /isStockSearchSelectionCurrent\(\{\s*input: latestSearchInputRef\.current,\s*settledQuery: latestSettledQueryRef\.current,\s*resultQuery: latestResultQueryRef\.current,\s*selectionQuery,\s*isPlaceholderData: latestPlaceholderDataRef\.current/,
    "the selection handler must validate its captured row against the latest input and results",
  );
  assert.match(
    homeScreen,
    /onPress=\{\(\) => selectStock\(stock, activeStockSearchQuery\)\}/,
    "each suggestion tap must pass the query associated with the rendered result",
  );
});

test("rapid home search edits reject a delayed tap from an earlier query", () => {
  const searchState = {
    input: "Apple",
    settledQuery: "Apple",
    resultQuery: "Apple",
    isPlaceholderData: false,
  };
  const delayedRowQuery = "Apple";

  // The input ref changes immediately on each keystroke; debounce and results
  // can still belong to the first query while the user is already typing again.
  searchState.input = "Microsoft";
  searchState.input = "Tesla";
  assert.equal(
    isStockSearchSelectionCurrent({ ...searchState, selectionQuery: delayedRowQuery }),
    false,
    "a row left over from the earlier render must not be selected during rapid edits",
  );

  // Once Tesla's results are current, the old row must remain invalid while a
  // row from the current query is accepted.
  searchState.settledQuery = "Tesla";
  searchState.resultQuery = "Tesla";
  assert.equal(
    isStockSearchSelectionCurrent({ ...searchState, selectionQuery: delayedRowQuery }),
    false,
  );
  assert.equal(
    isStockSearchSelectionCurrent({ ...searchState, selectionQuery: "Tesla" }),
    true,
  );
});

test("home search submits a raw ticker after lookup finishes without blocking company names", () => {
  const rawTickerGate = homeScreen.match(
    /const allowRawTicker = ([\s\S]*?);/,
  )?.[1];
  assert.ok(rawTickerGate, "the home screen should gate raw ticker entry on current lookup state");
  assert.match(
    rawTickerGate,
    /isCurrentStockSearch\s*&&\s*isCurrentEtfSearch\s*&&\s*!stockSearch\.isFetching\s*&&\s*!etfSearch\.isFetching\s*&&\s*\(stockSearch\.isSuccess\s*\|\|\s*stockSearch\.isError\)\s*&&\s*\(etfSearch\.isSuccess\s*\|\|\s*etfSearch\.isError\)/,
    "raw ticker entry should wait for both current stock and ETF lookups",
  );

  assert.match(
    homeScreen,
    /resolveStockSearchSymbol\(query,\s*stockSuggestions,\s*selectedStock,\s*allowRawTicker\)/,
    "the stock resolver should receive current suggestions, selection, and lookup availability",
  );

  const submitHandler = homeScreen.match(
    /const handleSubmit = \(\) => \{([\s\S]*?)\n  \};/,
  )?.[1];
  assert.ok(submitHandler, "the home search submit handler should remain identifiable");
  assert.match(
    submitHandler,
    /if\s*\(resolvedSymbol\)\s*navigateTo\(resolvedSymbol\)/,
    "the home search should submit a resolved ticker and keep unresolved company names blocked",
  );
  assert.match(
    homeScreen,
    /onSubmitEditing=\{handleSubmit\}/,
    "the keyboard search action should submit through the same validation",
  );
  assert.match(
    homeScreen,
    /disabled=\{!resolvedSymbol\}[\s\S]*?onPress=\{handleSubmit\}/,
    "the Analyze button should be enabled only for a resolved symbol and use the same submit handler",
  );

  const navigationHandler = homeScreen.match(
    /const navigateTo = useCallback\(async \(symbol: string\) => \{([\s\S]*?)\n  \}, \[recent, router\]\);/,
  )?.[1];
  assert.ok(navigationHandler, "the shared home navigation handler should remain identifiable");
  assert.match(
    navigationHandler,
    /const upper = symbol\.toUpperCase\(\)\.trim\(\);/,
    "the submitted ticker should be normalized before navigation",
  );
  assert.match(
    navigationHandler,
    /router\.push\(`\/analysis\/\$\{upper\}`\)/,
    "the normalized ticker should open its analysis screen",
  );
});

test("home Analyze search can find and select ETF names and tickers", () => {
  assert.match(homeScreen, /useSearchHeatMapInstruments/);
  assert.match(homeScreen, /category: 'etfs'/);
  assert.match(homeScreen, /exactEtfSuggestion\?\.symbol/);
  assert.match(homeScreen, /selectEtf\(etf, activeEtfSearchQuery\)/);
  assert.match(homeScreen, /ETF · \{etf\.exchange\}/);
});
