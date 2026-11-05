import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateCommodityRelationship,
  calculateCommodityRelationshipHistoryRanks,
  COMMODITY_RELATIONSHIPS,
  COMMODITY_RELATIONSHIP_PERIODS,
  isCommodityRelationshipPeriod,
  isValidCommodityRelationshipTradingDate,
  type CommodityRelationshipPeriod,
  type DatedCommodityClose,
} from "./commodityRelationships.ts";
import {
  buildCommodityRelationshipInterpretationPrompt,
  respondWithCommodityRelationship,
} from "./commodityRelationshipEndpoint.ts";

function makeSeries(
  count: number,
  change: (index: number) => number = () => 0.001,
  startDate = "2026-01-05",
): DatedCommodityClose[] {
  const result: DatedCommodityClose[] = [];
  let price = 100;
  let day = Date.parse(`${startDate}T12:00:00.000Z`);
  for (let index = 0; index < count; index += 1) {
    while (new Date(day).getUTCDay() === 0 || new Date(day).getUTCDay() === 6) {
      day += 86_400_000;
    }
    price *= 1 + change(index);
    const date = new Date(day).toISOString().slice(0, 10);
    result.push({ date, timestamp: Math.floor(day / 1000), close: price });
    day += 86_400_000;
  }
  return result;
}

function responseHarness() {
  const response = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(value: unknown) {
      this.body = value;
      return this;
    },
  };
  return response;
}

test("relationship catalog covers the requested pairs and supported periods", () => {
  assert.deepEqual(COMMODITY_RELATIONSHIPS.map(({ id }) => id), [
    "gold-silver",
    "gold-dollar",
    "copper-gold",
    "oil-gold",
    "gold-silver-ratio",
  ]);
  assert.deepEqual(COMMODITY_RELATIONSHIP_PERIODS, ["1mo", "3mo", "6mo", "1y", "5y", "max"]);
  for (const period of COMMODITY_RELATIONSHIP_PERIODS) assert.equal(isCommodityRelationshipPeriod(period), true);
  assert.equal(isCommodityRelationshipPeriod("2y"), false);
  assert.equal(COMMODITY_RELATIONSHIPS[1]!.second.symbol, "DX-Y.NYB");
  assert.equal(COMMODITY_RELATIONSHIPS[1]!.second.proxy, true);
  assert.equal(COMMODITY_RELATIONSHIPS[1]!.second.venue, "ICE Futures U.S.");
  assert.match(COMMODITY_RELATIONSHIPS[1]!.second.name, /index proxy/i);
});

test("aligns exact provider dates and calculates normalized performance and return correlation", () => {
  const first = makeSeries(55, (index) => 0.002 + Math.sin(index) * 0.001);
  const second = makeSeries(55, (index) => 0.001 + Math.sin(index) * 0.0005);
  const result = calculateCommodityRelationship(COMMODITY_RELATIONSHIPS[0]!, "3mo", first, second);

  assert.equal(result.status, "available");
  assert.equal(result.coverage.matchedObservations, 55);
  assert.equal(result.coverage.returnObservations, 54);
  assert.equal(result.coverage.matchedStartDate, first[0]!.date);
  assert.equal(result.coverage.matchedEndDate, first.at(-1)!.date);
  assert.ok(result.metrics.correlation! > 0.99);
  assert.ok(result.metrics.correlationChange !== null);
  assert.equal(result.points[0]!.firstNormalizedPercent, 0);
  assert.equal(result.points[0]!.secondNormalizedPercent, 0);
  assert.ok(Math.abs(result.points.at(-1)!.relativeValue - first.at(-1)!.close / second.at(-1)!.close) < 1e-12);
});

test("the direct gold/silver ratio uses same-unit dated futures prices", () => {
  const relationship = COMMODITY_RELATIONSHIPS.find(({ id }) => id === "gold-silver-ratio")!;
  assert.equal(relationship.first.unit, "USD per troy ounce");
  assert.equal(relationship.second.unit, "USD per troy ounce");
  const first = makeSeries(24, () => 0, "2026-03-02").map((point, index) => ({ ...point, close: 2000 + index }));
  const second = makeSeries(24, () => 0, "2026-03-02").map((point) => ({ ...point, close: 25 }));
  const result = calculateCommodityRelationship(relationship, "1mo", first, second);
  assert.equal(result.status, "available");
  assert.equal(result.metrics.currentRelativeValue, 2023 / 25);
  assert.equal(result.points.at(-1)!.relativeValue, 2023 / 25);
  assert.equal(result.metrics.currentRelativeValuePercentile, 97.91666666666666);
  assert.match(result.method.relativeValuePercentile, /minimum 20 observations/i);
});

