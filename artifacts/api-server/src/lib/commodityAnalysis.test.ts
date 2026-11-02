import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCommodityScore,
  parseCommodityNewsSources,
} from "./commodityAnalysis.ts";
import {
  parseCftcPositioningRows,
  parseEiaCrudeInventoryCsv,
  parseEiaNaturalGasStorageCsv,
  parseUsdaWasdeInventoryCsv,
} from "./commodityMarketData.ts";

const closesWithDailyChange = (changes: number[]) => {
  const closes = [100];
  for (const change of changes) closes.push(closes.at(-1)! * Math.exp(change));
  return closes;
};

test("commodity scores are deterministic and expose missing market-structure inputs", () => {
  const input = {
    symbol: "GC=F",
    closes: closesWithDailyChange(Array.from({ length: 252 }, () => 0.002)),
    currentPrice: 165,
    historyAsOf: "2026-10-30",
  };
  const first = buildCommodityScore(input);
  assert.ok(first);
  assert.deepEqual(buildCommodityScore(input), first);
  assert.ok(first.score > 50);
  assert.equal(first.historyAsOf, "2026-10-30");
  assert.equal(first.dataCoveragePercent, 33);
  assert.equal(first.factors.filter((factor) => factor.status === "unavailable").length, 4);
  assert.ok(first.factors.every((factor) => factor.weight >= 0));
  assert.deepEqual(first.factors.find((factor) => factor.key === "physical-balance")?.sources, []);
  assert.deepEqual(first.factors.find((factor) => factor.key === "positioning")?.sources, []);
  assert.equal(first.factors.find((factor) => factor.key === "futures-curve")?.score, null);
});

test("EIA crude inventory parser validates dated million-barrel observations", () => {
  const csv = [
    '"STUB_1","10/30/26","10/23/26","Difference"',
    '"Commercial (Excluding SPR)","400.000","410.000","-10.000"',
  ].join("\r\n");
  const parsed = parseEiaCrudeInventoryCsv(csv, new Date("2026-10-31T12:00:00.000Z"));
  assert.ok(parsed);
  assert.equal(parsed.asOf, "2026-10-30");
  assert.equal(parsed.units, "million barrels");
  assert.ok(parsed.value < 0);
  assert.match(parsed.source.observation, /400\.000 million barrels/);
  assert.equal(parseEiaCrudeInventoryCsv(csv, new Date("2026-11-20T00:00:00.000Z")), null);
});

test("EIA natural-gas storage parser validates the Lower 48 weekly report and units", () => {
  const csv = [
    "Energy Information Administration",
    '"Working Gas in Underground Storage, Lower 48"',
    '"Released: October 29, 2026 for the Week Ending October 23, 2026"',
    '"Next Release: November 5, 2026"',
    "Region,Stocks in billion (Bcf),,,,,",
    ",Year Ago,,,,",
    ",23-Oct-26,,,16-Oct-26",
    'Total,"3,724","","","3,644"',
  ].join("\r\n");
  const parsed = parseEiaNaturalGasStorageCsv(csv, new Date("2026-10-31T12:00:00.000Z"));
  assert.ok(parsed);
  assert.equal(parsed.symbol, "NG=F");
  assert.equal(parsed.asOf, "2026-10-23");
  assert.equal(parsed.units, "billion cubic feet");
  assert.ok(parsed.value > 0);
  assert.match(parsed.source.observation, /3,724 billion cubic feet/);
  assert.equal(parseEiaNaturalGasStorageCsv(csv, new Date("2026-11-20T00:00:00.000Z")), null);
});

