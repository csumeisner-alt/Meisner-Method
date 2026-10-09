import assert from "node:assert/strict";
import test from "node:test";
import {
  countActiveHeatMapFilters,
  filterHeatMapQuotes,
  getHeatMapLoadingHexColors,
  getHeatMapLoadingDelays,
  getHeatMapLoadingTheme,
  getHeatMapRevealDelays,
  getHeatMapTileWidth,
  hasUsableHeatMapPerformanceSnapshot,
  heatMapResponseMatchesSelection,
  layoutHoneycomb,
  marketCapBucketForUsd,
  summarizeHeatMap,
  uniqueHeatMapQuotesBySymbol,
} from "../heatMapMetrics.ts";

test("heat-map waits for useful return coverage before showing the fast breadth snapshot", () => {
  assert.equal(hasUsableHeatMapPerformanceSnapshot([]), false);
  assert.equal(hasUsableHeatMapPerformanceSnapshot([
    { price: 10, returnPercent: null },
    { price: 12, returnPercent: null },
    { price: 15, returnPercent: null },
  ]), false);
  assert.equal(hasUsableHeatMapPerformanceSnapshot([
    { price: 10, returnPercent: 1 },
    { price: 12, returnPercent: -1 },
    { price: 15, returnPercent: null },
    { price: 20, returnPercent: null },
  ]), false);
  assert.equal(hasUsableHeatMapPerformanceSnapshot([
    { price: 10, returnPercent: 1 },
    { price: 12, returnPercent: -1 },
    { price: 15, returnPercent: 0 },
    { price: 20, returnPercent: null },
    { price: 0, returnPercent: null },
  ]), true);
});

test("heat-map loading hexes use separate Patriot steel-and-gold and Neon Gucci palettes", () => {
  const palette = {
    card: "card",
    border: "border",
    secondary: "secondary",
    gold: "gold",
    goldMuted: "gold-muted",
    steelHighlight: "steel-highlight",
    steelShadow: "steel-shadow",
    holdBg: "hold-bg",
    buyBg: "buy-bg",
    buyColor: "mint",
  };

  assert.equal(getHeatMapLoadingTheme(false, false), "standard");
  assert.equal(getHeatMapLoadingTheme(true, false), "patriot");
  assert.equal(getHeatMapLoadingTheme(false, true), "neonGucci");
  assert.equal(getHeatMapLoadingTheme(true, true), "neonGucci");
  assert.deepEqual(getHeatMapLoadingHexColors("patriot", 0, palette), {
    fill: "steel-shadow",
    stroke: "gold",
    inset: "steel-highlight",
    glint: "gold-muted",
  });
  assert.deepEqual(getHeatMapLoadingHexColors("neonGucci", 0, palette), {
    fill: "hold-bg",
    stroke: "gold",
    inset: "mint",
    glint: "mint",
  });
  assert.deepEqual(getHeatMapLoadingHexColors("neonGucci", 1, palette), {
    fill: "buy-bg",
    stroke: "mint",
    inset: "gold-muted",
    glint: "gold",
  });
});

test("heat-map treats the full neutral band as neutral and keeps it in the denominator", () => {
  const summary = summarizeHeatMap([
    { price: 10, returnPercent: 1 },
    { price: 10, returnPercent: 1 },
    { price: 10, returnPercent: 0.25 },
    { price: 10, returnPercent: -0.25 },
  ]);
  assert.deepEqual(summary, { tone: "NEUTRAL", positive: 2, negative: 0, neutral: 2, quoted: 4 });
});

test("heat-map calls a map HOT or COLD at exactly 55 percent of valid quotes", () => {
  const hot = summarizeHeatMap([
    ...Array.from({ length: 11 }, () => ({ price: 10, returnPercent: 0.26 })),
    ...Array.from({ length: 9 }, () => ({ price: 10, returnPercent: -1 })),
  ]);
  const cold = summarizeHeatMap([
    ...Array.from({ length: 11 }, () => ({ price: 10, returnPercent: -0.26 })),
    ...Array.from({ length: 9 }, () => ({ price: 10, returnPercent: 1 })),
  ]);
  assert.equal(hot.tone, "HOT");
  assert.equal(cold.tone, "COLD");
});