test("gold/silver history rank uses only exact matched same-unit observations", () => {
  const relationship = COMMODITY_RELATIONSHIPS.find(({ id }) => id === "gold-silver-ratio")!;
  const first = makeSeries(24, (_index) => 0, "2026-03-02").map((point, index) => ({
    ...point,
    close: 2000 + index,
  }));
  const completeSecond = makeSeries(24, () => 0, "2026-03-02").map((point) => ({
    ...point,
    close: 25,
  }));
  const second = completeSecond.filter((_, index) => index !== 10);
  const result = calculateCommodityRelationship(relationship, "3mo", first, second);
  assert.equal(result.coverage.matchedObservations, 23);
  assert.equal(result.metrics.currentRelativeValuePercentile, 97.82608695652173);

  const tooFew = calculateCommodityRelationship(
    relationship,
    "1mo",
    first.slice(0, 19),
    second.slice(0, 19),
  );
  assert.equal(tooFew.status, "available");
  assert.equal(tooFew.metrics.currentRelativeValuePercentile, null);

  const minimumSample = calculateCommodityRelationship(
    relationship,
    "1mo",
    first.slice(0, 20),
    completeSecond.slice(0, 20),
  );
  assert.equal(minimumSample.metrics.currentRelativeValuePercentile, 97.5);

  const tiedRatios = calculateCommodityRelationship(
    relationship,
    "1mo",
    first.slice(0, 20).map((point) => ({ ...point, close: 2000 })),
    completeSecond.slice(0, 20).map((point) => ({ ...point, close: 25 })),
  );
  assert.equal(tiedRatios.metrics.currentRelativeValuePercentile, 50);

  const differentUnits = {
    ...relationship,
    second: { ...relationship.second, unit: "USD per kilogram" },
  };
  const mismatchedUnits = calculateCommodityRelationship(differentUnits, "3mo", first, first);
  assert.equal(mismatchedUnits.metrics.currentRelativeValuePercentile, null);
});

test("gold/silver ranks compare every supported window using exact matched dates", () => {
  const relationship = COMMODITY_RELATIONSHIPS.find(({ id }) => id === "gold-silver-ratio")!;
  const first = makeSeries(1450, (index) => 0.0002 + Math.sin(index) * 0.0001, "2021-05-03")
    .map((point, index) => ({ ...point, close: 1800 + index }));
  const completeSecond = makeSeries(1450, () => 0, "2021-05-03")
    .map((point) => ({ ...point, close: 25 }));
  const missingOneDate = completeSecond.filter((point) => point.date !== "2024-01-03");
  const ranks = calculateCommodityRelationshipHistoryRanks(relationship, first, missingOneDate);
  const baseline = calculateCommodityRelationship(relationship, "max", first, completeSecond);
  const latestMatchedDate = first
    .map(({ date }) => date)
    .filter((date) => missingOneDate.some((point) => point.date === date))
    .at(-1);

  assert.deepEqual(ranks.map(({ period }) => period), COMMODITY_RELATIONSHIP_PERIODS);
  assert.equal(ranks.at(-1)!.matchedObservations, baseline.coverage.matchedObservations - 1);
  for (const rank of ranks) {
    assert.ok(rank.matchedObservations > 0, `${rank.period} should report its matched sample.`);
    assert.equal(rank.matchedEndDate, latestMatchedDate);
    assert.ok(rank.matchedStartDate);
    if (rank.matchedObservations >= 20) {
      assert.ok(rank.percentile !== null && rank.percentile >= 0 && rank.percentile <= 100);
    } else {
      assert.equal(rank.percentile, null);
    }
  }

  const emptyRanks = calculateCommodityRelationshipHistoryRanks(relationship, [], []);
  assert.equal(emptyRanks.length, COMMODITY_RELATIONSHIP_PERIODS.length);
  assert.ok(emptyRanks.every((rank) => rank.percentile === null
    && rank.matchedObservations === 0
    && rank.matchedStartDate === null
    && rank.matchedEndDate === null));

  const monthBoundarySeries = makeSeries(23, () => 0, "2025-02-27");
  const monthBoundaryRank = calculateCommodityRelationshipHistoryRanks(
    relationship,
    monthBoundarySeries,
    monthBoundarySeries,
  ).find(({ period }) => period === "1mo")!;
  assert.equal(monthBoundaryRank.matchedStartDate, "2025-02-28");
  assert.equal(monthBoundaryRank.matchedEndDate, "2025-03-31");
});

