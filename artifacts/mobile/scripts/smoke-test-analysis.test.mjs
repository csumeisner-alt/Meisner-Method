import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runSmokeCheck, validateAnalysisResponse } from "./smoke-test-analysis.mjs";

const fallbackReasoning =
  "The AI explanation was unavailable, so this analysis is based on the rules-based technical, fundamental, and behavioral scores shown above.";
const etfAnalysisSource = readFileSync(
  new URL("../app/analysis/[symbol].tsx", import.meta.url),
  "utf8",
);

function validResponse(overrides = {}) {
  return {
    fundamental: { dividendYield: 0.0048, ...overrides.fundamental },
    recommendation: {
      action: "buy",
      reasoning: "The rules-based signals are constructive.",
      risks: ["Market volatility"],
      strengths: ["Positive trend"],
      ...overrides.recommendation,
    },
  };
}

test("accepts the published analysis contract with AI commentary", () => {
  assert.deepEqual(validateAnalysisResponse(validResponse()), {
    action: "buy",
    dividendYield: 0.0048,
    commentary: "AI commentary",
  });
});

test("accepts the deterministic commentary fallback", () => {
  assert.deepEqual(
    validateAnalysisResponse(
      validResponse({
        recommendation: {
          reasoning: fallbackReasoning,
          risks: [],
          strengths: [],
        },
      }),
    ),
    {
      action: "buy",
      dividendYield: 0.0048,
      commentary: "deterministic fallback",
    },
  );
});

test("rejects a missing recommendation action", () => {
  assert.throws(
    () => validateAnalysisResponse(validResponse({ recommendation: { action: undefined } })),
    /recommendation\.action/,
  );
});

test("rejects a percent-scaled dividend yield", () => {
  assert.throws(
    () => validateAnalysisResponse(validResponse({ fundamental: { dividendYield: 4.8 } })),
    /between 0 and 1/,
  );
});

test("rejects a missing dividend yield", () => {
  const response = validResponse();
  delete response.fundamental.dividendYield;
  assert.throws(
    () => validateAnalysisResponse(response),
    /dividendYield is missing/,
  );
});

test("fails clearly when the published endpoint is not healthy", async () => {
  await assert.rejects(
    runSmokeCheck({
      endpoint: "https://published.example/api/stocks/analyze",
      fetchImpl: async () => ({
        status: 503,
        text: async () => '{"error":"temporarily unavailable"}',
      }),
    }),
    /returned HTTP 503: \{"error":"temporarily unavailable"\}/,
  );
});

test("fails clearly when a successful endpoint returns malformed JSON", async () => {
  await assert.rejects(
    runSmokeCheck({
      endpoint: "https://published.example/api/stocks/analyze",
      fetchImpl: async () => ({
        status: 200,
        text: async () => "not-json",
      }),
    }),
    /HTTP 200 but not valid JSON/,
  );
});

test("ETF comparison tickers persist, revalidate, and remain saved on provider failure", () => {
  assert.match(etfAnalysisSource, /AsyncStorage\.getItem\(ETF_COMPARISON_KEY\)/);
  assert.match(etfAnalysisSource, /AsyncStorage\.setItem\(ETF_COMPARISON_KEY/);
  assert.match(etfAnalysisSource, /parseHeatMapDetailStats\(response\)\?\.etfProfile/);
  assert.match(etfAnalysisSource, /else if \(failed\)/);
  assert.match(etfAnalysisSource, /It remains saved for retry/);
  assert.match(etfAnalysisSource, /removeCompareSymbol\(fundEntry\.symbol\)/);
});

test("ETF analysis displays the deterministic profile score and its limits", () => {
  assert.doesNotMatch(etfAnalysisSource, /Evaluates the fund as a portfolio of reported holdings/);
  assert.match(etfAnalysisSource, /calculateEtfResearchScore\(\{/);
  assert.match(etfAnalysisSource, /ETF PROFILE SCORE/);
  assert.match(etfAnalysisSource, /Missing components are excluded and remaining weights are rescaled/);
  assert.match(etfAnalysisSource, /Rules-based, not AI-generated or personalized advice/);
  assert.match(etfAnalysisSource, /component\.peerContext\.category/);
  assert.match(etfAnalysisSource, /component\.peerContext\.sampleContext/);
  assert.match(etfAnalysisSource, /component\.peerContext\.source/);
  assert.match(etfAnalysisSource, /sourceDate\(component\.peerContext\.asOf\)/);
});

test("ETF holding history is stored separately and shown without another comparison ticker", () => {
  const historyHeadingIndex = etfAnalysisSource.indexOf("Changes between provider snapshots");
  const comparisonResultsIndex = etfAnalysisSource.indexOf("{!!compareFunds.length && (");
  assert.match(etfAnalysisSource, /ETF_HOLDING_SNAPSHOTS_KEY = '@stocksense\/etf_holding_snapshots_v1'/);
  assert.match(etfAnalysisSource, /upsertSavedEtfHoldingSnapshot/);
  assert.match(etfAnalysisSource, /createEtfHoldingSnapshot/);
  assert.ok(historyHeadingIndex >= 0 && historyHeadingIndex < comparisonResultsIndex);
  assert.match(etfAnalysisSource, /retrieval times, not holdings report dates/);
});