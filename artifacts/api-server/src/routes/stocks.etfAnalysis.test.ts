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

async function requestEtfAnalysis(
  etfProfile: Record<string, unknown>,
  includeCommentary = true,
) {
  let completionCalls = 0;
  const app = express();
  app.use(express.json());
  app.post("/stocks/analyze", async (req, res) => {
    await respondWithEtfAnalysis(res, quote, {
      fetchEtfInfo: async () => ({ averageVolume3Month: 900_000, etfProfile }),
      createCompletion: async () => {
        completionCalls += 1;
        return JSON.stringify({
          analysis: "Provider-backed fund overview.",
          risks: ["Market volatility"],
          strengths: ["Broad exposure"],
        });
      },
      now: () => new Date(fixedAsOf),
    }, { includeCommentary: req.body.includeCommentary !== false });
  });

  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/stocks/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ symbol: "VUG", includeCommentary }),
    });
    return {
      status: response.status,
      body: await response.json(),
      completionCalls,
    };
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
  assert.equal(result.completionCalls, 1);
  const body = result.body as {
    etfAnalysis: {
      analysis: string;
      peerExpenseComparison: Record<string, unknown> | null;
      peerAssetSizeComparison: Record<string, unknown> | null;
    };
  };
  assert.equal(body.etfAnalysis.analysis, "Provider-backed fund overview.");
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

