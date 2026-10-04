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
    /placeholder="Company name or ticker \(Apple, AAPL\)"([\s\S]*?)returnKeyType="search"/,
  )?.[1];
  assert.ok(inputBlock, "the home company-search input should remain identifiable");

  const inputHandler = inputBlock.match(
    /onChangeText=\{\(value\) => \{([\s\S]*?)\}\}/,
  )?.[1];
  assert.ok(inputHandler, "typing should have an explicit home search handler");
  assert.match(
    inputHandler,
    /latestSearchInputRef\.current = value;\s*setSelectedStock\(null\);\s*setQuery\(value\);/,
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