test("the ICE dollar-index proxy follows ICE dates instead of CME holiday closures", () => {
  const dollarIndex = COMMODITY_RELATIONSHIPS[1]!.second;
  assert.equal(isValidCommodityRelationshipTradingDate(dollarIndex, "2024-03-29"), true); // Good Friday
  assert.equal(isValidCommodityRelationshipTradingDate(dollarIndex, "2026-06-19"), true); // Juneteenth
  assert.equal(isValidCommodityRelationshipTradingDate(dollarIndex, "2023-01-02"), false); // Observed New Year's closure
  assert.equal(isValidCommodityRelationshipTradingDate(dollarIndex, "2026-12-25"), false); // Christmas closure
  assert.equal(isValidCommodityRelationshipTradingDate(dollarIndex, "2026-11-07"), false); // Saturday
});

test("unsupported, duplicate, invalid, and non-overlapping observations are not filled", () => {
  const first = makeSeries(16, () => 0.002);
  const second = makeSeries(16, () => 0.001).filter((_, index) => index % 2 === 0);
  const result = calculateCommodityRelationship(COMMODITY_RELATIONSHIPS[0]!, "1mo", first, second);
  assert.equal(result.status, "unavailable");
  assert.equal(result.coverage.matchedObservations, 8);
  assert.deepEqual(result.points, []);
  assert.equal(result.metrics.correlation, null);
  assert.match(result.reason!, /at least 11 valid shared trading dates/i);

  const malformed = makeSeries(15, () => 0.001);
  malformed[1] = { ...malformed[1]!, timestamp: malformed[1]!.timestamp + 10 * 86_400 };
  const duplicate = [...malformed, { ...malformed[0]! }];
  const invalid = calculateCommodityRelationship(COMMODITY_RELATIONSHIPS[0]!, "1mo", duplicate, makeSeries(15));
  assert.equal(invalid.coverage.matchedObservations, 13);
});

test("reports a reproducible divergence when relative returns separate and rolling correlation is weak", () => {
  const first = makeSeries(60, (index) => index >= 40 ? 0.004 + Math.sin(index) * 0.002 : Math.sin(index) * 0.001);
  const second = makeSeries(60, (index) => index >= 40 ? (index % 2 ? 0.001 : -0.001) : Math.cos(index) * 0.001);
  const result = calculateCommodityRelationship(COMMODITY_RELATIONSHIPS[0]!, "5y", first, second);
  assert.equal(result.status, "available");
  assert.equal(result.divergence.status, "detected");
  assert.ok(Math.abs(result.divergence.firstWindowReturnPercent! - result.divergence.secondWindowReturnPercent!) >= 5);
  assert.match(result.method.divergence, /5 percentage points/);
});

