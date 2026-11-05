import assert from "node:assert/strict";
import test from "node:test";
import {
  assessCommodityHistory,
  buildCommodityIntelligenceScorecard,
  buildCommodityScore as scoreCommodity,
  COMMODITY_INTELLIGENCE_WEIGHTS,
  type CommodityScoreInput,
  parseCommodityNewsSources,
} from "./commodityAnalysis.ts";
import {
  fetchCommodityInventoryEvidence,
  fetchCommodityInventoryEvidenceWithStatus,
  fetchCommodityPositioningEvidenceWithStatus,
  fetchCommoditySupplyDemandContext,
  parseCftcPositioningRows,
  parseEiaCrudeInventoryCsv,
  parseEiaNaturalGasStorageCsv,
  parseUsgsMineralSupplyDemandCsv,
  parseUsdaSupplyDemandSeries,
  parseUsdaWasdeInventoryCsv,
  validateCommoditySupplyDemandContext,
} from "./commodityMarketData.ts";

const closesWithDailyChange = (changes: number[]) => {
  const closes = [100];
  for (const change of changes) closes.push(closes.at(-1)! * Math.exp(change));
  return closes;
};

const DEFAULT_NOW = new Date("2026-11-02T12:00:00.000Z");

function fixtureSessions(start: string, end: string, holidays: string[] = []): string[] {
  const closed = new Set(holidays);
  const sessions: string[] = [];
  for (let timestamp = Date.parse(`${start}T00:00:00.000Z`);
    timestamp <= Date.parse(`${end}T00:00:00.000Z`);
    timestamp += 86_400_000) {
    const date = new Date(timestamp).toISOString().slice(0, 10);
    const weekday = new Date(timestamp).getUTCDay();
    if (weekday !== 0 && weekday !== 6 && !closed.has(date)) sessions.push(date);
  }
  return sessions;
}

function fixtureHistoryDates(count: number, end: string, holidays: string[] = []): string[] {
  const dates: string[] = [];
  let timestamp = Date.parse(`${end}T00:00:00.000Z`);
  const closed = new Set(holidays);
  while (dates.length < count) {
    const date = new Date(timestamp).toISOString().slice(0, 10);
    const weekday = new Date(timestamp).getUTCDay();
    if (weekday !== 0 && weekday !== 6 && !closed.has(date)) dates.push(date);
    timestamp -= 86_400_000;
  }
  return dates.reverse();
}

type CommodityTestInput = Omit<CommodityScoreInput, "historyDates" | "historySessions">
  & Partial<Pick<CommodityScoreInput, "historyDates" | "historySessions">>;

function buildCommodityScore(input: CommodityTestInput) {
  const now = input.now ?? DEFAULT_NOW;
  const historyDates = input.historyDates
    ?? fixtureHistoryDates(input.closes.length, input.historyAsOf ?? "2026-10-30");
  const historySessions = input.historySessions
    ?? fixtureSessions(historyDates[0] ?? "2026-10-30", now.toISOString().slice(0, 10));
  return scoreCommodity({ ...input, now, historyDates, historySessions });
}

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
  assert.deepEqual(parsed.publishedObservations?.map((item) => [item.reportingPeriod, item.value]), [
    ["2026-10-30", 400],
    ["2026-10-23", 410],
  ]);
  assert.ok(parsed.value < 0);
  assert.match(parsed.source.observation, /400\.000 million barrels/);
  assert.equal(parseEiaCrudeInventoryCsv(csv, new Date("2026-11-20T00:00:00.000Z")), null);
});

