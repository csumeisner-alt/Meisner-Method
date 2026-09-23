import test from "node:test";
import assert from "node:assert/strict";
import { runSmokeCheck, validateAnalysisResponse } from "./smoke-test-analysis.mjs";

const fallbackReasoning =
  "The AI explanation was unavailable, so this analysis is based on the rules-based technical, fundamental, and behavioral scores shown above.";

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