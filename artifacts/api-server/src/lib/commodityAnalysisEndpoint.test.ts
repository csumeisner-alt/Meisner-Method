import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import test from "node:test";
import {
  buildCommodityScore,
  COMMODITY_ANALYSIS_GUIDES,
  CFTC_INSTRUMENTS,
  unavailableCommodityNews,
  type CommodityEventCalendar,
  type CommodityInventoryEvidence,
  type CommodityEvidenceFetchResult,
  type CommodityPositioningEvidence,
  type CommoditySupplyDemandContext,
} from "./commodityAnalysis.ts";
import { respondWithCommodityAnalysis } from "./commodityAnalysisEndpoint.ts";

const NOW = new Date("2026-11-02T12:00:00.000Z");
const HISTORY_END = "2026-10-30";
const EIA_URL = "https://ir.eia.gov/wpsr/table4.csv";
const CFTC_URL = "https://publicreportinghub.cftc.gov/Commitments-of-Traders/Legacy-Futures-Only/6dca-aqww";
const USDA_URL = "https://www.usda.gov/sites/default/files/documents/oce-wasde-report-data-2026-10.csv";

function weekdaysBefore(end: string, count: number): string[] {
  const dates: string[] = [];
  let timestamp = Date.parse(`${end}T00:00:00.000Z`);
  while (dates.length < count) {
    const date = new Date(timestamp).toISOString().slice(0, 10);
    const day = new Date(timestamp).getUTCDay();
    if (day !== 0 && day !== 6) dates.push(date);
    timestamp -= 86_400_000;
  }
  return dates.reverse();
}

const historyDates = weekdaysBefore(HISTORY_END, 260);
const historySessions = [...historyDates, "2026-11-02"];
const closes = Array.from({ length: historyDates.length }, (_, index) => 100 * Math.exp(index * 0.001));

function inventoryEvidence(symbol: "CL=F" | "ZC=F", asOf = HISTORY_END): CommodityInventoryEvidence {
  const isEia = symbol === "CL=F";
  return {
    provider: isEia ? "EIA" : "USDA",
    symbol,
    instrument: isEia ? "Crude Oil" : "Corn",
    metric: isEia
      ? "weekly-stock-change-percent"
      : "year-over-year-stocks-to-use-change-percent",
    value: -3,
    asOf,
    units: isEia ? "million barrels" : "percent of total use",
    source: {
      title: isEia ? "EIA Weekly Petroleum Status Report" : "USDA WASDE",
      url: isEia ? EIA_URL : USDA_URL,
      asOf,
      unit: isEia ? "million barrels" : "million bushels",
      observation: "Official dated inventory observation.",
    },
    publishedObservations: isEia ? [
      { reportingPeriod: asOf, value: 400, units: "million barrels" },
      { reportingPeriod: "2026-10-23", value: 410, units: "million barrels" },
    ] : undefined,
  };
}

function positioningEvidence(symbol: string, asOf = "2026-10-27"): CommodityPositioningEvidence {
  const contract = CFTC_INSTRUMENTS[symbol]!;
  return {
    provider: "CFTC",
    symbol,
    instrument: contract.name,
    contractCode: contract.code,
    units: contract.unit,
    asOf,
    openInterest: 100_000,
    nonCommercialLong: 40_000,
    nonCommercialShort: 20_000,
    source: {
      title: "CFTC Commitments of Traders",
      url: CFTC_URL,
      asOf,
      unit: "contracts",
      observation: "Official futures-only positioning observation.",
    },
  };
}

function malformed<T>(value: object): T {
  return value as T;
}

