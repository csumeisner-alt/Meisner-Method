import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCommodityScore,
  parseCommodityNewsSources,
} from "./commodityAnalysis.ts";

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
