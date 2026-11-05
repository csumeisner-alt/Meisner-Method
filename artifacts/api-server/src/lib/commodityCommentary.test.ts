import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCommodityScore,
  COMMODITY_ANALYSIS_GUIDES,
  SUPPORTED_COMMODITIES,
} from "./commodityAnalysis.ts";
import {
  buildCommodityCommentaryPrompt,
  buildCommodityVerifiedEvidence,
  parseCommodityAiCommentary,
  validateCommodityNewsContext,
} from "./commodityCommentary.ts";

const NOW = new Date("2026-11-02T12:00:00.000Z");

function makeScore(symbol: string) {
  const dates: string[] = [];
  let time = Date.parse("2026-10-30T00:00:00.000Z");
  while (dates.length < 260) {
    const date = new Date(time).toISOString().slice(0, 10);
    const weekday = new Date(time).getUTCDay();
    if (weekday > 0 && weekday < 6) dates.push(date);
    time -= 86_400_000;
  }
  dates.reverse();
  const sessions = [...dates, "2026-11-02"];
  const closes = dates.map((_, index) => 100 * Math.exp(index * 0.001));
  const score = buildCommodityScore({
    symbol,
    closes,
    historyDates: dates,
    historySessions: sessions,
    currentPrice: closes.at(-1)!,
    historyAsOf: dates.at(-1)!,
    now: NOW,
  });
  assert.ok(score);
  return score;
}

function availableNews(publishedAt: string, retrievedAt = "2026-11-02T11:45:00.000Z") {
  return {
    status: "available" as const,
    summary: "A dated source reports a specific commodity supply event.",
    retrievedAt,
    sources: [{
      title: "Current commodity report",
      url: "https://example.com/commodity-report",
      publishedAt,
    }],
  };
}

test("commodity analysis guides distinguish precious metals, copper, energy, and crops", () => {
  const gold = COMMODITY_ANALYSIS_GUIDES["GC=F"]!;
  const silver = COMMODITY_ANALYSIS_GUIDES["SI=F"]!;
  const copper = COMMODITY_ANALYSIS_GUIDES["HG=F"]!;
  const crude = COMMODITY_ANALYSIS_GUIDES["CL=F"]!;
  const gas = COMMODITY_ANALYSIS_GUIDES["NG=F"]!;
  const corn = COMMODITY_ANALYSIS_GUIDES["ZC=F"]!;

  assert.notDeepEqual(gold.focus, silver.focus);
  assert.ok(silver.unavailable.some((item) => /industrial and solar demand/i.test(item)));
  assert.ok(gold.unavailable.some((item) => /real yields/i.test(item)));
  assert.ok(copper.unavailable.some((item) => /exchange warehouse inventories/i.test(item)));
  assert.ok(crude.focus.some((item) => /EIA U\.S\. commercial crude inventories/i.test(item)));
  assert.ok(gas.focus.some((item) => /working-gas storage/i.test(item)));
  assert.ok(corn.focus.some((item) => /WASDE corn stocks-to-use/i.test(item)));
  assert.equal(Object.keys(COMMODITY_ANALYSIS_GUIDES).length, Object.keys(SUPPORTED_COMMODITIES).length);
});

test("commentary evidence uses validated dated observations, not unverified search summaries", () => {
  for (const symbol of ["GC=F", "SI=F", "CL=F", "NG=F", "HG=F", "ZC=F"]) {
    const commodity = SUPPORTED_COMMODITIES[symbol]!;
    const score = makeScore(symbol);
    const news = validateCommodityNewsContext(availableNews("2026-11-01T08:00:00.000Z"), NOW);
    const evidence = buildCommodityVerifiedEvidence(symbol, score);
    const priceHistory = evidence.find((item) => item.id === "price-history");
    assert.equal(priceHistory?.asOf, score.historyAsOf);
    assert.match(priceHistory?.url ?? "", /^https:\/\/finance\.yahoo\.com/);
    assert.equal(evidence.some((item) => item.kind === "news"), false);
    assert.ok(evidence.every((item) => item.asOf && item.url.startsWith("https://")));

    const prompt = buildCommodityCommentaryPrompt(
      symbol,
      commodity.name,
      commodity.family,
      score,
      evidence,
    );
    assert.ok(prompt.includes("price-history"));
    assert.ok(prompt.includes(score.historyAsOf!));
    assert.ok(prompt.includes(COMMODITY_ANALYSIS_GUIDES[symbol]!.unavailable[0]!));
    assert.match(prompt, /Never invent IDs, sources, publication dates, catalysts, or values/);
    assert.ok(!prompt.includes("currentPrice"));
    assert.ok(!prompt.includes(news.summary!));
  }
});