async function requestCommodityAnalysis(
  symbol: "CL=F" | "ZC=F",
  fetchInventory: () => Promise<CommodityEvidenceFetchResult<CommodityInventoryEvidence>>,
  fetchPositioning: () => Promise<CommodityEvidenceFetchResult<CommodityPositioningEvidence>>,
) {
  const app = express();
  app.use(express.json());
  app.post("/stocks/analyze", async (_req, res) => {
    await respondWithCommodityAnalysis(res, {
      symbol,
      exchange: "COMEX",
      currency: "USD",
      currentPrice: closes.at(-1)!,
      priceChange: 0.1,
      priceChangePercent: 0.1,
      priceTimestamp: Date.parse("2026-11-02T11:58:00.000Z") / 1_000,
      volume: 1_000,
      week52High: closes.at(-1)!,
      week52Low: closes[0]!,
      closes,
      historyDates,
      historySessions,
      historyAsOf: HISTORY_END,
    }, {
      fetchInventory,
      fetchPositioning,
      fetchNews: async () => unavailableCommodityNews(),
      createCompletion: async () => {
        throw new Error("Commentary is disabled for this test.");
      },
      now: () => NOW,
    }, { includeCommentary: false });
  });

  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/stocks/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ symbol, includeCommentary: false }),
    });
    return { status: response.status, body: await response.json() };
  } finally {
    server.close();
    await once(server, "close");
  }
}

const failedFeedCases = [
  { provider: "EIA", symbol: "CL=F", failedFactor: "physical-balance", unaffectedFactor: "positioning" },
  { provider: "USDA", symbol: "ZC=F", failedFactor: "physical-balance", unaffectedFactor: "positioning" },
  { provider: "CFTC", symbol: "CL=F", failedFactor: "positioning", unaffectedFactor: "physical-balance" },
] as const;

async function requestFullCommodityAnalysis(
  symbol: string,
  createCompletion: (prompt: string) => Promise<string>,
  fetchNews: () => Promise<ReturnType<typeof unavailableCommodityNews>>,
  research: {
    fetchInventory?: CommodityInventoryEvidence;
    fetchEvents?: () => Promise<CommodityEventCalendar>;
    fetchSupplyDemand?: () => Promise<CommoditySupplyDemandContext>;
  } = {},
) {
  const app = express();
  app.use(express.json());
  app.post("/stocks/analyze", async (_req, res) => {
    await respondWithCommodityAnalysis(res, {
      symbol,
      exchange: "COMEX",
      currency: "USD",
      currentPrice: closes.at(-1)!,
      priceChange: 0.1,
      priceChangePercent: 0.1,
      priceTimestamp: Date.parse("2026-11-02T11:58:00.000Z") / 1_000,
      volume: 1_000,
      week52High: closes.at(-1)!,
      week52Low: closes[0]!,
      closes,
      historyDates,
      historySessions,
      historyAsOf: HISTORY_END,
    }, {
      fetchInventory: async () => ({ evidence: research.fetchInventory ?? null, failure: null }),
      fetchPositioning: async () => ({ evidence: null, failure: null }),
      fetchNews,
      fetchEvents: research.fetchEvents ? async () => research.fetchEvents!() : undefined,
      fetchSupplyDemand: research.fetchSupplyDemand
        ? async () => research.fetchSupplyDemand!()
        : undefined,
      createCompletion,
      now: () => NOW,
    });
  });
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/stocks/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ symbol }),
    });
    return { status: response.status, body: await response.json() as Record<string, any> };
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("commodity endpoint returns only matching verified calendar and supply evidence to the UI and AI", async () => {
  let prompt = "";
  const result = await requestFullCommodityAnalysis(
    "CL=F",
    async (input) => {
      prompt = input;
      return commentaryJson(COMMODITY_ANALYSIS_GUIDES["CL=F"]!.monitorNext);
    },
    async () => unavailableCommodityNews(),
    {
      fetchEvents: async () => ({
        status: "partial",
        checkedAt: NOW.toISOString(),
        events: [{
          id: "bls-cpi-2026-11-12",
          name: "U.S. Consumer Price Index release",
          eventDate: "2026-11-12",
          time: "08:30 AM",
          timezone: "ET",
          status: "upcoming",
          affectedCommodities: ["Crude Oil"],
          source: {
            title: "U.S. Bureau of Labor Statistics CPI release schedule",
            url: "https://www.bls.gov/schedule/news_release/cpi.htm",
            publicationDate: null,
          },
          values: { previous: null, consensus: null, actual: null },
        }],
        unavailable: ["OPEC+ meeting dates unavailable unless officially confirmed."],
      }),
      fetchSupplyDemand: async () => ({
        status: "partial",
        commodity: "Crude Oil",
        series: [{
          id: "inventory",
          label: "U.S. commercial crude inventory",
          status: "available",
          units: "million barrels",
          points: [{
            commodity: "Crude Oil",
            value: 400,
            units: "million barrels",
            reportingPeriod: "2026-10-30",
            publicationDate: "2026-11-02",
            source: { title: "EIA Weekly Petroleum Status Report", url: EIA_URL },
          }],
          historicalAverage: null,
          historicalAveragePeriod: null,
          reason: null,
        }],
      }),
    },
  );
  assert.equal(result.status, 200);
  assert.equal(
    result.body.priceTimestamp,
    Date.parse("2026-11-02T11:58:00.000Z") / 1_000,
  );
  const analysis = result.body.commodityAnalysis;
  assert.equal(analysis.eventCalendar.events[0].status, "upcoming");
  assert.equal(analysis.eventCalendar.events[0].values.consensus, null);
  assert.equal(analysis.supplyDemand.series.find((item: { id: string }) => item.id === "inventory").points[0].publicationDate, "2026-11-02");
  assert.equal(analysis.supplyDemand.series.find((item: { id: string }) => item.id === "production").status, "unavailable");
  assert.ok(prompt.includes("U.S. Consumer Price Index release"));
  assert.ok(prompt.includes("400 million barrels for 2026-10-30"));
});