test("USDA WASDE parser computes same-unit stocks-to-use change for adjacent marketing years", () => {
  const rows = [
    { reportTitle: "U.S. Feed Grain and Corn Supply and Use", attribute: "Ending Stocks", commodity: "Corn", region: "United States", marketYear: "2026/27", value: "200", unit: "Million Bushels", releaseDate: "2026-10-09" },
    { reportTitle: "U.S. Feed Grain and Corn Supply and Use", attribute: "Use, Total", commodity: "Corn", region: "United States", marketYear: "2026/27", value: "1000", unit: "Million Bushels", releaseDate: "2026-10-09" },
    { reportTitle: "U.S. Feed Grain and Corn Supply and Use", attribute: "Ending Stocks", commodity: "Corn", region: "United States", marketYear: "2025/26", value: "250", unit: "Million Bushels", releaseDate: "2026-10-09" },
    { reportTitle: "U.S. Feed Grain and Corn Supply and Use", attribute: "Use, Total", commodity: "Corn", region: "United States", marketYear: "2025/26", value: "1000", unit: "Million Bushels", releaseDate: "2026-10-09" },
    { reportTitle: "Reliability of Corn Projections", attribute: "Ending Stocks", commodity: "Corn", region: "United States", marketYear: "2024/25", value: "0", unit: "Percent", releaseDate: "2026-10-09" },
  ];
  const parsed = parseUsdaWasdeInventoryCsv(
    rows,
    "https://www.usda.gov/sites/default/files/documents/oce-wasde-report-data-2026-10.csv",
    "ZC=F",
    new Date("2026-10-31T00:00:00.000Z"),
  );
  assert.ok(parsed);
  assert.equal(parsed.provider, "USDA");
  assert.equal(parsed.asOf, "2026-10-09");
  assert.equal(parsed.value, -20);
  assert.match(parsed.source.observation, /20\.0% of total use/);
  const scored = buildCommodityScore({
    symbol: "ZC=F",
    closes: closesWithDailyChange(Array.from({ length: 252 }, () => 0.001)),
    currentPrice: 100,
    historyAsOf: "2026-10-30",
    marketEvidence: { inventory: parsed, positioning: null },
    now: new Date("2026-10-31T00:00:00.000Z"),
  });
  assert.ok(scored);
  assert.equal(scored.factors.find((factor) => factor.key === "physical-balance")?.status, "available");
  assert.equal(scored.dataCoveragePercent, 50);
  assert.equal(parseUsdaWasdeInventoryCsv(
    rows,
    "https://example.com/wasde.csv",
    "ZC=F",
    new Date("2026-10-31T00:00:00.000Z"),
  )?.source.url, "https://example.com/wasde.csv");
  assert.equal(parseUsdaWasdeInventoryCsv(
    rows,
    "https://www.usda.gov/sites/default/files/documents/oce-wasde-report-data-2026-10.csv",
    "ZC=F",
    new Date("2026-12-20T00:00:00.000Z"),
  ), null);
});

test("CFTC parser requires the exact mapped contract, units, and a fresh report", () => {
  const row = {
    cftc_contract_market_code: "088691",
    contract_market_name: "GOLD",
    market_and_exchange_names: "GOLD - COMMODITY EXCHANGE INC.",
    contract_units: "(CONTRACTS OF 100 TROY OUNCES)",
    report_date_as_yyyy_mm_dd: "2026-10-27T00:00:00.000",
    open_interest_all: "100000",
    noncomm_positions_long_all: "40000",
    noncomm_positions_short_all: "20000",
  };
  const parsed = parseCftcPositioningRows([row], "GC=F", new Date("2026-10-30T00:00:00.000Z"));
  assert.ok(parsed);
  assert.equal(parsed.contractCode, "088691");
  assert.equal(parsed.asOf, "2026-10-27");
  assert.equal(parseCftcPositioningRows([{ ...row, contract_units: "(CONTRACTS OF 10 TROY OUNCES)" }], "GC=F", new Date("2026-10-30T00:00:00.000Z")), null);
  assert.equal(parseCftcPositioningRows([{ ...row, cftc_contract_market_code: "088695" }], "GC=F", new Date("2026-10-30T00:00:00.000Z")), null);
  assert.equal(parseCftcPositioningRows([row], "GC=F", new Date("2026-11-20T00:00:00.000Z")), null);

  const naturalGas = parseCftcPositioningRows([{
    ...row,
    cftc_contract_market_code: "023651",
    contract_market_name: "NAT GAS NYME",
    market_and_exchange_names: "NAT GAS NYME - NEW YORK MERCANTILE EXCHANGE",
    contract_units: "(Contracts of 10,000 MMBTU'S)",
  }], "NG=F", new Date("2026-10-30T00:00:00.000Z"));
  assert.ok(naturalGas);
  const scored = buildCommodityScore({
    symbol: "GC=F",
    closes: closesWithDailyChange(Array.from({ length: 252 }, () => 0.001)),
    currentPrice: 165,
    historyAsOf: "2026-10-30",
    marketEvidence: { inventory: null, positioning: parsed },
    now: new Date("2026-10-30T00:00:00.000Z"),
  });
  assert.ok(scored);
  assert.equal(scored.factors.find((factor) => factor.key === "positioning")?.status, "available");
  assert.equal(scored.factors.find((factor) => factor.key === "positioning")?.sources.length, 1);
  assert.equal(scored.dataCoveragePercent, 50);
});

