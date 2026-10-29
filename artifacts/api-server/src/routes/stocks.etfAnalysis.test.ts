import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import test from "node:test";
import {
  respondWithEtfAnalysis,
  type EtfAnalysisQuote,
} from "../lib/etfAnalysisEndpoint.ts";

const fixedAsOf = "2026-10-29T12:34:56.000Z";
const quote: EtfAnalysisQuote = {
  symbol: "VUG",
  companyName: "Vanguard Growth ETF",
  exchange: "NYSE Arca",
  currency: "USD",
  currentPrice: 400,
  priceChange: 1,
  priceChangePercent: 0.25,
  volume: 1_000_000,
  marketCap: null,
  week52High: 420,
  week52Low: 300,
  closes: [100, 101, 102, 101, 103, 104, 105],
};

async function requestEtfAnalysis(etfProfile: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.post("/stocks/analyze", async (_req, res) => {
    await respondWithEtfAnalysis(res, quote, {
      fetchEtfInfo: async () => ({ averageVolume3Month: 900_000, etfProfile }),
      createCompletion: async () => JSON.stringify({
        analysis: "Provider-backed fund overview.",
        risks: ["Market volatility"],
        strengths: ["Broad exposure"],
      }),
      now: () => new Date(fixedAsOf),
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
      body: JSON.stringify({ symbol: "VUG" }),
    });
    return { status: response.status, body: await response.json() };
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("ETF analysis HTTP response preserves all provider peer metadata", async () => {
  const result = await requestEtfAnalysis({
    fundCategory: "Large Growth",
    peerExpenseComparison: {
      category: "Large Growth",
      fundExpenseRatio: 0.0004,
      categoryAverageExpenseRatio: 0.006,
      difference: -0.0056,
      sampleSize: null,
      sampleContext: "Provider-defined category average; sample size not reported",
    },
    peerAssetSizeComparison: {
      category: "Large Growth",
      fundTotalAssets: 120_000_000_000,
      categoryAverageTotalAssets: 32_000_000_000,
      difference: 88_000_000_000,
      sampleSize: null,
      sampleContext: "Provider-defined average total net assets; sample size not reported",
    },
  });

  assert.equal(result.status, 200);
  const body = result.body as {
    etfAnalysis: {
      peerExpenseComparison: Record<string, unknown> | null;
      peerAssetSizeComparison: Record<string, unknown> | null;
    };
  };
  assert.deepEqual(body.etfAnalysis.peerExpenseComparison, {
    category: "Large Growth",
    fundExpenseRatio: 0.0004,
    categoryAverageExpenseRatio: 0.006,
    difference: -0.0056,
    sampleSize: null,
    sampleContext: "Provider-defined category average; sample size not reported",
    source: "Yahoo Finance",
    asOf: fixedAsOf,
  });
  assert.deepEqual(body.etfAnalysis.peerAssetSizeComparison, {
    category: "Large Growth",
    fundTotalAssets: 120_000_000_000,
    categoryAverageTotalAssets: 32_000_000_000,
    difference: 88_000_000_000,
    sampleSize: null,
    sampleContext: "Provider-defined average total net assets; sample size not reported",
    source: "Yahoo Finance",
    asOf: fixedAsOf,
  });
});

test("ETF analysis HTTP response leaves unavailable peer data null", async () => {
  const result = await requestEtfAnalysis({
    fundCategory: "Large Growth",
    peerExpenseComparison: null,
    peerAssetSizeComparison: null,
  });

  assert.equal(result.status, 200);
  const body = result.body as {
    etfAnalysis: {
      peerExpenseComparison: unknown;
      peerAssetSizeComparison: unknown;
    };
  };
  assert.equal(body.etfAnalysis.peerExpenseComparison, null);
  assert.equal(body.etfAnalysis.peerAssetSizeComparison, null);
});

test("ETF analysis HTTP response preserves holdings and sector coverage context", async () => {
  const holdingsRetrievedAt = "2026-10-28T18:20:00.000Z";
  const sectorsRetrievedAt = "2026-10-28T18:21:00.000Z";
  const sectorWeights = [
    { sector: "Technology", weight: 0.42 },
    { sector: "Healthcare", weight: 0.16 },
  ];
  const result = await requestEtfAnalysis({
    topHoldings: [
      { symbol: "NVDA", name: "NVIDIA Corporation", weight: 0.08 },
      { symbol: "MSFT", name: "Microsoft Corporation", weight: 0.07 },
    ],
    topHoldingsReportedCount: 12,
    topHoldingsRetrievedAt: holdingsRetrievedAt,
    sectorWeights,
    sectorWeightsRetrievedAt: sectorsRetrievedAt,
  });

  assert.equal(result.status, 200);
  const body = result.body as {
    etfAnalysis: {
      topHoldings: { symbol: string; name: string; weight: number | null }[];
      topHoldingsReportedCount: number;
      topHoldingsRetrievedAt: string;
      sectorWeights: { sector: string; weight: number }[];
      sectorWeightsRetrievedAt: string;
    };
  };
  assert.deepEqual(body.etfAnalysis.topHoldings, [
    { symbol: "NVDA", name: "NVIDIA Corporation", weight: 0.08 },
    { symbol: "MSFT", name: "Microsoft Corporation", weight: 0.07 },
  ]);
  assert.equal(body.etfAnalysis.topHoldingsReportedCount, 12);
  assert.equal(body.etfAnalysis.topHoldingsRetrievedAt, holdingsRetrievedAt);
  assert.deepEqual(body.etfAnalysis.sectorWeights, sectorWeights);
  assert.equal(body.etfAnalysis.sectorWeightsRetrievedAt, sectorsRetrievedAt);
});

test("ETF analysis HTTP response uses its snapshot time when provider retrieval times are absent", async () => {
  const result = await requestEtfAnalysis({ topHoldings: [], sectorWeights: [] });

  assert.equal(result.status, 200);
  const body = result.body as {
    etfAnalysis: {
      topHoldingsRetrievedAt: string;
      sectorWeightsRetrievedAt: string;
      asOf: string;
    };
  };
  assert.equal(body.etfAnalysis.topHoldingsRetrievedAt, fixedAsOf);
  assert.equal(body.etfAnalysis.sectorWeightsRetrievedAt, fixedAsOf);
});