test("news is unavailable when its source publication date or retrieval time is stale or missing", () => {
  assert.equal(
    validateCommodityNewsContext(availableNews("2026-11-01T08:00:00.000Z"), NOW).status,
    "available",
  );
  assert.equal(
    validateCommodityNewsContext(availableNews("2026-10-24T08:00:00.000Z"), NOW).status,
    "unavailable",
  );
  assert.equal(
    validateCommodityNewsContext(availableNews(""), NOW).status,
    "unavailable",
  );
  assert.equal(
    validateCommodityNewsContext(availableNews("2026-11-01T08:00:00.000Z", "2026-11-02T10:00:00.000Z"), NOW).status,
    "unavailable",
  );
  assert.equal(
    validateCommodityNewsContext(availableNews("2026-11-03T08:00:00.000Z"), NOW).status,
    "unavailable",
  );
});

test("structured commentary rejects unsupported source IDs and accepts cited items", () => {
  const evidence = [{
    id: "price-history",
    title: "Yahoo Finance daily futures history",
    url: "https://finance.yahoo.com/quote/GC%3DF/history/",
    asOf: "2026-10-30",
    unit: "percent return",
    observation: "1-month return 2%.",
    kind: "market-data" as const,
    eventDate: null,
  }];
  const guide = COMMODITY_ANALYSIS_GUIDES["GC=F"]!;
  const valid = {
    currentDrivers: [{ text: "The dated price trend is rising.", evidenceIds: ["price-history"] }],
    strongestBullishFactors: [],
    strongestBearishFactors: [],
    technicalAlignment: { text: "The multi-month trend is positive.", evidenceIds: ["price-history"] },
    upcomingCatalysts: [],
    risks: [],
    monitorNext: [guide.monitorNext[0]],
  };
  const parsed = parseCommodityAiCommentary(JSON.stringify(valid), evidence, guide.monitorNext);
  assert.equal(parsed?.status, "available");
  assert.deepEqual(parsed?.currentDrivers[0]?.evidenceIds, ["price-history"]);

  const unsupported = structuredClone(valid);
  unsupported.currentDrivers[0]!.evidenceIds = ["unverified-macro-data"];
  assert.equal(parseCommodityAiCommentary(JSON.stringify(unsupported), evidence, guide.monitorNext), null);
  const inventedMonitor = structuredClone(valid);
  inventedMonitor.monitorNext = ["An invented event will happen next week."];
  assert.equal(parseCommodityAiCommentary(JSON.stringify(inventedMonitor), evidence, guide.monitorNext), null);
});

test("a recent article is not an upcoming catalyst unless evidence includes a future event date", () => {
  const guide = COMMODITY_ANALYSIS_GUIDES["CL=F"]!;
  const priceEvidence = {
    id: "price-history",
    title: "Yahoo Finance daily futures history",
    url: "https://finance.yahoo.com/quote/CL%3DF/history/",
    asOf: "2026-10-30",
    unit: "percent return",
    observation: "The latest measured return is positive.",
    kind: "market-data" as const,
    eventDate: null,
  };
  const newsEvidence = {
    ...priceEvidence,
    id: "news-1",
    title: "Recent market report",
    url: "https://example.com/report",
    asOf: "2026-11-01",
    unit: "publication date",
    observation: "A recent market update.",
    kind: "news" as const,
  };
  const response = {
    currentDrivers: [],
    strongestBullishFactors: [],
    strongestBearishFactors: [],
    technicalAlignment: { text: "The trend is positive.", evidenceIds: ["price-history"] },
    upcomingCatalysts: [{ text: "An upcoming report is expected.", evidenceIds: ["news-1"] }],
    risks: [],
    monitorNext: [guide.monitorNext[0]],
  };
  const currentNews = parseCommodityAiCommentary(
    JSON.stringify(response),
    [priceEvidence, newsEvidence],
    guide.monitorNext,
    NOW,
  );
  assert.deepEqual(currentNews?.upcomingCatalysts, []);

  const datedEvent = { ...newsEvidence, id: "scheduled-report", eventDate: "2026-11-05" };
  const supported = parseCommodityAiCommentary(
    JSON.stringify({
      ...response,
      upcomingCatalysts: [{ text: "A scheduled report is due on November 5.", evidenceIds: ["scheduled-report"] }],
    }),
    [priceEvidence, datedEvent],
    guide.monitorNext,
    NOW,
  );
  assert.equal(supported?.upcomingCatalysts.length, 1);
});
