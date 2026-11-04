import assert from "node:assert/strict";
import test from "node:test";
import {
  createCommodityScoreSnapshot,
  findComparableCommodityScoreChange,
  parseCommodityScoreSnapshots,
  upsertCommodityScoreSnapshot,
  type CommodityScoreCategoryInput,
} from "../commodityIntelligenceScore.ts";

const RECORDED_AT = "2026-11-03T12:00:00.000Z";
const categories: CommodityScoreCategoryInput[] = [
  {
    id: "technical-momentum",
    score: 65,
    sources: [{
      url: "https://finance.yahoo.com/quote/GC%3DF/history/",
      unit: "percent return",
      asOf: "2026-11-02",
    }],
  },
  {
    id: "risk-volatility",
    score: 80,
    sources: [{
      url: "https://finance.yahoo.com/quote/GC%3DF/history/",
      unit: "percent return",
      asOf: "2026-11-02",
    }],
  },
];

function snapshot(
  symbol: string,
  score: number,
  inputCategories = categories,
  recordedAt = RECORDED_AT,
) {
  const recordedDate = recordedAt.slice(0, 10);
  const recordingTime = Date.parse(recordedAt);
  const datedCategories = Number.isFinite(recordingTime)
    ? inputCategories.map((category) => ({
      ...category,
      sources: category.sources.map((source) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(source.asOf) || source.asOf <= recordedDate) return source;
        const priorDate = new Date(Date.parse(`${recordedDate}T00:00:00.000Z`) - 86_400_000)
          .toISOString().slice(0, 10);
        return { ...source, asOf: priorDate };
      }),
    }))
    : inputCategories;
  return createCommodityScoreSnapshot({
    symbol,
    score,
    scorecardVersion: 1,
    categories: datedCategories,
    recordedAt,
  });
}

test("commodity snapshots require genuine supported scores and fresh evidence", () => {
  assert.equal(snapshot("NOT-A-COMMODITY", 60), null);
  assert.equal(snapshot("GC=F", 60, categories, "invalid-date"), null);
  assert.equal(createCommodityScoreSnapshot({
    symbol: "GC=F",
    score: 60,
    scorecardVersion: 1,
    categories,
    recordedAt: "2026-11-01T12:00:00.000Z",
  }), null);
  assert.equal(snapshot("GC=F", 60, [
    categories[0]!,
    { ...categories[1]!, score: null },
  ]), null);
  const stale = categories.map((category) => ({
    ...category,
    sources: category.sources.map((source) => ({ ...source, asOf: "2026-08-01" })),
  }));
  assert.equal(snapshot("GC=F", 60, stale), null);
  assert.ok(snapshot("gc=f", 60));
});

test("saved score history is isolated to the same commodity and compatible scoring version", () => {
  const gold = snapshot("GC=F", 58, categories, "2026-11-01T12:00:00.000Z");
  const copper = snapshot("HG=F", 70, categories, "2026-11-01T12:00:00.000Z");
  const currentGold = snapshot("GC=F", 68);
  assert.ok(gold && copper && currentGold);
  const history = upsertCommodityScoreSnapshot([], gold);
  const withCopper = upsertCommodityScoreSnapshot(history, copper);
  assert.equal(findComparableCommodityScoreChange(currentGold, withCopper).status, "available");
  const comparison = findComparableCommodityScoreChange(currentGold, withCopper);
  assert.equal(comparison.status, "available");
  if (comparison.status === "available") {
    assert.equal(comparison.previousScore, 58);
    assert.equal(comparison.change, 10);
  }
  assert.equal(findComparableCommodityScoreChange(currentGold, [copper]).status, "first-analysis");
  assert.equal(
    createCommodityScoreSnapshot({
      symbol: "GC=F",
      score: 50,
      scorecardVersion: 2,
      categories,
      recordedAt: RECORDED_AT,
    }),
    null,
  );
});

test("score history reports category changes and refuses incompatible coverage or sources", () => {
  const prior = snapshot("CL=F", 55, categories, "2026-11-01T12:00:00.000Z");
  const currentCategories: CommodityScoreCategoryInput[] = [
    { ...categories[0]!, score: 72 },
    { ...categories[1]!, score: 40 },
  ];
  const current = snapshot("CL=F", 63, currentCategories);
  assert.ok(prior && current);
  const result = findComparableCommodityScoreChange(current, [prior]);
  assert.equal(result.status, "available");
  if (result.status === "available") {
    assert.deepEqual(result.improvedCategories, ["Technical momentum"]);
    assert.deepEqual(result.deterioratedCategories, ["Risk and volatility"]);
  }

  const otherSource: CommodityScoreCategoryInput[] = categories.map((category) => ({
    ...category,
    sources: category.sources.map((source) => ({
      ...source,
      url: "https://finance.yahoo.com/quote/CL%3DF/history/",
    })),
  }));
  const incompatible = snapshot("CL=F", 63, otherSource);
  assert.ok(incompatible);
  assert.equal(findComparableCommodityScoreChange(incompatible, [prior]).status, "not-comparable");

  const addedCoverage = snapshot("CL=F", 63, [
    ...currentCategories,
    {
      id: "supply-demand",
      score: 65,
      sources: [{
        url: "https://ir.eia.gov/wpsr/table4.csv",
        unit: "million barrels",
        asOf: "2026-11-02",
      }],
    },
  ]);
  assert.ok(addedCoverage);
  assert.equal(findComparableCommodityScoreChange(addedCoverage, [prior]).status, "not-comparable");
});

test("snapshot parsing ignores corrupted records and deduplicates repeated genuine results", () => {
  const first = snapshot("ZS=F", 61);
  assert.ok(first);
  const history = upsertCommodityScoreSnapshot([], first);
  assert.deepEqual(upsertCommodityScoreSnapshot(history, first), history);
  assert.equal(parseCommodityScoreSnapshots("not-json").length, 0);
  assert.deepEqual(parseCommodityScoreSnapshots(JSON.stringify([
    first,
    { ...first, symbol: "FAKE=F" },
    { ...first, score: 200 },
  ])), [first]);
});