test("only validated dated inventory and positioning inputs contribute to the deterministic score", () => {
  const closes = closesWithDailyChange(Array.from({ length: 252 }, () => 0.002));
  const base = buildCommodityScore({
    symbol: "CL=F", closes, currentPrice: 100, historyAsOf: "2026-10-30",
    now: new Date("2026-10-31T00:00:00.000Z"),
  });
  const evidence = {
    inventory: {
      provider: "EIA" as const, symbol: "CL=F", instrument: "Crude Oil",
      metric: "weekly-stock-change-percent" as const, value: -1, asOf: "2026-10-30",
      units: "million barrels",
      source: {
        title: "EIA Weekly Petroleum Status Report, Table 4",
        url: "https://ir.eia.gov/wpsr/table4.csv",
        asOf: "2026-10-30",
        unit: "million barrels",
        observation: "Commercial crude stocks fell week over week.",
      },
    },
    positioning: null,
  };
  const withEvidence = buildCommodityScore({
    symbol: "CL=F", closes, currentPrice: 100, historyAsOf: "2026-10-30",
    marketEvidence: evidence,
    now: new Date("2026-10-31T00:00:00.000Z"),
  });
  const fakeEvidence = buildCommodityScore({
    symbol: "CL=F", closes, currentPrice: 100, historyAsOf: "2026-10-30",
    marketEvidence: {
      inventory: { ...evidence.inventory, source: { ...evidence.inventory.source, url: "https://example.com/fake.csv" } },
      positioning: null,
    },
    now: new Date("2026-10-31T00:00:00.000Z"),
  });
  assert.ok(base && withEvidence && fakeEvidence);
  assert.notEqual(withEvidence.score, base.score);
  assert.equal(withEvidence.dataCoveragePercent, 50);
  assert.equal(withEvidence.factors.find((factor) => factor.key === "physical-balance")?.status, "available");
  assert.equal(fakeEvidence.score, base.score);
  assert.equal(fakeEvidence.dataCoveragePercent, 33);
  assert.equal(fakeEvidence.factors.find((factor) => factor.key === "physical-balance")?.score, null);
});

test("realized volatility dampens the trend signal without changing its direction", () => {
  const steady = Array.from({ length: 252 }, () => 0.002);
  const noisy = Array.from({ length: 252 }, (_, index) => 0.002 + (index % 2 === 0 ? 0.06 : -0.06));
  const steadyScore = buildCommodityScore({
    symbol: "CL=F", closes: closesWithDailyChange(steady), currentPrice: 100, historyAsOf: null,
  });
  const noisyScore = buildCommodityScore({
    symbol: "CL=F", closes: closesWithDailyChange(noisy), currentPrice: 100, historyAsOf: null,
  });
  assert.ok(steadyScore && noisyScore);
  assert.ok(steadyScore.score > 50);
  assert.ok(noisyScore.annualizedVolatilityPercent > steadyScore.annualizedVolatilityPercent);
  assert.ok(noisyScore.score < steadyScore.score);
});

test("unsupported symbols and insufficient history do not receive a commodity score", () => {
  assert.equal(buildCommodityScore({
    symbol: "ES=F", closes: Array(40).fill(100), currentPrice: 100, historyAsOf: null,
  }), null);
  assert.equal(buildCommodityScore({
    symbol: "GC=F", closes: Array(19).fill(100), currentPrice: 100, historyAsOf: null,
  }), null);
});

test("news source parsing deduplicates URLs and rejects non-web links", () => {
  assert.deepEqual(parseCommodityNewsSources([
    { title: "Market update", url: "https://example.com/news", published_at: "2026-10-30" },
    { title: "Duplicate", url: "https://example.com/news" },
    { title: "Bad", url: "javascript:alert(1)" },
    { title: "Second", url: "https://example.org/story" },
  ]), [
    { title: "Market update", url: "https://example.com/news", publishedAt: "2026-10-30" },
    { title: "Second", url: "https://example.org/story", publishedAt: null },
  ]);
});
