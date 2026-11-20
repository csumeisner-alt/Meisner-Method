import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const paperScreen = readFileSync(new URL("../app/(tabs)/paper.tsx", import.meta.url), "utf8");

test("company result selection looks up the selected symbol and does not submit an order", () => {
  const resultHandler = paperScreen.match(
    /testID=\{`paper-\$\{suggestion\.instrumentType\}-result-\$\{suggestion\.symbol\}`\}([\s\S]*?)activeOpacity=\{0\.7\}/,
  )?.[1];

  assert.ok(resultHandler, "the company result button should remain identifiable");
  assert.match(
    resultHandler,
    /resolveStockSearchSymbol\(\s*buySymbol,\s*buySuggestions,\s*suggestion,\s*false,\s*\)/,
  );
  assert.match(resultHandler, /lookUpStock\(selectedSymbol,\s*suggestion\.instrumentType\)/);
  assert.doesNotMatch(
    resultHandler,
    /handleConfirmOrder|setShowOrderSheet|onConfirm|saveAll|saveOrders/,
    "choosing a result must only look up the stock",
  );
});

test("the selected ticker feeds the stock-information card and order-sheet props", () => {
  assert.match(paperScreen, /const sym = \(symbolOverride \?\? resolvedBuySymbol \?\? ''\)\.trim\(\)\.toUpperCase\(\)/);
  assert.match(paperScreen, /setBuySymbol\(sym\)/);
  assert.match(paperScreen, /fetch\(`\$\{BASE_URL\}\/api\/stocks\/info\/\$\{sym\}`\)/);
  assert.match(paperScreen, /fetch\(`\$\{BASE_URL\}\/api\/stocks\/quote\/\$\{sym\}`\)/);
  assert.match(paperScreen, /testID="paper-stock-info-card"/);
  assert.match(paperScreen, /stockInfo\.companyName/);
  assert.match(paperScreen, /getBuyOrderDetails\(buySymbol, stockInfo\)/);
  assert.match(paperScreen, /symbol=\{tradeMode === 'buy' \|\| tradeMode === 'short' \? buyOrderDetails\.symbol/);
  assert.match(paperScreen, /companyName=\{tradeMode === 'buy' \|\| tradeMode === 'short' \? buyOrderDetails\.companyName/);
  assert.match(paperScreen, /currentPrice=\{tradeMode === 'buy' \|\| tradeMode === 'short' \? buyOrderDetails\.currentPrice/);
  assert.match(paperScreen, /stockInfo=\{tradeMode === 'buy' \|\| tradeMode === 'short' \? buyOrderDetails\.stockInfo/);
  assert.match(paperScreen, /testID="paper-stock-buy-button"/);
  assert.match(paperScreen, /testID="paper-stock-sell-button"/);
  assert.match(paperScreen, /testID="paper-stock-short-sell-button"/);
  assert.match(
    paperScreen,
    /testID="paper-stock-short-sell-button"[\s\S]*?onPress=\{\(\) => openSelectedStockOrder\('short'\)\}/,
  );
});

test("closed or superseded stock lookups cannot update the Buy modal", () => {
  assert.match(paperScreen, /stockLookupRequestRef\.current\.begin\(\)/);

  const lookupHandler = paperScreen.match(
    /const lookUpStock = async \(symbolOverride\?: string,\s*searchedAssetType\?: 'stock' \| 'etf'\) => \{([\s\S]*?)\n  \};/,
  )?.[1];
  assert.ok(lookupHandler, "the stock lookup handler should remain identifiable");
  assert.match(
    lookupHandler,
    /if \(!stockLookupRequestRef\.current\.isCurrent\(requestId\)\) return;/,
    "stale lookup responses must stop before updating stock information",
  );
  assert.match(
    lookupHandler,
    /if \(stockLookupRequestRef\.current\.isCurrent\(requestId\)\) \{\s*setInfoError/,
    "stale lookup failures must not replace the current error",
  );
  assert.match(
    lookupHandler,
    /finally \{\s*if \(stockLookupRequestRef\.current\.isCurrent\(requestId\)\) \{\s*setInfoLoading\(false\)/,
    "stale lookups must not clear the loading state of a newer request",
  );
  assert.match(
    paperScreen,
    /onRequestClose=\{\(\) => \{\s*invalidateStockLookup\(\);\s*setShowTradeModal\(false\)/,
    "closing the Buy modal must invalidate its active stock lookup",
  );
});

test("company suggestions are tied to the current settled query before selection", () => {
  assert.match(paperScreen, /getStockSearchQueryFromKey\(stockSearch\.queryKey\)/);
  assert.match(
    paperScreen,
    /isCurrentBuySearchInput[\s\S]*?isStockSearchCurrent\(\{[\s\S]*?resultQuery: buySearchResultQuery,[\s\S]*?isPlaceholderData: stockSearch\.isPlaceholderData/,
  );
  assert.match(
    paperScreen,
    /buySearchContextRef\.current = \{\s*\.\.\.buySearchContextRef\.current,\s*input: text\.trim\(\)/,
    "typed text must invalidate an old result immediately, before the debounce settles",
  );

  const resultHandler = paperScreen.match(
    /testID=\{`paper-\$\{suggestion\.instrumentType\}-result-\$\{suggestion\.symbol\}`\}([\s\S]*?)activeOpacity=\{0\.7\}/,
  )?.[1];
  assert.ok(resultHandler, "the company result button should remain identifiable");
  assert.match(resultHandler, /isStockSearchCurrent\(/);
  assert.match(resultHandler, /if\s*\(\s*!currentSearch\.enabled/);
});

test("direct ticker entry and search feedback remain connected to the Buy lookup", () => {
  assert.match(paperScreen, /getStockSearchFeedback\(\{/);
  assert.match(paperScreen, /buySearchFeedback\.kind !== 'loading'/);
  assert.match(
    paperScreen,
    /testID="paper-stock-search-input"[\s\S]*?onSubmitEditing=\{\(\) => \{\s*if \(resolvedBuySymbol\) void lookUpStock\(resolvedBuySymbol\);/,
  );
  assert.match(
    paperScreen,
    /testID="paper-stock-lookup-button"[\s\S]*?onPress=\{\(\) => \{\s*if \(resolvedBuySymbol\) void lookUpStock\(resolvedBuySymbol\);/,
  );
});

test("Buy search includes ETFs and validates each result against its own query", () => {
  assert.match(paperScreen, /category: 'etfs'/);
  assert.match(paperScreen, /const exactEtfSuggestion = etfSuggestions\.find/);
  assert.match(paperScreen, /exactEtfSuggestion\?\.symbol \?\? resolveStockSearchSymbol/);
  assert.match(paperScreen, /instrumentType: 'etf'/);
  assert.match(paperScreen, /suggestion\.instrumentType === 'etf'[\s\S]*?buyEtfSearchResultQuery/);
  assert.match(paperScreen, /suggestion\.instrumentType === 'etf'[\s\S]*?etfSearch\.isPlaceholderData/);
  assert.match(paperScreen, /ETF · \$\{suggestion\.exchange\}/);
  assert.match(paperScreen, /BUY STOCK OR ETF/);
});