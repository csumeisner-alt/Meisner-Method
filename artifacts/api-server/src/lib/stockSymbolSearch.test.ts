import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseYahooHeatMapInstrumentSearchResponse,
  parseYahooStockSearchResponse,
} from "./stockSymbolSearch.ts";

test("Yahoo heat-map search maps supported ETFs, commodity futures, futures, and crypto", () => {
  const suggestions = parseYahooHeatMapInstrumentSearchResponse({
    quotes: [
      { quoteType: "ETF", symbol: "VUG", longname: "Vanguard Growth ETF", exchDisp: "NYSE Arca" },
      { quoteType: "FUTURE", symbol: "CL=F", shortname: "Crude Oil" },
      { quoteType: "FUTURE", symbol: "MGC=F", shortname: "Micro Gold", exchDisp: "Chicago" },
      { quoteType: "FUTURE", symbol: "ES=F", shortname: "E-mini S&P 500" },
      { quoteType: "CRYPTOCURRENCY", symbol: "PEPE-USD", shortname: "Pepe" },
      { quoteType: "CRYPTOCURRENCY", symbol: "BTC-EUR", shortname: "Bitcoin EUR" },
      { quoteType: "CRYPTOCURRENCY", symbol: "ETH-BTC", shortname: "Ethereum BTC" },
      { quoteType: "EQUITY", symbol: "AAPL", shortname: "Apple Inc." },
      { quoteType: "CRYPTOCURRENCY", symbol: "PEPE-XYZ", shortname: "Pepe unsupported quote" },
      { quoteType: "CRYPTOCURRENCY", symbol: "BTC-XYZ", shortname: "Bitcoin unsupported quote" },
      { quoteType: "CRYPTOCURRENCY", symbol: "BTC-EUR", shortname: "Duplicate Bitcoin EUR" },
      { quoteType: "FUTURE", symbol: "GC", shortname: "Gold" },
      { quoteType: "FUTURE", symbol: "ES=F", shortname: "Duplicate future" },
    ],
  });

  assert.deepEqual(suggestions, [
    { symbol: "VUG", name: "Vanguard Growth ETF", exchange: "NYSE Arca", category: "etf" },
    { symbol: "CL=F", name: "Crude Oil", exchange: "Exchange unavailable", category: "commodity" },
    { symbol: "MGC=F", name: "Micro Gold", exchange: "Chicago", category: "commodity" },
    { symbol: "ES=F", name: "E-mini S&P 500", exchange: "Exchange unavailable", category: "future" },
    { symbol: "PEPE-USD", name: "Pepe", exchange: "Exchange unavailable", category: "cryptocurrency" },
    { symbol: "BTC-EUR", name: "Bitcoin EUR", exchange: "Exchange unavailable", category: "cryptocurrency" },
    { symbol: "ETH-BTC", name: "Ethereum BTC", exchange: "Exchange unavailable", category: "cryptocurrency" },
  ]);
});

test("Yahoo heat-map search rejects malformed results and caps results at eight", () => {
  assert.deepEqual(parseYahooHeatMapInstrumentSearchResponse(null), []);
  assert.deepEqual(parseYahooHeatMapInstrumentSearchResponse({ quotes: "invalid" }), []);

  const suggestions = parseYahooHeatMapInstrumentSearchResponse({
    quotes: Array.from({ length: 10 }, (_, index) => ({
      quoteType: "ETF",
      symbol: `ETF${index}`,
      shortname: `Example ETF ${index}`,
    })),
  });
  assert.equal(suggestions.length, 8);
});

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