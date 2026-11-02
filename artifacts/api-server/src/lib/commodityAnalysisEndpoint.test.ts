import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import test from "node:test";
import {
  CFTC_INSTRUMENTS,
  unavailableCommodityNews,
  type CommodityInventoryEvidence,
  type CommodityPositioningEvidence,
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
  fetchInventory: () => Promise<CommodityInventoryEvidence | null>,
  fetchPositioning: () => Promise<CommodityPositioningEvidence | null>,
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
          return failedInventory ? badInventory : inventoryEvidence(symbol);
        },
        async () => {
          if (!failedInventory && failure === "timeout") throw new Error("CFTC request timed out");
          return failedInventory ? positioningEvidence(symbol) : badPositioning;
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