test("AI interpretation prompt is limited to dated calculations and rejects causal claims", () => {
  const result = calculateCommodityRelationship(
    COMMODITY_RELATIONSHIPS[0]!,
    "1mo",
    makeSeries(16, (index) => 0.002 + Math.sin(index) * 0.001),
    makeSeries(16, (index) => 0.001 + Math.sin(index) * 0.0005),
  );
  const prompt = buildCommodityRelationshipInterpretationPrompt(result);
  assert.match(prompt, /dated observations/);
  assert.match(prompt, /correlation does not establish causation/);
  assert.match(prompt, /"date":"2026-/);
  assert.match(prompt, /"correlation":/);
  assert.doesNotMatch(prompt, /search the web|use outside sources/i);
});

test("all selected periods are forwarded, and AI failure never removes calculated history", async () => {
  for (const period of COMMODITY_RELATIONSHIP_PERIODS) {
    const response = responseHarness();
    const requested: string[] = [];
    const reportedFailure: string[] = [];
    await respondWithCommodityRelationship(response as never, "gold-silver", period, {
      fetchHistory: async (symbol: string) => {
        requested.push(symbol);
        const points = makeSeries(16, symbol === "GC=F"
          ? (index) => 0.002 + Math.sin(index) * 0.001
          : (index) => 0.001 + Math.sin(index) * 0.0005);
        return { points, source: "Yahoo Finance", latestSourceTimestamp: points.at(-1)!.timestamp };
      },
      interpret: async () => { throw new Error("model offline"); },
      now: () => new Date("2026-11-03T12:00:00.000Z"),
      onInterpretationFailure: (_error, id) => reportedFailure.push(id),
    });
    const body = response.body as {
      status: string;
      period: CommodityRelationshipPeriod;
      metrics: { correlation: number | null };
      aiInterpretation: { status: string; text: string | null };
      sources: { provider: string; latestObservationTimestamp: number | null };
    };
    assert.equal(response.statusCode, 200);
    assert.equal(body.status, "available");
    assert.equal(body.period, period);
    assert.ok(body.metrics.correlation !== null);
    assert.deepEqual(body.aiInterpretation, { status: "unavailable", text: null });
    assert.equal(body.sources.provider, "Yahoo Finance");
    assert.ok(body.sources.latestObservationTimestamp !== null);
    assert.deepEqual(requested.sort(), ["GC=F", "SI=F"]);
    assert.deepEqual(reportedFailure, ["gold-silver"]);
  }
});

test("gold/silver ratio endpoint supplies rank coverage for all windows", async () => {
  const response = responseHarness();
  const requested: string[] = [];
  await respondWithCommodityRelationship(response as never, "gold-silver-ratio", "1y", {
    fetchHistory: async (symbol: string, period: CommodityRelationshipPeriod) => {
      requested.push(`${symbol}:${period}`);
      const points = period === "max"
        ? makeSeries(1450, () => 0.001, "2021-05-03")
        : makeSeries(260, () => 0.001, "2025-11-03");
      return { points, source: "Yahoo Finance", latestSourceTimestamp: points.at(-1)!.timestamp };
    },
    interpret: async () => "Historical comparison only.",
    now: () => new Date("2026-11-03T12:00:00.000Z"),
  });
  const body = response.body as {
    historyRanks: Array<{
      period: CommodityRelationshipPeriod;
      percentile: number | null;
      matchedObservations: number;
      matchedStartDate: string | null;
      matchedEndDate: string | null;
    }>;
  };
  assert.deepEqual(requested.sort(), [
    "GC=F:1y", "GC=F:max", "SI=F:1y", "SI=F:max",
  ]);
  assert.deepEqual(body.historyRanks.map(({ period }) => period), COMMODITY_RELATIONSHIP_PERIODS);
  assert.ok(body.historyRanks.find(({ period }) => period === "1y")!.percentile !== null);
  assert.ok(body.historyRanks.find(({ period }) => period === "1y")!.matchedObservations >= 20);
  assert.ok(body.historyRanks.every(({ matchedObservations, matchedStartDate, matchedEndDate }) =>
    matchedObservations === 0 || Boolean(matchedStartDate && matchedEndDate)));
});

test("unavailable source history does not invoke AI or synthesize a comparison", async () => {
  const response = responseHarness();
  let interpreted = false;
  await respondWithCommodityRelationship(response as never, "gold-dollar", "1y", {
    fetchHistory: async (symbol: string) => {
      if (symbol === "DX-Y.NYB") throw new Error("ICE proxy history unavailable");
      const points = makeSeries(30);
      return { points, source: "Yahoo Finance", latestSourceTimestamp: points.at(-1)!.timestamp };
    },
    interpret: async () => { interpreted = true; return "Should not be requested"; },
    now: () => new Date("2026-11-03T12:00:00.000Z"),
  });
  const body = response.body as {
    status: string;
    metrics: { currentRelativeValue: number | null };
    points: unknown[];
    aiInterpretation: { status: string };
    reason: string;
  };
  assert.equal(body.status, "unavailable");
  assert.equal(body.metrics.currentRelativeValue, null);
  assert.deepEqual(body.points, []);
  assert.equal(body.aiInterpretation.status, "unavailable");
  assert.match(body.reason, /U\.S\. Dollar Index \(ICE index proxy\) history is unavailable/);
  assert.equal(interpreted, false);
});

test("invalid relationship and period are rejected without fetching source data", async () => {
  const response = responseHarness();
  let fetched = false;
  await respondWithCommodityRelationship(response as never, "unknown", "2y", {
    fetchHistory: async () => {
      fetched = true;
      return { points: [], source: "Yahoo Finance", latestSourceTimestamp: null };
    },
    interpret: async () => "",
    now: () => new Date(),
  });
  assert.equal(response.statusCode, 400);
  assert.equal(fetched, false);
});