test("heat-map excludes invalid and unavailable returns instead of counting them as flat", () => {
  const summary = summarizeHeatMap([
    { price: 10, returnPercent: 0.26 },
    { price: 10, returnPercent: null },
    { price: 0, returnPercent: -2 },
    { price: Number.NaN, returnPercent: 1 },
  ]);
  assert.deepEqual(summary, { tone: "HOT", positive: 1, negative: 0, neutral: 0, quoted: 1 });
  assert.equal(summarizeHeatMap([]).tone, "NEUTRAL");
});

test("market-cap bucket boundaries use the specified USD thresholds", () => {
  assert.equal(marketCapBucketForUsd(299_999_999.99), "Micro");
  assert.equal(marketCapBucketForUsd(300_000_000), "Small");
  assert.equal(marketCapBucketForUsd(2_000_000_000), "Mid");
  assert.equal(marketCapBucketForUsd(10_000_000_000), "Large");
  assert.equal(marketCapBucketForUsd(200_000_000_000), "Mega");
  assert.equal(marketCapBucketForUsd(null), null);
  assert.equal(marketCapBucketForUsd(Number.NaN), null);
});

test("combined filters retain missing metadata only when that filter is unset", () => {
  const quotes = [
    { symbol: "A", sector: "Technology", exchange: "NASDAQ", marketCapUsd: 299_000_000, riskBand: "Conservative" as const },
    { symbol: "B", sector: null, exchange: null, marketCapUsd: null, riskBand: null },
    { symbol: "C", sector: "Technology", exchange: "NYSE", marketCapUsd: 2_000_000_000, riskBand: "Moderate" as const },
  ];
  const noFilters = { sector: null, marketCap: null, exchange: null, risk: null };
  assert.deepEqual(filterHeatMapQuotes(quotes, noFilters).map((quote) => quote.symbol), ["A", "B", "C"]);
  assert.deepEqual(filterHeatMapQuotes(quotes, {
    sector: "Technology",
    marketCap: "Mid",
    exchange: "NYSE",
    risk: "Moderate",
  }).map((quote) => quote.symbol), ["C"]);
  assert.deepEqual(filterHeatMapQuotes(quotes, {
    ...noFilters,
    sector: "Unknown",
  }).map((quote) => quote.symbol), ["B"]);
  assert.deepEqual(filterHeatMapQuotes(quotes, {
    ...noFilters,
    risk: "Unknown",
  }).map((quote) => quote.symbol), ["B"]);
  assert.equal(countActiveHeatMapFilters({ sector: "Technology", marketCap: null, exchange: null, risk: "Moderate" }), 2);
});

test("heat-map keeps the first quote for each repeated ticker in stable order", () => {
  const quotes = [
    { symbol: "HPE", price: 20 },
    { symbol: "PURR", price: 4 },
    { symbol: "HPE", price: 99 },
    { symbol: "UUUU", price: 8 },
    { symbol: "PURR", price: 100 },
  ];

  assert.deepEqual(uniqueHeatMapQuotesBySymbol(quotes), [
    { symbol: "HPE", price: 20 },
    { symbol: "PURR", price: 4 },
    { symbol: "UUUU", price: 8 },
  ]);
});

test("heat-map does not show responses from an earlier category, period, or custom symbol set", () => {
  const response = {
    category: "custom",
    period: "1m",
    requestedSector: null,
    quotes: [{ symbol: "AAPL" }],
    unavailableSymbols: ["MSFT"],
  };
  assert.equal(heatMapResponseMatchesSelection(response, "stocks", "1m"), false);
  assert.equal(heatMapResponseMatchesSelection(response, "custom", "1d", ["AAPL", "MSFT"]), false);
  assert.equal(heatMapResponseMatchesSelection(response, "custom", "1m", ["AAPL"]), false);
  assert.equal(heatMapResponseMatchesSelection(response, "custom", "1m", ["AAPL", "MSFT"]), true);
});

