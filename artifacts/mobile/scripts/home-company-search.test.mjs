import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isStockSearchSelectionCurrent } from "../lib/stockSearch.ts";

const homeScreen = readFileSync(
  fileURLToPath(new URL("../app/(tabs)/index.tsx", import.meta.url)),
  "utf8",
);
const analysisScreen = readFileSync(
  fileURLToPath(new URL("../app/analysis/[symbol].tsx", import.meta.url)),
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
    /latestSearchInputRef\.current = value;\s*setSelectedStock\(null\);\s*setSelectedEtf\(null\);\s*setSelectedCommodity\(null\);\s*setQuery\(value\);/,
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

test("commodity search rejects stale results and accepts the settled query", () => {
  const selectionHandler = homeScreen.match(
    /const selectCommodity = \(commodity: HeatMapInstrumentSuggestion, selectionQuery: string \| null\) => \{([\s\S]*?)\n  \};/,
  )?.[1];
  assert.ok(selectionHandler, "the commodity selection handler should remain identifiable");
  assert.match(
    selectionHandler,
    /isStockSearchSelectionCurrent\(\{\s*input: latestSearchInputRef\.current,\s*settledQuery: latestSettledQueryRef\.current,\s*resultQuery: latestCommodityResultQueryRef\.current,\s*selectionQuery,\s*isPlaceholderData: latestCommodityPlaceholderDataRef\.current/,
    "commodity selection must validate against the latest commodity query and placeholder state",
  );

  const searchState = {
    input: "Gold",
    settledQuery: "Gold",
    resultQuery: "Gold",
    isPlaceholderData: false,
  };
  const delayedCommodityResult = {
    name: "Gold",
    symbol: "GC=F",
    query: "Gold",
  };

  // Typing a new commodity query immediately invalidates the old row,
  // before the debounce or the new network response has settled.
  searchState.input = "Copper";
  assert.equal(
    isStockSearchSelectionCurrent({
      ...searchState,
      selectionQuery: delayedCommodityResult.query,
    }),
    false,
    "a delayed result from the earlier commodity query must not be selectable",
  );

  searchState.settledQuery = "Copper";
  searchState.resultQuery = "Copper";
  const currentCommodityResult = {
    name: "Copper",
    symbol: "HG=F",
    query: "Copper",
  };
  assert.equal(
    isStockSearchSelectionCurrent({
      ...searchState,
      selectionQuery: delayedCommodityResult.query,
    }),
    false,
    "the earlier commodity row must stay invalid after the new query settles",
  );
  assert.equal(
    isStockSearchSelectionCurrent({
      ...searchState,
      selectionQuery: currentCommodityResult.query,
    }),
    true,
    "a current commodity result should remain selectable once its matching query settles",
  );
});

test("home search submits a raw ticker after lookup finishes without blocking company names", () => {
  const rawTickerGate = homeScreen.match(
    /const allowRawTicker = ([\s\S]*?);/,
  )?.[1];
  assert.ok(rawTickerGate, "the home screen should gate raw ticker entry on current lookup state");
  assert.match(
    rawTickerGate,
    /isCurrentStockSearch\s*&&\s*isCurrentEtfSearch\s*&&\s*isCurrentCommoditySearch\s*&&\s*!stockSearch\.isFetching\s*&&\s*!etfSearch\.isFetching\s*&&\s*!commoditySearch\.isFetching\s*&&\s*\(stockSearch\.isSuccess\s*\|\|\s*stockSearch\.isError\)\s*&&\s*\(etfSearch\.isSuccess\s*\|\|\s*etfSearch\.isError\)\s*&&\s*\(commoditySearch\.isSuccess\s*\|\|\s*commoditySearch\.isError\)/,
    "raw ticker entry should wait for stock, ETF, and commodity lookups",
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
    /if\s*\(!resolvedSymbol\)\s*return;[\s\S]*?recordAnalyzeSearch\(\);[\s\S]*?navigateTo\(resolvedSymbol\)/,
    "the home search should count only a resolved ticker submission and block unresolved company names",
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

test("commodity search selection submits the canonical symbol to commodity analysis", () => {
  assert.match(homeScreen, /category: 'commodities'/);
  assert.match(homeScreen, /exactCommoditySuggestion\?\.symbol/);
  assert.match(homeScreen, /selectCommodity\(commodity, activeCommoditySearchQuery\)/);
  assert.match(homeScreen, /Commodity · \{commodity\.exchange\}/);

  const commodityRow = homeScreen.match(
    /\{commoditySuggestions\.map\(\(commodity, index\) => \(([\s\S]*?)\)\)\}/,
  )?.[1];
  assert.ok(commodityRow, "commodity search results should render selectable rows");
  assert.match(
    commodityRow,
    /onPress=\{\(\) => selectCommodity\(commodity, activeCommoditySearchQuery\)\}/,
    "tapping a result should select the commodity from the active query",
  );

  const selectionHandler = homeScreen.match(
    /const selectCommodity = \(commodity: HeatMapInstrumentSuggestion, selectionQuery: string \| null\) => \{([\s\S]*?)\n  \};/,
  )?.[1];
  assert.ok(selectionHandler, "the commodity selection handler should remain identifiable");
  assert.match(
    selectionHandler,
    /setSelectedCommodity\(commodity\);\s*setQuery\(selectedQuery\);/,
    "selecting a result should retain its instrument and display its name and ticker",
  );

  const resolvedSymbol = homeScreen.match(
    /const resolvedSymbol =([\s\S]*?);/,
  )?.[1];
  assert.ok(resolvedSymbol, "the home screen should resolve a selected commodity for submission");
  assert.match(
    resolvedSymbol,
    /^\s*selectedCommodity\?\.symbol\s*\?\?/,
    "the selected commodity's canonical symbol should take priority over typed text",
  );

  const submitHandler = homeScreen.match(
    /const handleSubmit = \(\) => \{([\s\S]*?)\n  \};/,
  )?.[1];
  assert.ok(submitHandler, "the shared search submit handler should remain identifiable");
  assert.match(
    submitHandler,
    /if\s*\(!resolvedSymbol\)\s*return;[\s\S]*?navigateTo\(resolvedSymbol\)/,
    "submitting a selected commodity should navigate with its resolved symbol",
  );

  const navigationHandler = homeScreen.match(
    /const navigateTo = useCallback\(async \(symbol: string\) => \{([\s\S]*?)\n  \}, \[recent, router\]\);/,
  )?.[1];
  assert.ok(navigationHandler, "the shared analysis navigation handler should remain identifiable");
  assert.match(
    navigationHandler,
    /const upper = symbol\.toUpperCase\(\)\.trim\(\);[\s\S]*?router\.push\(`\/analysis\/\$\{upper\}`\)/,
    "the canonical commodity ticker should be normalized and passed to the analysis route",
  );

  assert.match(
    analysisScreen,
    /const \{ symbol \} = useLocalSearchParams<\{ symbol: string \}>\(\);/,
    "the analysis route should receive the submitted ticker as its symbol parameter",
  );
  assert.match(
    analysisScreen,
    /if \(symbol\) mutate\(\{ data: \{ symbol \} \}\);/,
    "the analysis request should use the route's commodity symbol",
  );
  assert.match(
    analysisScreen,
    /result\.assetType === 'commodity' && result\.commodityAnalysis/,
    "commodity responses should take the dedicated commodity rendering branch",
  );
  assert.match(
    analysisScreen,
    /<CommodityAnalysisSections[\s\S]*?analysis=\{result\.commodityAnalysis\}[\s\S]*?symbol=\{result\.symbol\}[\s\S]*?onSectionLayout=\{recordCommoditySectionOffset\}/,
    "the commodity branch should render the returned commodity analysis",
  );
  assert.match(
    analysisScreen,
    /<View testID="commodity-analysis-result"/,
    "rendered commodity analysis should expose its result test marker",
  );

  const searchCases = [
    { query: "Gold", expectedSymbol: "GC=F" },
    { query: "GC=F", expectedSymbol: "GC=F" },
  ];
  const result = { name: "Gold", symbol: "GC=F", exchange: "COMEX" };
  for (const { query, expectedSymbol } of searchCases) {
    const selectedResult = [result].find(
      (suggestion) => suggestion.name.toLowerCase().includes(query.toLowerCase())
        || suggestion.symbol.toLowerCase() === query.toLowerCase(),
    );
    assert.equal(selectedResult?.symbol, expectedSymbol, `search ${query} should select Gold's canonical ticker`);
  }
});