test("ETF comparison response skips AI commentary and retains sourced fund facts", async () => {
  const result = await requestEtfAnalysis({
    fundCategory: "Large Growth",
    expenseRatio: 0.0004,
    totalAssets: 120_000_000_000,
    benchmark: { symbol: "VUG.BM", name: "Growth Index" },
    trackingComparison: {
      periodStart: "2020-01-01",
      periodEnd: "2025-12-31",
      monthlySamples: 72,
      fundAnnualizedReturn: 0.12,
      benchmarkAnnualizedReturn: 0.119,
      trackingDifference: 0.001,
      trackingError: 0.002,
    },
    peerExpenseComparison: {
      category: "Large Growth",
      fundExpenseRatio: 0.0004,
      categoryAverageExpenseRatio: 0.006,
      difference: -0.0056,
      sampleSize: 42,
      sampleContext: "Provider-reported category sample",
    },
    peerAssetSizeComparison: {
      category: "Large Growth",
      fundTotalAssets: 120_000_000_000,
      categoryAverageTotalAssets: 32_000_000_000,
      difference: 88_000_000_000,
      sampleSize: null,
      sampleContext: "Provider-defined average; sample size not reported",
    },
  }, false);

  assert.equal(result.status, 200);
  assert.equal(result.completionCalls, 0);
  const body = result.body as {
    etfAnalysis: {
      fundCategory: string;
      expenseRatio: number;
      totalAssets: number;
      annualizedReturn: number | null;
      annualizedVolatility: number | null;
      benchmark: { source: string; asOf: string } | null;
      trackingComparison: {
        trackingError: number;
        source: string;
        asOf: string;
      } | null;
      peerExpenseComparison: { sampleContext: string; source: string; asOf: string } | null;
      peerAssetSizeComparison: { sampleContext: string; source: string; asOf: string } | null;
      analysis: string;
      risks: string[];
      strengths: string[];
    };
  };
  assert.equal(body.etfAnalysis.fundCategory, "Large Growth");
  assert.equal(body.etfAnalysis.expenseRatio, 0.0004);
  assert.equal(body.etfAnalysis.totalAssets, 120_000_000_000);
  assert.ok(typeof body.etfAnalysis.annualizedReturn === "number");
  assert.ok(typeof body.etfAnalysis.annualizedVolatility === "number");
  assert.equal(body.etfAnalysis.benchmark?.source, "Yahoo Finance");
  assert.equal(body.etfAnalysis.benchmark?.asOf, fixedAsOf);
  assert.equal(body.etfAnalysis.trackingComparison?.trackingError, 0.002);
  assert.equal(body.etfAnalysis.trackingComparison?.source, "Yahoo Finance");
  assert.equal(body.etfAnalysis.trackingComparison?.asOf, fixedAsOf);
  assert.equal(body.etfAnalysis.peerExpenseComparison?.sampleContext, "Provider-reported category sample");
  assert.equal(body.etfAnalysis.peerExpenseComparison?.source, "Yahoo Finance");
  assert.equal(body.etfAnalysis.peerExpenseComparison?.asOf, fixedAsOf);
  assert.equal(body.etfAnalysis.peerAssetSizeComparison?.sampleContext, "Provider-defined average; sample size not reported");
  assert.equal(body.etfAnalysis.peerAssetSizeComparison?.source, "Yahoo Finance");
  assert.equal(body.etfAnalysis.peerAssetSizeComparison?.asOf, fixedAsOf);
  assert.equal(body.etfAnalysis.analysis, "");
  assert.deepEqual(body.etfAnalysis.risks, []);
  assert.deepEqual(body.etfAnalysis.strengths, []);
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

test("ETF analysis response treats invalid expense ratios as unavailable", async () => {
  const invalidFees = [-0.01, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];

  for (const expenseRatio of invalidFees) {
    let completionPrompt = "";
    const app = express();
    app.use(express.json());
    app.post("/stocks/analyze", async (_req, res) => {
      await respondWithEtfAnalysis(res, quote, {
        fetchEtfInfo: async () => ({
          etfProfile: {
            expenseRatio,
            marketRegime: {
              periods: {
                bear: { averageAnnualReturn: 0.02, years: 2 },
                bull: { averageAnnualReturn: 0.1, years: 2 },
              },
            },
          },
        }),
        createCompletion: async (prompt) => {
          completionPrompt = prompt;
          return JSON.stringify({ analysis: "Overview." });
        },
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
      const body = await response.json() as {
        etfAnalysis: {
          expenseRatio: number | null;
          scenarios: {
            annualReturnAssumption: number | null;
            noFeeAnnualReturnAssumption: number | null;
            fiveYearValue: number | null;
            noFeeFiveYearValue: number | null;
            assumption: string;
          }[];
        };
      };

      assert.equal(response.status, 200);
      assert.equal(body.etfAnalysis.expenseRatio, null);
      assert.equal(body.etfAnalysis.scenarios[2]?.annualReturnAssumption, null);
      assert.equal(body.etfAnalysis.scenarios[2]?.noFeeAnnualReturnAssumption, 0.1);
      assert.equal(body.etfAnalysis.scenarios[2]?.fiveYearValue, null);
      assert.equal(body.etfAnalysis.scenarios[2]?.noFeeFiveYearValue, 644.2);
      assert.equal(body.etfAnalysis.scenarios.some((scenario) => /expense ratio was not reported/.test(scenario.assumption)), true);
      assert.match(completionPrompt, /Expense ratio: unavailable/);
    } finally {
      server.close();
      await once(server, "close");
    }
  }
});

test("ETF analysis response preserves valid expense ratio values", async () => {
  for (const expenseRatio of [0, 0.01]) {
    const result = await requestEtfAnalysis({
      expenseRatio,
      marketRegime: {
        periods: {
          bear: { averageAnnualReturn: 0.02, years: 2 },
          bull: { averageAnnualReturn: 0.1, years: 2 },
        },
      },
    });
    const body = result.body as {
      etfAnalysis: {
        expenseRatio: number | null;
        scenarios: {
          annualReturnAssumption: number | null;
          noFeeAnnualReturnAssumption: number | null;
          noFeeFiveYearValue: number | null;
          assumption: string;
        }[];
      };
    };

    assert.equal(result.status, 200);
    assert.equal(body.etfAnalysis.expenseRatio, expenseRatio);
    assert.equal(body.etfAnalysis.scenarios[2]?.annualReturnAssumption, 0.1 - expenseRatio);
    assert.equal(body.etfAnalysis.scenarios[2]?.noFeeAnnualReturnAssumption, 0.1);
    assert.equal(body.etfAnalysis.scenarios[2]?.noFeeFiveYearValue, 644.2);
    assert.match(body.etfAnalysis.scenarios[2]?.assumption ?? "", /subtracts the reported expense ratio/);
  }
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
