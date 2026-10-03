import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const paperScreen = readFileSync(new URL("../app/paper.tsx", import.meta.url), "utf8");

test("company result selection looks up the selected symbol and does not submit an order", () => {
  const resultHandler = paperScreen.match(
    /testID=\{`paper-stock-result-\$\{suggestion\.symbol\}`\}([\s\S]*?)activeOpacity=\{0\.7\}/,
  )?.[1];

  assert.ok(resultHandler, "the company result button should remain identifiable");
  assert.match(
    resultHandler,
    /resolveStockSearchSymbol\(\s*buySymbol,\s*buySuggestions,\s*suggestion,\s*false,\s*\)/,
  );
  assert.match(resultHandler, /lookUpStock\(selectedSymbol\)/);
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
  assert.match(paperScreen, /symbol=\{tradeMode === 'buy' \? buyOrderDetails\.symbol/);
  assert.match(paperScreen, /companyName=\{tradeMode === 'buy' \? buyOrderDetails\.companyName/);
  assert.match(paperScreen, /currentPrice=\{tradeMode === 'buy' \? buyOrderDetails\.currentPrice/);
  assert.match(paperScreen, /stockInfo=\{tradeMode === 'buy' \? buyOrderDetails\.stockInfo/);
  assert.match(paperScreen, /testID="paper-stock-place-order-button"/);
  assert.match(
    paperScreen,
    /testID="paper-stock-place-order-button"[\s\S]*?onPress=\{\(\) => \{ setShowOrderSheet\(true\); setShowTradeModal\(false\); \}\}/,
  );
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