test("completed EIA events show previous and actual values only from matching published observations", async () => {
  const result = await requestFullCommodityAnalysis(
    "CL=F",
    async () => commentaryJson(COMMODITY_ANALYSIS_GUIDES["CL=F"]!.monitorNext),
    async () => unavailableCommodityNews(),
    {
      fetchInventory: inventoryEvidence("CL=F"),
      fetchEvents: async () => ({
        status: "available",
        checkedAt: NOW.toISOString(),
        events: [{
          id: "eia-wpsr-2026-11-01",
          name: "EIA Weekly Petroleum Status Report",
          eventDate: "2026-11-01",
          time: null,
          timezone: null,
          status: "completed",
          affectedCommodities: ["Crude Oil"],
          source: {
            title: "EIA Weekly Petroleum Status Report",
            url: "https://www.eia.gov/petroleum/supply/weekly/",
            publicationDate: null,
          },
          values: { previous: null, consensus: null, actual: null },
        }],
        unavailable: [],
      }),
    },
  );
  assert.equal(result.status, 200);
  const event = result.body.commodityAnalysis.eventCalendar.events[0];
  assert.deepEqual(event.values.previous, { value: 410, units: "million barrels" });
  assert.deepEqual(event.values.consensus, null);
  assert.deepEqual(event.values.actual, { value: 400, units: "million barrels" });
  assert.equal(event.source.publicationDate, "2026-11-01");
});

function commentaryJson(monitorNext: string[], includeNews = false) {
  const evidenceIds = includeNews ? ["price-history", "news-1"] : ["price-history"];
  return JSON.stringify({
    currentDrivers: [{ text: "The dated price trend is positive.", evidenceIds }],
    strongestBullishFactors: [{ text: "The supplied trend supports the bullish side.", evidenceIds: ["price-history"] }],
    strongestBearishFactors: [],
    technicalAlignment: { text: "The technical trend is positive over the measured window.", evidenceIds: ["price-history"] },
    upcomingCatalysts: includeNews
      ? [{ text: "A recent dated report describes a current supply development.", evidenceIds: ["news-1"] }]
      : [],
    risks: [],
    monitorNext,
  });
}