test("heat-map does not render an earlier sector response while an expanded request is pending", () => {
  const response = {
    category: "stocks",
    period: "1d",
    requestedSector: "Technology",
    quotes: [{ symbol: "AAPL" }],
    unavailableSymbols: [],
  };
  assert.equal(heatMapResponseMatchesSelection(response, "stocks", "1d", undefined, "Technology"), true);
  assert.equal(heatMapResponseMatchesSelection(response, "stocks", "1d", undefined, "Real Estate"), false);
  assert.equal(heatMapResponseMatchesSelection(response, "stocks", "1d"), false);
});

test("heat-map hexagons use more phone width while staying within the available area", () => {
  const cases = [
    [320, 284, 98],
    [402, 366, 116],
    [600, 564, 116],
  ];

  for (const [viewportWidth, contentWidth, previousTileWidth] of cases) {
    const tileWidth = getHeatMapTileWidth(contentWidth);
    assert.ok(tileWidth > previousTileWidth, `${viewportWidth}px: hexagons are larger than before`);
    assert.ok(tileWidth <= contentWidth, `${viewportWidth}px: hexagons fit within the screen`);
    const { positions, height } = layoutHoneycomb(12, contentWidth, tileWidth);
    const tileHeight = tileWidth * Math.sqrt(3) / 2;
    assert.equal(positions.length, 12);
    assert.ok(height > 0);
    for (const position of positions) {
      assert.ok(position.left >= -0.01, `${viewportWidth}px: left edge is visible`);
      assert.ok(position.left + tileWidth <= contentWidth + 0.01, `${viewportWidth}px: right edge is visible`);
      assert.ok(position.top >= 0);
      assert.ok(position.top + tileHeight <= height + 0.01);
    }

    const centers = positions.map((position) => ({
      x: position.left + tileWidth / 2,
      y: position.top + tileHeight / 2,
    }));
    for (let first = 0; first < centers.length; first++) {
      for (let second = first + 1; second < centers.length; second++) {
        const dx = Math.abs(centers[first].x - centers[second].x);
        const dy = Math.abs(centers[first].y - centers[second].y);
        const distance = Math.hypot(dx, dy);
        if (distance < tileWidth - 0.01) {
          assert.ok(Math.abs(distance - tileHeight) < 0.02, `${viewportWidth}px: adjacent hexes share edges`);
          assert.ok(
            (Math.abs(dx - tileWidth * 0.75) < 0.02 && Math.abs(dy - tileHeight / 2) < 0.02)
              || (dx < 0.02 && Math.abs(dy - tileHeight) < 0.02),
            `${viewportWidth}px: no overlapping or rectangular-gap geometry`,
          );
        }
      }
    }
  }
});

test("loading hexagons receive a randomized one-by-one reveal order", () => {
  assert.deepEqual(
    getHeatMapLoadingDelays(5, () => 0),
    [320, 0, 80, 160, 240],
  );
  assert.deepEqual(
    getHeatMapLoadingDelays(5, () => 0.999),
    [0, 80, 160, 240, 320],
  );
  assert.deepEqual(getHeatMapLoadingDelays(0), []);
  assert.deepEqual(getHeatMapLoadingDelays(Number.NaN), []);
});

test("loaded heat-map hexagons receive a randomized reveal within a capped window", () => {
  assert.deepEqual(
    getHeatMapRevealDelays(5, 400, () => 0),
    [400, 0, 100, 200, 300],
  );
  assert.deepEqual(
    getHeatMapRevealDelays(5, 400, () => 0.999),
    [0, 100, 200, 300, 400],
  );
  assert.deepEqual(getHeatMapRevealDelays(1, 1_200), [0]);
  assert.deepEqual(getHeatMapRevealDelays(0, 1_200), []);
  assert.deepEqual(getHeatMapRevealDelays(3, 1_200, () => 0), [1_200, 0, 600]);
});