test("EIA inventory coverage recovers after a short outage cache expires", async () => {
  const csv = [
    '"STUB_1","10/30/26","10/23/26","Difference"',
    '"Commercial (Excluding SPR)","400.000","410.000","-10.000"',
  ].join("\r\n");
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let clock = originalNow();
  let requestCount = 0;
  Date.now = () => clock;
  globalThis.fetch = async () => {
    requestCount += 1;
    if (requestCount === 1) return new Response("temporarily unavailable", { status: 503 });
    return new Response(csv, { status: 200 });
  };

  try {
    assert.equal(await fetchCommodityInventoryEvidence("CL=F", new Date("2026-10-31T12:00:00.000Z")), null);
    assert.equal(await fetchCommodityInventoryEvidence("CL=F", new Date("2026-10-31T12:00:00.000Z")), null);
    assert.equal(requestCount, 1, "repeated lookups during an outage should use the short negative cache");

    clock += 5 * 60 * 1000 + 1;
    const recovered = await fetchCommodityInventoryEvidence("CL=F", new Date("2026-10-31T12:00:00.000Z"));
    assert.ok(recovered, "a recovered EIA source should restore commodity coverage");
    assert.equal(recovered.provider, "EIA");
    assert.equal(requestCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  }
});

test("CFTC positioning coverage recovers after a short empty-report cache expires", async () => {
  const row = {
    cftc_contract_market_code: "088691",
    contract_market_name: "GOLD",
    market_and_exchange_names: "GOLD - COMMODITY EXCHANGE INC.",
    contract_units: "(CONTRACTS OF 100 TROY OUNCES)",
    report_date_as_yyyy_mm_dd: "2026-10-30T00:00:00.000",
    open_interest_all: "100000",
    noncomm_positions_long_all: "40000",
    noncomm_positions_short_all: "20000",
  };
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let clock = originalNow();
  let requestCount = 0;
  Date.now = () => clock;
  globalThis.fetch = async () => {
    requestCount += 1;
    return new Response(requestCount === 1 ? "[]" : JSON.stringify([row]), { status: 200 });
  };

  try {
    const now = new Date("2026-11-02T12:00:00.000Z");
    const empty = await fetchCommodityPositioningEvidenceWithStatus("GC=F", now);
    assert.equal(empty.evidence, null);
    assert.deepEqual(empty.failure, { provider: "CFTC", state: "unavailable" });

    const cachedEmpty = await fetchCommodityPositioningEvidenceWithStatus("GC=F", now);
    assert.equal(cachedEmpty.evidence, null);
    assert.deepEqual(cachedEmpty.failure, { provider: "CFTC", state: "unavailable" });
    assert.equal(requestCount, 1, "an empty report should use the short negative cache");

    clock += 5 * 60 * 1000 + 1;
    const recovered = await fetchCommodityPositioningEvidenceWithStatus("GC=F", now);
    assert.ok(recovered.evidence, "a later valid CFTC report should restore positioning coverage");
    assert.equal(recovered.evidence.provider, "CFTC");
    assert.equal(recovered.evidence.symbol, "GC=F");
    assert.equal(requestCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  }
});

test("an empty CFTC report for one commodity does not suppress another commodity", async () => {
  const copperRow = {
    cftc_contract_market_code: "085692",
    contract_market_name: "COPPER- #1",
    market_and_exchange_names: "COPPER- #1 - COMMODITY EXCHANGE INC.",
    contract_units: "(CONTRACTS OF 25,000 POUNDS)",
    report_date_as_yyyy_mm_dd: "2026-10-30T00:00:00.000",
    open_interest_all: "200000",
    noncomm_positions_long_all: "80000",
    noncomm_positions_short_all: "40000",
  };
  const originalFetch = globalThis.fetch;
  const sourceQueries: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    const where = url.searchParams.get("$where") ?? "";
    sourceQueries.push(where);
    return new Response(where.includes("085692") ? JSON.stringify([copperRow]) : "[]", { status: 200 });
  };

  try {
    const now = new Date("2026-11-02T12:00:00.000Z");
    const emptySilver = await fetchCommodityPositioningEvidenceWithStatus("SI=F", now);
    assert.equal(emptySilver.evidence, null);
    assert.deepEqual(emptySilver.failure, { provider: "CFTC", state: "unavailable" });

    const copper = await fetchCommodityPositioningEvidenceWithStatus("HG=F", now);
    assert.ok(copper.evidence, "a separate commodity should still receive its valid CFTC report");
    assert.equal(copper.evidence.symbol, "HG=F");
    assert.equal(copper.evidence.provider, "CFTC");
    assert.deepEqual(sourceQueries, [
      "cftc_contract_market_code='084691'",
      "cftc_contract_market_code='085692'",
    ], "each symbol should make its own contract-specific source request");

    const cachedEmptySilver = await fetchCommodityPositioningEvidenceWithStatus("SI=F", now);
    assert.equal(cachedEmptySilver.evidence, null);
    assert.deepEqual(cachedEmptySilver.failure, { provider: "CFTC", state: "unavailable" });
    assert.equal(sourceQueries.length, 2, "the empty result should remain cached only for silver");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("USDA report-search failures are shared across commodities and recover after expiry", async () => {
  const csv = [
    "ReportTitle,Attribute,Commodity,Region,MarketYear,Value,Unit,ReleaseDate",
    '"U.S. Corn Supply and Use","Ending Stocks",Corn,"United States",2026/27,1800,"million bushels",2026-10-12',
    '"U.S. Corn Supply and Use","Use, Total",Corn,"United States",2026/27,15000,"million bushels",2026-10-12',
    '"U.S. Corn Supply and Use","Ending Stocks",Corn,"United States",2025/26,1700,"million bushels",2026-10-12',
    '"U.S. Corn Supply and Use","Use, Total",Corn,"United States",2025/26,14000,"million bushels",2026-10-12',
  ].join("\r\n");
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let clock = originalNow();
  let requestCount = 0;
  Date.now = () => clock;
  globalThis.fetch = async () => {
    requestCount += 1;
    return requestCount <= 8
      ? new Response("temporarily unavailable", { status: 503 })
      : new Response(csv, { status: 200 });
  };

  try {
    const now = new Date("2026-11-02T12:00:00.000Z");
    assert.deepEqual(
      (await fetchCommodityInventoryEvidenceWithStatus("ZC=F", now)).failure,
      { provider: "USDA", state: "unavailable" },
    );
    assert.deepEqual(
      (await fetchCommodityInventoryEvidenceWithStatus("ZW=F", now)).failure,
      { provider: "USDA", state: "unavailable" },
    );
    assert.deepEqual(
      (await fetchCommodityInventoryEvidenceWithStatus("ZC=F", now)).failure,
      { provider: "USDA", state: "unavailable" },
    );
    assert.equal(
      requestCount,
      8,
      "the report candidate search should run once and be shared across USDA commodities",
    );

    clock += 15 * 60 * 1000 + 1;
    const recovered = await fetchCommodityInventoryEvidence("ZC=F", now);
    assert.ok(recovered, "a newly available USDA report should restore inventory coverage");
    assert.equal(recovered.provider, "USDA");
    assert.equal(recovered.symbol, "ZC=F");
    assert.equal(requestCount, 9, "the first candidate should succeed after the shared negative cache expires");
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  }
});

test("USDA inventory search falls through when the revised CSV is missing", async () => {
  const csv = [
    "ReportTitle,Attribute,Commodity,Region,MarketYear,Value,Unit,ReleaseDate",
    '"U.S. Oilseed, Soybean Supply and Use","Ending Stocks","Oilseed, Soybean","United States",2026/27,200,"Million Bushels",2026-10-12',
    '"U.S. Oilseed, Soybean Supply and Use","Total Use","Oilseed, Soybean","United States",2026/27,1000,"Million Bushels",2026-10-12',
    '"U.S. Oilseed, Soybean Supply and Use","Ending Stocks","Oilseed, Soybean","United States",2025/26,250,"Million Bushels",2026-10-12',
    '"U.S. Oilseed, Soybean Supply and Use","Total Use","Oilseed, Soybean","United States",2025/26,1000,"Million Bushels",2026-10-12',
  ].join("\r\n");
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requestedUrls.push(url);
    return requestedUrls.length === 1
      ? new Response("not found", { status: 404 })
      : new Response(csv, { status: 200 });
  };

  try {
    const result = await fetchCommodityInventoryEvidenceWithStatus(
      "ZS=F",
      new Date("2026-11-02T12:00:00.000Z"),
    );
    assert.ok(result.evidence, "a valid base report should restore inventory evidence");
    assert.equal(requestedUrls.length, 2, "the base CSV should be tried after the revised CSV is missing");
    assert.match(requestedUrls[0], /2026-11-V2\.csv$/);
    assert.match(requestedUrls[1], /2026-11\.csv$/);
    assert.equal(result.evidence.source.url, requestedUrls[1]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("USDA inventory search skips invalid revised contents and cites the valid base CSV", async () => {
  const invalidCsv = [
    "ReportTitle,Attribute,Commodity,Region,MarketYear,Value,Unit,ReleaseDate",
    '"U.S. Cotton Supply and Use","Ending Stocks",Cotton,"United States",2026/27,not-a-number,"Million 480-Pound Bales",2026-10-12',
  ].join("\r\n");
  const validCsv = [
    "ReportTitle,Attribute,Commodity,Region,MarketYear,Value,Unit,ReleaseDate",
    '"U.S. Cotton Supply and Use","Ending Stocks",Cotton,"United States",2026/27,200,"Million 480-Pound Bales",2026-10-12',
    '"U.S. Cotton Supply and Use","Total Use",Cotton,"United States",2026/27,1000,"Million 480-Pound Bales",2026-10-12',
    '"U.S. Cotton Supply and Use","Ending Stocks",Cotton,"United States",2025/26,250,"Million 480-Pound Bales",2026-10-12',
    '"U.S. Cotton Supply and Use","Total Use",Cotton,"United States",2025/26,1000,"Million 480-Pound Bales",2026-10-12',
  ].join("\r\n");
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requestedUrls.push(url);
    return new Response(requestedUrls.length === 1 ? invalidCsv : validCsv, { status: 200 });
  };

  try {
    const result = await fetchCommodityInventoryEvidenceWithStatus(
      "CT=F",
      new Date("2026-11-02T12:00:00.000Z"),
    );
    assert.ok(result.evidence, "invalid revised contents must not block a valid base report");
    assert.equal(requestedUrls.length, 2, "the invalid revised CSV should be skipped");
    assert.match(requestedUrls[0], /2026-11-V2\.csv$/);
    assert.match(requestedUrls[1], /2026-11\.csv$/);
    assert.equal(result.evidence.source.url, requestedUrls[1]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("official inventory fetch status identifies stale EIA reports without exposing a source citation", async () => {
  const csv = [
    "Energy Information Administration",
    '"Working Gas in Underground Storage, Lower 48"',
    '"Released: October 1, 2026 for the Week Ending September 25, 2026"',
    '"Next Release: October 8, 2026"',
    "Region,Stocks in billion (Bcf),,,,,",
    ",Year Ago,,,,",
    ",25-Sep-26,,,18-Sep-26",
    'Total,"3,500","","","3,600"',
  ].join("\r\n");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(csv, { status: 200 });
  try {
    const result = await fetchCommodityInventoryEvidenceWithStatus(
      "NG=F",
      new Date("2026-11-02T12:00:00.000Z"),
    );
    assert.equal(result.evidence, null);
    assert.deepEqual(result.failure, { provider: "EIA", state: "stale" });
  } finally {
    globalThis.fetch = originalFetch;
  }
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

test("USDA supply-demand series compare only same-unit, dated reports and leave missing trade data unavailable", () => {
  const releaseDate = "2026-10-12";
  const sourceUrl = "https://www.usda.gov/sites/default/files/documents/oce-wasde-report-data-2026-10.csv";
  const rows = ["2024/25", "2025/26", "2026/27"].flatMap((marketYear, index) => [
    { reportTitle: "U.S. Corn Supply and Use", attribute: "Ending Stocks", commodity: "Corn", region: "United States", marketYear, value: String(100 + index * 10), unit: "Million Bushels", releaseDate },
    { reportTitle: "U.S. Corn Supply and Use", attribute: "Production", commodity: "Corn", region: "United States", marketYear, value: String(1000 + index * 100), unit: "Million Bushels", releaseDate },
    { reportTitle: "U.S. Corn Supply and Use", attribute: "Use, Total", commodity: "Corn", region: "United States", marketYear, value: String(900 + index * 100), unit: "Million Bushels", releaseDate },
  ]);
  const result = parseUsdaSupplyDemandSeries(
    rows,
    sourceUrl,
    "ZC=F",
    new Date("2026-11-02T12:00:00.000Z"),
  );
  assert.equal(result.status, "partial");
  assert.equal(result.series.find((item) => item.id === "inventory")?.points.length, 3);
  assert.equal(result.series.find((item) => item.id === "inventory")?.historicalAverage, 105);
  assert.equal(result.series.find((item) => item.id === "inventory")?.historicalAveragePeriod, "2024/25–2025/26 (2 prior periods)");
  assert.equal(result.series.find((item) => item.id === "production")?.points[0]?.publicationDate, releaseDate);
  assert.equal(result.series.find((item) => item.id === "production")?.points[0]?.commodity, "Corn");
  assert.equal(result.series.find((item) => item.id === "exports")?.status, "unavailable");
  assert.equal(result.series.find((item) => item.id === "imports")?.reason?.includes("does not publish"), true);
  assert.equal(parseUsdaSupplyDemandSeries(
    rows,
    "https://example.com/wasde.csv",
    "ZC=F",
    new Date("2026-11-02T12:00:00.000Z"),
  ).status, "unavailable");
});

test("USDA meat supply histories use dated annual beef and pork reports, including the latest revision", () => {
  const sourceUrl = "https://www.usda.gov/sites/default/files/documents/oce-wasde-report-data-2026-10.csv";
  const rows = (commodity: "Beef" | "Pork") => [
    ...["2024", "2025", "2026"].flatMap((marketYear, index) => [
      { reportTitle: "U.S. Meats Supply and Use", attribute: "Ending Stocks", commodity, region: "United States", marketYear, value: String(100 + index * 10), unit: "Million Pounds", releaseDate: "2026-10-09" },
      { reportTitle: "U.S. Meats Supply and Use", attribute: "Production", commodity, region: "United States", marketYear, value: String(1000 + index * 100), unit: "Million Pounds", releaseDate: "2026-10-09" },
      { reportTitle: "U.S. Meats Supply and Use", attribute: "Total Use", commodity, region: "United States", marketYear, value: String(900 + index * 100), unit: "Million Pounds", releaseDate: "2026-10-09" },
      { reportTitle: "U.S. Meats Supply and Use", attribute: "Imports", commodity, region: "United States", marketYear, value: String(10 + index), unit: "Million Pounds", releaseDate: "2026-10-09" },
      { reportTitle: "U.S. Meats Supply and Use", attribute: "Exports", commodity, region: "United States", marketYear, value: String(20 + index), unit: "Million Pounds", releaseDate: "2026-10-09" },
    ]),
    { reportTitle: "U.S. Meats Supply and Use", attribute: "Production", commodity, region: "United States", marketYear: "2025", value: "9999", unit: "Million Pounds", releaseDate: "2026-09-11" },
  ];

  const beef = parseUsdaSupplyDemandSeries(rows("Beef"), sourceUrl, "LE=F", DEFAULT_NOW);
  const pork = parseUsdaSupplyDemandSeries(rows("Pork"), sourceUrl, "HE=F", DEFAULT_NOW);
  const beefProduction = beef.series.find((item) => item.id === "production");
  const porkProduction = pork.series.find((item) => item.id === "production");
  assert.equal(beef.status, "available");
  assert.equal(beef.commodity, "Live Cattle");
  assert.equal(beefProduction?.label, "Beef production");
  assert.equal(beefProduction?.points[0]?.commodity, "Beef");
  assert.equal(beefProduction?.points[1]?.value, 1100, "the September value must not replace the October report vintage");
  assert.equal(beefProduction?.points[0]?.publicationDate, "2026-10-09");
  assert.equal(beefProduction?.historicalAverage, 1050);
  assert.equal(pork.status, "available");
  assert.equal(pork.commodity, "Lean Hogs");
  assert.equal(porkProduction?.label, "Pork production");
  assert.equal(porkProduction?.points[0]?.commodity, "Pork");
  assert.equal(validateCommoditySupplyDemandContext(beef, "LE=F", DEFAULT_NOW)
    .series.find((item) => item.id === "production")?.status, "available");
});

const USGS_TEST_SOURCE = "https://www.sciencebase.gov/catalog/file/get/0123456789abcdef01234567?f=__disk__test";
const USGS_COPPER_FIXTURE = [
  "MCS chapter,Section,Commodity,Country,Statistics,Statistics_detail,Unit,Year,Value,Notes",
  ...[
    ["2021", "100"],
    ["2022", "200"],
    ["2023", "300"],
    ["2023", "301"],
    ["2024", "400"],
    ["2025", "500"],
  ].map(([year, value]) => [
    "COPPER",
    "Salient Statistics—United States",
    "Copper",
    "United States",
    "Production",
    "Production: Mine, recoverable",
    "thousand metric tons",
    year,
    value,
    year === "2025" ? "Estimated." : "",
  ].map((field) => `"${field}"`).join(",")),
  '"COPPER","World Mine and Refinery Production and Reserves","Copper","United States","Production","Mine production","thousand metric tons","2025","9999",""',
].join("\n");

test("USGS metal histories match exact annual rows and retain release and revision dates", () => {
  const result = parseUsgsMineralSupplyDemandCsv(
    USGS_COPPER_FIXTURE,
    USGS_TEST_SOURCE,
    "HG=F",
    "2026-02-06",
    "2026-05-27",
    DEFAULT_NOW,
  );
  const production = result.series.find((item) => item.id === "production");
  assert.equal(result.status, "partial");
  assert.equal(production?.status, "available");
  assert.equal(production?.label, "U.S. recoverable mine production");
  assert.deepEqual(production?.points.map((point) => point.reportingPeriod), ["2021", "2022", "2024", "2025"]);
  assert.equal(production?.historicalAverage, (100 + 200 + 400) / 3);
  assert.equal(production?.historicalAveragePeriod, "2021–2024 (3 prior periods)");
  assert.equal(production?.points.at(-1)?.publicationDate, "2026-02-06");
  assert.equal(production?.points.at(-1)?.revisionDate, "2026-05-27");
  assert.equal(production?.points.at(-1)?.value, 500, "ambiguous duplicate rows are not selected as either vintage");
  const validated = validateCommoditySupplyDemandContext(result, "HG=F", DEFAULT_NOW);
  assert.equal(validated.series.find((item) => item.id === "production")?.historicalAverage, (100 + 200 + 400) / 3);
  assert.equal(validated.series.find((item) => item.id === "inventory")?.status, "unavailable");
});

test("USGS production mappings match the distinct metal row and unit for every supported contract", () => {
  const metals = [
    { symbol: "GC=F", commodity: "Gold", detail: "Production: Mine", units: "metric tons" },
    { symbol: "SI=F", commodity: "Silver", detail: "Production: Mine", units: "metric tons" },
    { symbol: "HG=F", commodity: "Copper", detail: "Production: Mine, recoverable", units: "thousand metric tons" },
    { symbol: "PL=F", commodity: "Platinum", detail: "Mine production: Platinum", units: "kilograms" },
    { symbol: "PA=F", commodity: "Palladium", detail: "Mine production: Palladium", units: "kilograms" },
  ] as const;
  for (const metal of metals) {
    const csv = [
      "MCS chapter,Section,Commodity,Country,Statistics,Statistics_detail,Unit,Year,Value,Notes",
      ...["2022", "2023", "2024"].map((year, index) => [
        "METAL",
        "Salient Statistics—United States",
        metal.commodity,
        "United States",
        "Production",
        metal.detail,
        metal.units,
        year,
        String(100 + index * 10),
        "",
      ].map((field) => `"${field}"`).join(",")),
    ].join("\n");
    const result = parseUsgsMineralSupplyDemandCsv(
      csv,
      USGS_TEST_SOURCE,
      metal.symbol,
      "2026-02-06",
      "2026-05-27",
      DEFAULT_NOW,
    );
    const production = result.series.find((item) => item.id === "production");
    assert.equal(production?.status, "available", `${metal.commodity} should have its own supported USGS row`);
    assert.equal(production?.units, metal.units);
    assert.equal(production?.points.length, 3);
    assert.equal(production?.points[0]?.commodity, metal.commodity);
  }
});

test("stale USGS releases and unsupported metal rows remain unavailable", () => {
  const stale = parseUsgsMineralSupplyDemandCsv(
    USGS_COPPER_FIXTURE,
    USGS_TEST_SOURCE,
    "HG=F",
    "2024-02-06",
    "2024-05-27",
    DEFAULT_NOW,
  );
  assert.equal(stale.status, "unavailable");
  assert.ok(stale.series.every((item) => item.points.length === 0));
  const unsupportedMetal = parseUsgsMineralSupplyDemandCsv(
    USGS_COPPER_FIXTURE,
    USGS_TEST_SOURCE,
    "KC=F",
    "2026-02-06",
    "2026-05-27",
    DEFAULT_NOW,
  );
  assert.equal(unsupportedMetal.status, "unavailable");
});

test("USGS report fetch validates the release metadata and recovers after source failures", async () => {
  const originalFetch = globalThis.fetch;
  const csv = [
    "MCS chapter,Section,Commodity,Country,Statistics,Statistics_detail,Unit,Year,Value,Notes",
    '"GOLD","Salient Statistics—United States","Gold","United States","Production","Production: Mine","metric tons","2022","170",""',
    '"GOLD","Salient Statistics—United States","Gold","United States","Production","Production: Mine","metric tons","2023","165",""',
    '"GOLD","Salient Statistics—United States","Gold","United States","Production","Production: Mine","metric tons","2024","163",""',
    '"GOLD","Salient Statistics—United States","Gold","United States","Production","Production: Mine","metric tons","2025","160","Estimated."',
  ].join("\n");
  let sourceFailure = false;
  let requestCount = 0;
  globalThis.fetch = async (input) => {
    requestCount += 1;
    const url = String(input);
    if (sourceFailure) return new Response("temporarily unavailable", { status: 503 });
    if (url.includes("/catalog/items?")) {
      return new Response(JSON.stringify({
        items: [{ id: "0123456789abcdef01234567", title: "Mineral Commodity Summaries 2026 Data Release" }],
      }), { status: 200 });
    }
    if (url.includes("/catalog/item/0123456789abcdef01234567?format=json")) {
      return new Response(JSON.stringify({
        dates: [{ type: "Publication", dateString: "2026-02-06" }],
        provenance: { lastUpdated: "2026-05-27T15:15:21Z" },
        files: [{ name: "MCS2026_Commodities_Data.csv", downloadUri: USGS_TEST_SOURCE }],
      }), { status: 200 });
    }
    if (url === USGS_TEST_SOURCE) return new Response(csv, { status: 200 });
    return new Response("not found", { status: 404 });
  };

  try {
    const eventCalendar = { status: "unavailable" as const, checkedAt: "2026-11-02T00:00:00Z", events: [], unavailable: [] };
    const context = await fetchCommoditySupplyDemandContext("GC=F", null, eventCalendar, DEFAULT_NOW);
    const validated = validateCommoditySupplyDemandContext(context, "GC=F", DEFAULT_NOW);
    const production = validated.series.find((item) => item.id === "production");
    assert.equal(production?.status, "available");
    assert.equal(production?.points.at(-1)?.publicationDate, "2026-02-06");
    assert.equal(production?.points.at(-1)?.revisionDate, "2026-05-27");
    assert.equal(requestCount, 3, "search, metadata, and the dated USGS CSV should all be checked");

    sourceFailure = true;
    const failedYear = new Date("2028-11-02T12:00:00.000Z");
    const failed = await fetchCommoditySupplyDemandContext("PA=F", null, eventCalendar, failedYear);
    assert.equal(failed.status, "unavailable");
    const requestsAfterFailure = requestCount;
    const cachedFailure = await fetchCommoditySupplyDemandContext("PL=F", null, eventCalendar, failedYear);
    assert.equal(cachedFailure.status, "unavailable");
    assert.equal(requestCount, requestsAfterFailure, "a temporary source failure should use the short negative cache");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("revised and stale WASDE rows do not become supply-demand series", () => {
  const rows = [
    { reportTitle: "U.S. Corn Supply and Use", attribute: "Ending Stocks", commodity: "Corn", region: "United States", marketYear: "2026/27", value: "200", unit: "Million Bushels", releaseDate: "2026-10-12" },
    { reportTitle: "U.S. Corn Supply and Use", attribute: "Ending Stocks", commodity: "Corn", region: "United States", marketYear: "2026/27", value: "205", unit: "Million Bushels", releaseDate: "2026-10-12" },
    { reportTitle: "U.S. Corn Supply and Use", attribute: "Production", commodity: "Corn", region: "United States", marketYear: "2026/27", value: "1000", unit: "Million Bushels", releaseDate: "2026-01-01" },
  ];
  const url = "https://www.usda.gov/sites/default/files/documents/oce-wasde-report-data-2026-10-V2.csv";
  const result = parseUsdaSupplyDemandSeries(rows, url, "ZC=F", DEFAULT_NOW);
  assert.equal(result.status, "unavailable");
  assert.ok(result.series.every((item) => item.points.length === 0));
});

test("USDA WASDE inventory accepts matching units and rejects mismatches for every supported crop", () => {
  const crops = [
    {
      symbol: "ZC=F",
      commodity: "Corn",
      instrument: "Corn",
      title: "U.S. Feed Grain and Corn Supply and Use",
      totalUseAttribute: "Use, Total",
      unit: "Million Bushels",
    },
    {
      symbol: "ZW=F",
      commodity: "Wheat",
      instrument: "Wheat",
      title: "U.S. Wheat Supply and Use",
      totalUseAttribute: "Total Use",
      unit: "Million Bushels",
    },
    {
      symbol: "ZS=F",
      commodity: "Oilseed, Soybean",
      instrument: "Soybeans",
      title: "U.S. Oilseed, Soybean Supply and Use",
      totalUseAttribute: "Total Use",
      unit: "Million Bushels",
    },
    {
      symbol: "CT=F",
      commodity: "Cotton",
      instrument: "Cotton",
      title: "U.S. Cotton Supply and Use",
      totalUseAttribute: "Total Use",
      unit: "Million 480-Pound Bales",
    },
    {
      symbol: "SB=F",
      commodity: "Sugar",
      instrument: "Sugar",
      title: "U.S. Sugar Supply and Use",
      totalUseAttribute: "Total Use",
      unit: "Thousand Short Tons, Raw Value",
    },
  ] as const;
  const reportDate = "2026-10-12";
  const sourceUrl = "https://www.usda.gov/sites/default/files/documents/oce-wasde-report-data-2026-10.csv";

  for (const crop of crops) {
    const rows = ["2026/27", "2025/26"].flatMap((marketYear, index) => [
      {
        reportTitle: crop.title,
        attribute: "Ending Stocks",
        commodity: crop.commodity,
        region: "United States",
        marketYear,
        value: index === 0 ? "200" : "250",
        unit: crop.unit,
        releaseDate: reportDate,
      },
      {
        reportTitle: crop.title,
        attribute: crop.totalUseAttribute,
        commodity: crop.commodity,
        region: "United States",
        marketYear,
        value: "1000",
        unit: crop.unit,
        releaseDate: reportDate,
      },
    ]);
    const parsed = parseUsdaWasdeInventoryCsv(
      rows,
      sourceUrl,
      crop.symbol,
      new Date("2026-10-31T00:00:00.000Z"),
    );

    assert.ok(parsed, `${crop.instrument} fixture should produce inventory evidence`);
    assert.equal(parsed.provider, "USDA");
    assert.equal(parsed.symbol, crop.symbol);
    assert.equal(parsed.instrument, crop.instrument);
    assert.equal(parsed.asOf, reportDate);
    assert.equal(parsed.units, "percent of total use");
    assert.equal(parsed.source.asOf, reportDate);
    assert.equal(parsed.source.unit, crop.unit);
    assert.equal(parsed.source.url, sourceUrl);
    assert.match(parsed.source.title, /2026\/27 supply and use/);
    assert.match(parsed.source.observation, new RegExp(`USDA WASDE ${crop.commodity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.equal(parsed.value, -20);

    const mismatchedRows = rows.map((row) => row.attribute.toLowerCase() === "ending stocks"
      ? { ...row, unit: `${crop.unit} (mismatched)` }
      : row);
    assert.equal(
      parseUsdaWasdeInventoryCsv(
        mismatchedRows,
        sourceUrl,
        crop.symbol,
        new Date("2026-10-31T00:00:00.000Z"),
      ),
      null,
      `${crop.instrument} fixture with mismatched ending-stock and total-use units should not produce inventory evidence`,
    );
  }
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
    symbol: "CL=F", closes: closesWithDailyChange(steady), currentPrice: 100, historyAsOf: "2026-10-30",
  });
  const noisyScore = buildCommodityScore({
    symbol: "CL=F", closes: closesWithDailyChange(noisy), currentPrice: 100, historyAsOf: "2026-10-30",
  });
  assert.ok(steadyScore && noisyScore);
  assert.ok(steadyScore.score > 50);
  assert.ok(noisyScore.annualizedVolatilityPercent > steadyScore.annualizedVolatilityPercent);
  assert.ok(noisyScore.score < steadyScore.score);
});

test("commodity intelligence scores five evidence categories with family-specific weights", () => {
  const symbols = ["GC=F", "SI=F", "CL=F", "NG=F", "HG=F", "ZC=F"];
  const closes = closesWithDailyChange(Array.from({ length: 252 }, () => 0.001));
  for (const symbol of symbols) {
    const score = buildCommodityScore({
      symbol,
      closes,
      currentPrice: closes.at(-1)!,
      historyAsOf: "2026-10-30",
      now: DEFAULT_NOW,
    });
    assert.ok(score, `${symbol} should have a validated price-history score`);
    const card = buildCommodityIntelligenceScorecard(symbol, score);
    assert.ok(card);
    assert.deepEqual(card.categories.map((category) => category.id), [
      "technical-momentum",
      "fundamentals",
      "supply-demand",
      "market-environment",
      "risk-volatility",
    ]);
    assert.equal(card.categories.reduce((sum, category) => sum + category.weight, 0), 100);
    assert.equal(card.categories.find((category) => category.id === "fundamentals")?.score, null);
    assert.equal(card.categories.find((category) => category.id === "technical-momentum")?.score,
      score.factors.find((factor) => factor.key === "price-trend")?.score);
    assert.equal(card.categories.find((category) => category.id === "supply-demand")?.score, null);
    assert.equal(card.categories.find((category) => category.id === "market-environment")?.score, null);
    assert.equal(card.categories.find((category) => category.id === "risk-volatility")?.score,
      Math.round(Math.max(0, 100 - score.annualizedVolatilityPercent / 1.5)));
    assert.equal(card.coverageStatus, "insufficient");
    assert.ok(card.missingCategories.includes("Fundamental conditions"));
    assert.ok(card.score >= 0 && card.score <= 100);
    const technical = card.categories.find((category) => category.id === "technical-momentum")!;
    const risk = card.categories.find((category) => category.id === "risk-volatility")!;
    const missingAdjustedExpected = Math.round(50
      + ((technical.score! - 50) * technical.weight
        + Math.min(0, risk.score! - 50) * risk.weight) / 100);
    assert.equal(card.score, missingAdjustedExpected,
      "unavailable category weights stay neutral instead of being redistributed");
  }
  assert.notEqual(
    COMMODITY_INTELLIGENCE_WEIGHTS.metals["technical-momentum"],
    COMMODITY_INTELLIGENCE_WEIGHTS.energy["technical-momentum"],
  );
  assert.equal(buildCommodityIntelligenceScorecard("UNKNOWN", {} as never), null);
});

test("official commodity evidence fills only its matching scorecard category", () => {
  const score = buildCommodityScore({
    symbol: "CL=F",
    closes: closesWithDailyChange(Array.from({ length: 252 }, () => 0.001)),
    currentPrice: 150,
    historyAsOf: "2026-10-30",
    now: DEFAULT_NOW,
    marketEvidence: {
      inventory: {
        provider: "EIA",
        symbol: "CL=F",
        instrument: "Crude Oil",
        metric: "weekly-stock-change-percent",
        value: -1,
        asOf: "2026-10-30",
        units: "million barrels",
        source: {
          title: "EIA Weekly Petroleum Status Report",
          url: "https://ir.eia.gov/wpsr/table4.csv",
          asOf: "2026-10-30",
          unit: "million barrels",
          observation: "Commercial crude stocks fell week over week.",
        },
      },
      positioning: null,
    },
  });
  assert.ok(score);
  const card = buildCommodityIntelligenceScorecard("CL=F", score);
  assert.ok(card);
  const supply = card.categories.find((category) => category.id === "supply-demand");
  assert.equal(supply?.classification, "bullish");
  assert.equal(supply?.sources[0]?.title, "EIA Weekly Petroleum Status Report");
  assert.equal(supply?.score, score.factors.find((factor) => factor.key === "physical-balance")?.score);
  assert.equal(card.coverageStatus, "partial");
});

test("commodity volatility can lower but never raise the intelligence score", () => {
  const score = buildCommodityScore({
    symbol: "GC=F",
    closes: closesWithDailyChange(Array.from({ length: 252 }, () => 0.001)),
    currentPrice: 150,
    historyAsOf: "2026-10-30",
    now: DEFAULT_NOW,
  });
  assert.ok(score);
  const lowRisk = buildCommodityIntelligenceScorecard("GC=F", {
    ...score,
    annualizedVolatilityPercent: 5,
  });
  const highRisk = buildCommodityIntelligenceScorecard("GC=F", {
    ...score,
    annualizedVolatilityPercent: 120,
  });
  assert.ok(lowRisk && highRisk);
  assert.ok(highRisk.score <= lowRisk.score);
  assert.equal(lowRisk.positiveContributors.includes("Risk and volatility"), false);
  assert.ok(highRisk.negativeContributors.includes("Risk and volatility"));
});

test("weekends and exchange holidays do not make continuous futures history stale", () => {
  const holidayDates = ["2026-11-26"];
  const historyDates = fixtureHistoryDates(40, "2026-11-25", holidayDates);
  const input = {
    symbol: "GC=F",
    closes: Array(40).fill(100),
    currentPrice: 100,
    historyAsOf: "2026-11-25",
    historyDates,
    historySessions: fixtureSessions(historyDates[0]!, "2026-11-26", holidayDates),
    now: new Date("2026-11-26T12:00:00.000Z"),
  };
  const holidayResult = buildCommodityScore(input);
  assert.ok(holidayResult);
  assert.equal(holidayResult.historyAsOf, "2026-11-25");

  const fridayDates = fixtureHistoryDates(40, "2026-11-27");
  const weekendResult = buildCommodityScore({
    symbol: "GC=F",
    closes: Array(40).fill(100),
    currentPrice: 100,
    historyAsOf: "2026-11-27",
    historyDates: fridayDates,
    historySessions: fixtureSessions(fridayDates[0]!, "2026-11-28"),
    now: new Date("2026-11-28T12:00:00.000Z"),
  });
  assert.ok(weekendResult);
});

test("stale commodity bars and substantial session gaps cannot produce scores", () => {
  const staleDates = fixtureHistoryDates(40, "2026-11-23");
  const staleInput = {
    symbol: "CL=F",
    closes: Array(40).fill(100),
    currentPrice: 100,
    historyAsOf: "2026-11-23",
    historyDates: staleDates,
    historySessions: fixtureSessions(staleDates[0]!, "2026-12-01", ["2026-11-26"]),
    now: new Date("2026-12-01T12:00:00.000Z"),
  };
  const staleAssessment = assessCommodityHistory(staleInput);
  assert.equal(staleAssessment.status, "unavailable");
  if (staleAssessment.status === "unavailable") {
    assert.equal(staleAssessment.lastUsableDate, "2026-11-23");
    assert.match(staleAssessment.reason, /stale/i);
  }
  assert.equal(buildCommodityScore(staleInput), null);

  const completeDates = fixtureHistoryDates(60, "2026-10-30");
  const gapDates = completeDates.filter((_, index) => index < 25 || index > 31);
  const gapInput = {
    symbol: "CL=F",
    closes: Array(gapDates.length).fill(100),
    currentPrice: 100,
    historyAsOf: gapDates.at(-1)!,
    historyDates: gapDates,
    historySessions: fixtureSessions(completeDates[0]!, "2026-10-30"),
    now: new Date("2026-10-31T12:00:00.000Z"),
  };
  const gapAssessment = assessCommodityHistory(gapInput);
  assert.equal(gapAssessment.status, "unavailable");
  if (gapAssessment.status === "unavailable") {
    assert.equal(gapAssessment.lastUsableDate, "2026-10-30");
    assert.match(gapAssessment.reason, /gap of 7 expected trading sessions/i);
  }
  assert.equal(buildCommodityScore(gapInput), null);
});

test("valid continuous futures history still receives a score", () => {
  const historyDates = fixtureHistoryDates(60, "2026-10-30");
  const input = {
    symbol: "GC=F",
    closes: closesWithDailyChange(Array(59).fill(0.001)),
    currentPrice: 106,
    historyAsOf: "2026-10-30",
    historyDates,
    historySessions: fixtureSessions(historyDates[0]!, "2026-10-31"),
    now: new Date("2026-10-31T12:00:00.000Z"),
  };
  assert.ok(buildCommodityScore(input));
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