test("commodity analysis HTTP endpoint keeps valid factors when official feeds fail or return invalid data", async () => {
  for (const feed of failedFeedCases) {
    for (const failure of ["timeout", "malformed", "stale"] as const) {
      const failedInventory = feed.failedFactor === "physical-balance";
      const symbol = feed.symbol;
      const badInventory = failure === "stale"
        ? inventoryEvidence(symbol, "2026-01-01")
        : malformed<CommodityInventoryEvidence>({
          provider: feed.provider,
          symbol,
          instrument: symbol === "CL=F" ? "Crude Oil" : "Corn",
          metric: symbol === "CL=F" ? "weekly-stock-change-percent" : "year-over-year-stocks-to-use-change-percent",
          value: -3,
          asOf: HISTORY_END,
          units: symbol === "CL=F" ? "million barrels" : "percent of total use",
          source: {
            title: "Malformed provider response",
            url: feed.provider === "EIA" ? EIA_URL : USDA_URL,
            asOf: HISTORY_END,
            unit: "unknown",
          },
        });
      const badPositioning = failure === "stale"
        ? positioningEvidence(symbol, "2026-01-01")
        : malformed<CommodityPositioningEvidence>({
          provider: "CFTC",
          symbol,
          instrument: CFTC_INSTRUMENTS[symbol].name,
          contractCode: CFTC_INSTRUMENTS[symbol].code,
          units: CFTC_INSTRUMENTS[symbol].unit,
          asOf: HISTORY_END,
          openInterest: 100_000,
          nonCommercialLong: 40_000,
          nonCommercialShort: 20_000,
        });

      const result = await requestCommodityAnalysis(
        symbol,
        async () => {
          if (failedInventory && failure === "timeout") throw new Error(`${feed.provider} request timed out`);
          return failedInventory
            ? { evidence: failure === "stale" ? null : badInventory, failure: { provider: feed.provider, state: failure === "stale" ? "stale" : "invalid" } }
            : { evidence: inventoryEvidence(symbol), failure: null };
        },
        async () => {
          if (!failedInventory && failure === "timeout") throw new Error("CFTC request timed out");
          return failedInventory
            ? { evidence: positioningEvidence(symbol), failure: null }
            : {
              evidence: failure === "stale" ? null : badPositioning,
              failure: { provider: "CFTC", state: failure === "stale" ? "stale" : "invalid" },
            };
        },
      );

      assert.equal(result.status, 200, `${feed.provider} ${failure} must not fail commodity scoring`);
      const body = result.body as {
        assetType: string;
        commodityAnalysis: {
          score: number;
          dataCoveragePercent: number;
          factors: Array<{
            key: string;
            status: string;
            score: number | null;
            detail: string;
            sources: Array<{ url: string }>;
          }>;
        };
      };
      assert.equal(body.assetType, "commodity");
      assert.ok(Number.isFinite(body.commodityAnalysis.score));
      assert.equal(body.commodityAnalysis.dataCoveragePercent, 50);

      const failedFactor = body.commodityAnalysis.factors.find((factor) => factor.key === feed.failedFactor);
      const unaffectedFactor = body.commodityAnalysis.factors.find((factor) => factor.key === feed.unaffectedFactor);
      assert.ok(failedFactor);
      assert.equal(failedFactor.status, "unavailable", `${feed.provider} ${failure} cannot be treated as evidence`);
      assert.equal(failedFactor.score, null);
      assert.deepEqual(failedFactor.sources, []);
      assert.match(failedFactor.detail, new RegExp(feed.provider));
      assert.match(
        failedFactor.detail,
        failure === "stale" ? /stale/ : /unavailable/,
      );
      assert.ok(unaffectedFactor);
      assert.equal(unaffectedFactor.status, "available");
      assert.equal(unaffectedFactor.sources.length, 1);
      assert.ok(
        unaffectedFactor.sources[0]!.url === EIA_URL
          || unaffectedFactor.sources[0]!.url === USDA_URL
          || unaffectedFactor.sources[0]!.url === CFTC_URL,
      );
      assert.equal(
        body.commodityAnalysis.factors.find((factor) => factor.key === "price-trend")?.status,
        "available",
      );
    }
  }
});

