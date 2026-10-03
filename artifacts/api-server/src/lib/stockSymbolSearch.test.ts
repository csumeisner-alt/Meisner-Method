import { test } from "node:test";
import assert from "node:assert/strict";
import { parseYahooStockSearchResponse } from "./stockSymbolSearch.ts";

test("Yahoo company search maps listed equities and filters non-stock results", () => {
  const suggestions = parseYahooStockSearchResponse({
    quotes: [
      { quoteType: "EQUITY", symbol: "AAPL", longname: "Apple Inc.", exchDisp: "NASDAQ" },
      { quoteType: "FUTURE", symbol: "SAAPL=F", shortname: "Apple futures" },
      { quoteType: "ETF", symbol: "AAPX", shortname: "Leveraged Apple ETF" },
      { quoteType: "EQUITY", symbol: "AAPL", shortname: "Duplicate Apple listing" },
      { quoteType: "EQUITY", symbol: "BRK-B", shortname: "Berkshire Hathaway Inc.", exchange: "NYQ" },
      { quoteType: "EQUITY", symbol: "", shortname: "Missing symbol" },
    ],
  });

  assert.deepEqual(suggestions, [
    { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ" },
    { symbol: "BRK-B", name: "Berkshire Hathaway Inc.", exchange: "NYQ" },
  ]);
});

test("Yahoo company search rejects malformed payloads and caps suggestions", () => {
  assert.deepEqual(parseYahooStockSearchResponse(null), []);
  assert.deepEqual(parseYahooStockSearchResponse({ quotes: "not an array" }), []);

  const suggestions = parseYahooStockSearchResponse({
    quotes: Array.from({ length: 12 }, (_, index) => ({
      quoteType: "EQUITY",
      symbol: `TEST${index}`,
      shortname: `Test Company ${index}`,
    })),
  });
  assert.equal(suggestions.length, 8);
  assert.equal(suggestions[0]?.symbol, "TEST0");
  assert.equal(suggestions[7]?.symbol, "TEST7");
});