test("commodity analysis returns distinct family context, dated evidence, and unchanged score inputs", async () => {
  const symbols = ["GC=F", "SI=F", "CL=F", "NG=F", "HG=F", "ZC=F"];
  const guideSignatures = new Set<string>();
  for (const symbol of symbols) {
    const guide = COMMODITY_ANALYSIS_GUIDES[symbol]!;
    const result = await requestFullCommodityAnalysis(
      symbol,
      async (prompt) => {
        assert.ok(prompt.includes(guide.unavailable[0]!));
        assert.ok(prompt.includes(HISTORY_END));
        return commentaryJson(guide.monitorNext);
      },
      async () => unavailableCommodityNews(),
    );
    assert.equal(result.status, 200);
    const analysis = result.body.commodityAnalysis;
    guideSignatures.add(guide.focus.join("|"));
    assert.deepEqual(analysis.analysisGuide, guide);
    assert.equal(analysis.commentary.status, "available");
    assert.ok(analysis.commentary.technicalAlignment.evidenceIds.includes("price-history"));
    assert.equal(analysis.verifiedEvidence.find((item: { id: string }) => item.id === "price-history")?.asOf, HISTORY_END);
    assert.ok(analysis.verifiedEvidence.every((item: { asOf: string; url: string }) => item.asOf && item.url.startsWith("https://")));

    const expected = buildCommodityScore({
      symbol,
      closes,
      historyDates,
      historySessions,
      currentPrice: closes.at(-1)!,
      historyAsOf: HISTORY_END,
      now: NOW,
      marketEvidence: { inventory: null, positioning: null },
    });
    assert.ok(expected);
    assert.equal(analysis.score, expected.score);
      assert.equal(analysis.intelligenceScorecard.version, 1);
      assert.equal(analysis.intelligenceScorecard.categories.length, 5);
      assert.ok(["complete", "partial", "insufficient"].includes(
        analysis.intelligenceScorecard.coverageStatus,
      ));
      assert.ok(analysis.intelligenceScorecard.methodology.includes("not a prediction"));
    assert.equal(analysis.annualizedVolatilityPercent, expected.annualizedVolatilityPercent);
    assert.equal(analysis.oneMonthReturnPercent, expected.oneMonthReturnPercent);
    assert.equal(analysis.threeMonthReturnPercent, expected.threeMonthReturnPercent);
    assert.equal(analysis.sixMonthReturnPercent, expected.sixMonthReturnPercent);
    assert.deepEqual(analysis.factors, expected.factors);
  }
  assert.equal(guideSignatures.size, symbols.length);
});

test("current news is not treated as an upcoming catalyst without a dated event, and AI failure preserves the score", async () => {
  const news = async () => ({
    status: "available" as const,
    summary: "A recent source reports a current supply development.",
    retrievedAt: "2026-11-02T11:45:00.000Z",
    sources: [{
      title: "Current oil market report",
      url: "https://example.com/oil-report",
      publishedAt: "2026-11-01T08:00:00.000Z",
    }],
  });
  const currentCatalyst = await requestFullCommodityAnalysis(
    "CL=F",
    async () => commentaryJson(COMMODITY_ANALYSIS_GUIDES["CL=F"]!.monitorNext, true),
    news,
  );
  assert.equal(currentCatalyst.status, 200);
  assert.equal(currentCatalyst.body.commodityAnalysis.newsContext.status, "available");
  assert.equal(currentCatalyst.body.commodityAnalysis.commentary.status, "unavailable");
  assert.equal(
    currentCatalyst.body.commodityAnalysis.verifiedEvidence.some((item: { id: string }) => item.id.startsWith("news-")),
    false,
  );

  const failedAi = await requestFullCommodityAnalysis(
    "CL=F",
    async () => { throw new Error("AI unavailable"); },
    async () => unavailableCommodityNews(),
  );
  assert.equal(failedAi.status, 200);
  assert.equal(failedAi.body.commodityAnalysis.commentary.status, "unavailable");
  assert.ok(Number.isFinite(failedAi.body.commodityAnalysis.score));
  assert.equal(
    failedAi.body.commodityAnalysis.factors.find((factor: { key: string }) => factor.key === "price-trend")?.status,
    "available",
  );
});
