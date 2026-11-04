import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { runSmokeCheck, validateAnalysisResponse } from "./smoke-test-analysis.mjs";

const fallbackReasoning =
  "The AI explanation was unavailable, so this analysis is based on the rules-based technical, fundamental, and behavioral scores shown above.";
const etfAnalysisSource = readFileSync(
  new URL("../app/analysis/[symbol].tsx", import.meta.url),
  "utf8",
);
const apiSchemaSource = readFileSync(
  new URL("../../../lib/api-spec/openapi.yaml", import.meta.url),
  "utf8",
);
const analysisRouteSource = readFileSync(
  new URL("../../api-server/src/routes/stocks.ts", import.meta.url),
  "utf8",
);
const etfEndpointSource = readFileSync(
  new URL("../../api-server/src/lib/etfAnalysisEndpoint.ts", import.meta.url),
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
  assert.match(etfAnalysisSource, /response\.assetType === 'etf' \? response\.etfAnalysis \?\? null : null/);
  assert.match(etfAnalysisSource, /else if \(failed\)/);
  assert.match(etfAnalysisSource, /It remains saved for retry/);
  assert.match(etfAnalysisSource, /removeCompareSymbol\(candidate\)/);
  assert.equal((etfAnalysisSource.match(/includeCommentary: false/g) ?? []).length, 2);
});

test("ETF comparison switcher supports focus changes, adding, replacing, and removal", () => {
  assert.match(etfAnalysisSource, /testID="etf-comparison-switcher"/);
  assert.match(etfAnalysisSource, /rotateSavedEtfComparisonFocus\(/);
  assert.match(etfAnalysisSource, /router\.push\(\{ pathname: '\/analysis\/\[symbol\]'/);
  assert.match(etfAnalysisSource, /accessibilityLabel=\{`Open \$\{candidate\} ETF details`\}/);
  assert.match(etfAnalysisSource, /testID=\{`etf-comparison-remove-\$\{candidate\}`\}/);
  assert.match(etfAnalysisSource, /testID=\{`etf-comparison-replace-\$\{candidate\}`\}/);
  assert.match(etfAnalysisSource, /const nextSymbols = replaceTarget/);
  assert.match(etfAnalysisSource, /savedCompareSymbols\.length \+ 1\} of 4 ETFs selected/);
});

test("ETF analysis leads with a concise overview and preserves score limits", () => {
  assert.doesNotMatch(etfAnalysisSource, /Evaluates the fund as a portfolio of reported holdings/);
  assert.match(etfAnalysisSource, /calculateEtfResearchScore\(\{/);
  assert.match(etfAnalysisSource, /ETF RESEARCH PROFILE/);
  assert.match(etfAnalysisSource, /At a glance/);
  assert.match(etfAnalysisSource, /AI-IDENTIFIED TAKEAWAYS/);
  assert.match(etfAnalysisSource, /fund\.strengths\.map/);
  assert.match(etfAnalysisSource, /fund\.risks\.map/);
  const commentarySection = etfAnalysisSource.match(
    /title="AI COMMENTARY"([\s\S]*?)<\/SectionCard>/,
  )?.[1] ?? "";
  assert.doesNotMatch(commentarySection, /fund\.(strengths|risks)\.map/);
  assert.match(etfAnalysisSource, /SCORE DETAILS & METHODOLOGY/);
  assert.match(etfAnalysisSource, /Missing components are excluded and remaining weights are rescaled/);
  assert.match(etfAnalysisSource, /Rules-based, not AI-generated or personalized advice/);
  assert.match(etfAnalysisSource, /AI commentary summarizes supplied fund data; it does not set the deterministic profile score/);
  assert.match(etfAnalysisSource, /component\.peerContext\.category/);
  assert.match(etfAnalysisSource, /component\.peerContext\.sampleContext/);
  assert.match(etfAnalysisSource, /component\.peerContext\.source/);
  assert.match(etfAnalysisSource, /sourceDate\(component\.peerContext\.asOf\)/);
  assert.match(etfAnalysisSource, /Expense ratio is the annual operating cost as a share of fund assets/);
  assert.match(etfAnalysisSource, /Beta estimates sensitivity to broad-market moves/);
  assert.match(etfAnalysisSource, /Fund data source: \{fund\.provider\} · retrieved \{sourceDate\(fund\.asOf\)\}/);
});

test("ETF evidence is grouped in expandable, accessible sections", () => {
  const overviewIndex = etfAnalysisSource.indexOf("At a glance");
  const scoreDetailsIndex = etfAnalysisSource.indexOf("SCORE DETAILS & METHODOLOGY");
  assert.ok(overviewIndex >= 0 && scoreDetailsIndex > overviewIndex);
  assert.match(etfAnalysisSource, /useState\(false\)/);
  assert.match(etfAnalysisSource, /accessibilityState: \{ expanded \}/);
  assert.match(etfAnalysisSource, /\(!collapsible \|\| expanded\) && children/);
  for (const heading of [
    "FUND PROFILE & RISK",
    "COSTS & CATEGORY CONTEXT",
    "HOLDINGS & DIVERSIFICATION",
    "BENCHMARK & TRACKING",
    "HISTORICAL PERFORMANCE",
    "ETF FEE DOLLAR IMPACT",
    "LONG-RANGE SCENARIOS",
  ]) {
    assert.match(
      etfAnalysisSource,
      new RegExp(`SectionCard(?=[^>]*collapsible)(?=[^>]*title="${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}")`),
    );
  }
});

test("ETF analysis provides six accessible section-navigation targets", () => {
  const navigationLabels = [
    "Overview",
    "Risk & Costs",
    "Holdings & Diversification",
    "Performance",
    "AI Analysis",
    "Future Projections",
  ];
  let previousIndex = -1;
  for (const label of navigationLabels) {
    const index = etfAnalysisSource.indexOf(`label: '${label}'`);
    assert.ok(index > previousIndex, `${label} should appear in the requested navigation order.`);
    previousIndex = index;
    assert.match(etfAnalysisSource, new RegExp(`sectionId="${label === "Holdings & Diversification" ? "holdings" : label === "Risk & Costs" ? "risk-costs" : label === "AI Analysis" ? "ai-analysis" : label === "Future Projections" ? "projections" : label.toLowerCase()}"`));
    assert.match(etfAnalysisSource, new RegExp(`testID=\{\\\`etf-section-nav-`));
  }
  const sectionIds = ["overview", "risk-costs", "holdings", "performance", "ai-analysis", "projections"];
  let previousAnchorIndex = -1;
  for (const sectionId of sectionIds) {
    const anchorIndex = etfAnalysisSource.indexOf(`sectionId="${sectionId}"`);
    assert.ok(anchorIndex > previousAnchorIndex, `${sectionId} should appear in the same order as the section tabs.`);
    previousAnchorIndex = anchorIndex;
  }
  assert.match(etfAnalysisSource, /sectionView\.measureInWindow/);
  assert.match(etfAnalysisSource, /scrollView\.scrollTo\(\{ y:/);
  assert.match(etfAnalysisSource, /accessibilityState=\{\{ selected \}\}/);
});

test("ETF overview combines quote, deterministic research score, takeaways, and freshness", () => {
  assert.match(etfAnalysisSource, /ETF RESEARCH PROFILE/);
  assert.match(etfAnalysisSource, /Research score/);
  assert.match(etfAnalysisSource, /fund\.provider\} data retrieved \{sourceDate\(fund\.asOf\)\}/);
  assert.match(etfAnalysisSource, /fund\.strengths\.map/);
  assert.match(etfAnalysisSource, /fund\.risks\.map/);
  assert.match(etfAnalysisSource, /formatAnalysisLoadingStage/);
  assert.match(etfAnalysisSource, /fmtPrice\(analysis\.currentPrice\)/);
  assert.match(etfAnalysisSource, /changePct\.toFixed\(2\)/);
  assert.match(etfAnalysisSource, /calculateEtfResearchScore\(\{/);
  assert.match(etfAnalysisSource, /Missing components are excluded and remaining weights are rescaled/);
});

test("ETF performance history uses real candles, supported ranges, and honest retry states", () => {
  assert.match(etfAnalysisSource, /\/api\/stocks\/chart\/\$\{encodeURIComponent\(symbol\)\}\?period=\$\{period\}&interval=1d/);
  for (const period of ["1mo", "3mo", "6mo", "1y", "2y"]) {
    assert.match(etfAnalysisSource, new RegExp(`value: '${period}'`));
    assert.match(etfAnalysisSource, /etf-chart-period-\$\{value\}/);
  }
  assert.match(etfAnalysisSource, /testID="etf-chart-retry"/);
  assert.match(etfAnalysisSource, /Price history could not be loaded\. No chart is shown\./);
  assert.match(etfAnalysisSource, /Only one dated price observation is available/);
  assert.match(etfAnalysisSource, /Calendar gaps are not filled or interpolated/);
  assert.match(etfAnalysisSource, /primaryChartRetry\]/);
  assert.match(etfAnalysisSource, /compChartRetry\]/);
});

test("ETF comparison chart plots shared reported dates and explains insufficient overlap", () => {
  assert.match(etfAnalysisSource, /alignCandleSeriesOnSharedDates\(primaryCandles, compCandles\)/);
  assert.match(etfAnalysisSource, /primaryCandles=\{chartPrimaryCandles\}/);
  assert.match(etfAnalysisSource, /compCandles=\{hasSharedComparisonHistory \? sharedComparisonCandles\.comparison : undefined\}/);
  assert.match(etfAnalysisSource, /Price comparison unavailable: only \$\{sharedComparisonCandles\.dates\.length\} shared reported date/);
  assert.match(etfAnalysisSource, /Missing dates are not filled or interpolated/);
});

test("ETF AI commentary stays separate from the research score and grounded in supplied facts", () => {
  assert.match(etfAnalysisSource, /SectionCard collapsible title="AI COMMENTARY"/);
  assert.match(
    etfAnalysisSource,
    /AI commentary summarizes supplied fund data; it does not set the deterministic profile score/,
  );
  assert.match(
    etfAnalysisSource,
    /Missing benchmark, holdings, or tracking evidence is identified in the sourced sections; absence of evidence is not treated as a positive or negative finding/,
  );
  assert.match(etfAnalysisSource, /AI commentary is unavailable\. Review the sourced fund data below\./);
  assert.match(etfEndpointSource, /using only the supplied facts/);
  assert.match(etfEndpointSource, /Do not invent data/);
  assert.match(etfEndpointSource, /Do not give personalized advice or change scenario calculations/);
});

test("ETF comparison highlights meaningful shared-data gaps above full details", () => {
  const highlightsIndex = etfAnalysisSource.indexOf('testID="etf-comparison-highlights"');
  const fullDetailsIndex = etfAnalysisSource.indexOf('title="ETF COST, RISK & PERFORMANCE"');
  assert.ok(highlightsIndex >= 0 && fullDetailsIndex > highlightsIndex);
  assert.match(etfAnalysisSource, /Notable gaps in shared reported metrics—not an overall ranking/);
  assert.match(etfAnalysisSource, /comparisonHighlights\.length \? comparisonHighlights\.map/);
  assert.match(etfAnalysisSource, /comparisonMetricRows\.filter/);
});

test("ETF peer metadata in the API schema matches the mobile labels", () => {
  const peerAssetSchema = apiSchemaSource.match(
    /EtfPeerAssetSizeComparison:\n([\s\S]*?)(?=\n    EtfHolding:)/,
  )?.[1] ?? "";
  assert.match(peerAssetSchema, /category: \{ type: string \}/);
  assert.match(peerAssetSchema, /sampleContext: \{ type: string \}/);
  assert.match(peerAssetSchema, /source: \{ type: string \}/);
  assert.match(peerAssetSchema, /asOf: \{ type: string, format: date-time \}/);
  assert.match(apiSchemaSource, /peerAssetSizeComparison:\n\s+allOf:\n\s+- \$ref: "#\/components\/schemas\/EtfPeerAssetSizeComparison"\n\s+nullable: true/);
  assert.match(analysisRouteSource, /respondWithEtfAnalysis\(res, data/);
  assert.match(etfEndpointSource, /buildEtfPeerComparisonFields\(profile, asOf\)/);
  assert.match(etfEndpointSource, /\.\.\.peerComparisons/);
  assert.match(etfAnalysisSource, /component\.peerContext\.category/);
  assert.match(etfAnalysisSource, /component\.peerContext\.sampleContext/);
  assert.match(etfAnalysisSource, /component\.peerContext\.source/);
  assert.match(etfAnalysisSource, /sourceDate\(component\.peerContext\.asOf\)/);
});

test("ETF holdings and sector context in the API schema matches mobile disclosures", () => {
  const responseSchema = apiSchemaSource.match(
    /EtfAnalysis:\n([\s\S]*?)(?=\n    EtfScenario:)/,
  )?.[1] ?? "";
  const profileSchema = apiSchemaSource.match(
    /EtfProfile:\n([\s\S]*?)(?=\n    EtfBenchmarkReference:)/,
  )?.[1] ?? "";

  for (const schema of [responseSchema, profileSchema]) {
    assert.match(schema, /sectorWeights:\n\s+type: array/);
    assert.match(schema, /sectorWeightsRetrievedAt:\n\s+type: string\n\s+format: date-time\n\s+description: Provider sector snapshot retrieval time/);
    assert.match(schema, /topHoldingsReportedCount:\n\s+type: integer\n\s+minimum: 0\n\s+description: Number of positions reported by the provider/);
    assert.match(schema, /topHoldingsRetrievedAt:\n\s+type: string\n\s+format: date-time\n\s+description: Provider holdings snapshot retrieval time/);
    assert.match(schema, /sectorWeightsRetrievedAt/);
    assert.match(schema, /topHoldingsReportedCount/);
    assert.match(schema, /topHoldingsRetrievedAt/);
  }

  assert.match(etfAnalysisSource, /topHoldingsReportedCount: number;/);
  assert.match(etfAnalysisSource, /topHoldingsRetrievedAt: string;/);
  assert.match(etfAnalysisSource, /sectorWeights: \{ sector: string; weight: number \}\[\];/);
  assert.match(etfAnalysisSource, /sectorWeightsRetrievedAt: string;/);
  assert.match(etfAnalysisSource, /Provider-reported holdings positions/);
  assert.match(etfAnalysisSource, /Combined weight of reported holdings/);
  assert.match(etfAnalysisSource, /Provider snapshot retrieved \{new Date\(fund\.topHoldingsRetrievedAt\)\.toLocaleString\(\)\}/);
  assert.match(etfAnalysisSource, /the provider does not supply a holdings report date here/);
  assert.match(etfAnalysisSource, /\{fundEntry\.symbol\}: \{fundEntry\.topHoldingsReportedCount\} reported positions · retrieved/);
  assert.match(etfAnalysisSource, /\{fundEntry\.symbol\} sector data retrieved/);
});

test("ETF holding history is stored separately and shown without another comparison ticker", () => {
  const historyHeadingIndex = etfAnalysisSource.indexOf("Changes between provider snapshots");
  const comparisonResultsIndex = etfAnalysisSource.indexOf('title="ETF COST, RISK & PERFORMANCE"');
  assert.match(etfAnalysisSource, /ETF_HOLDING_SNAPSHOTS_KEY = '@stocksense\/etf_holding_snapshots_v1'/);
  assert.match(etfAnalysisSource, /upsertSavedEtfHoldingSnapshot/);
  assert.match(etfAnalysisSource, /createEtfHoldingSnapshot/);
  assert.ok(historyHeadingIndex >= 0 && historyHeadingIndex < comparisonResultsIndex);
  assert.match(etfAnalysisSource, /retrieval times, not holdings report dates/);
});

const scriptDir = dirname(fileURLToPath(import.meta.url));
const mobileDir = resolve(scriptDir, "..");
const require = createRequire(import.meta.url);
const reactNativeWebEntry = require.resolve("react-native-web", { paths: [mobileDir] });
const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

function browserExecutable() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  if (existsSync("/repl/tools/bin/chromium")) return "/repl/tools/bin/chromium";
  return "chromium";
}

function etfScreenResponse(expenseRatio = 0.0003) {
  const asOf = "2026-10-28T16:00:00.000Z";
  return {
    symbol: "VOO",
    companyName: expenseRatio == null ? "ETF with unavailable fee" : "Vanguard S&P 500 ETF",
    exchange: "NYSE Arca",
    currency: "USD",
    currentPrice: 600,
    priceChange: 2,
    priceChangePercent: 0.0033,
    volume: 1_000_000,
    marketCap: 500_000_000_000,
    week52High: 620,
    week52Low: 450,
    assetType: "etf",
    etfAnalysis: {
      fundCategory: "Large Blend",
      fundFamily: "Vanguard",
      expenseRatio,
      totalAssets: 500_000_000_000,
      dividendYield: 0.014,
      beta3Year: 1,
      averageVolume: 4_000_000,
      topHoldingsCombinedWeight: 0.3,
      topHoldingsReportedCount: 2,
      topHoldingsRetrievedAt: asOf,
      sectorWeights: [{ sector: "Technology", weight: 0.3 }],
      sectorWeightsRetrievedAt: asOf,
      annualizedReturn: 0.12,
      annualizedVolatility: 0.18,
      maxDrawdown: -0.2,
      riskAdjustedReturn: 0.67,
      topHoldings: [{ symbol: "AAPL", name: "Apple Inc.", weight: 0.08 }],
      benchmark: null,
      trackingComparison: null,
      peerExpenseComparison: null,
      peerAssetSizeComparison: null,
      marketRegime: null,
      scenarios: [{
        label: "Historical average",
        annualReturnAssumption: expenseRatio == null ? null : 0.1 - expenseRatio,
        noFeeAnnualReturnAssumption: 0.1,
        fiveYearValue: expenseRatio == null ? null : 965,
        tenYearValue: expenseRatio == null ? null : 1556,
        noFeeFiveYearValue: 965,
        noFeeTenYearValue: 1556,
        assumption: "Illustrative only.",
      }],
      analysis: "A diversified fund that tracks large U.S. companies.",
      risks: ["Market concentration"],
      strengths: ["Low annual fee"],
      provider: "Test provider",
      asOf,
    },
  };
}

const validTrackingComparison = {
  periodStart: "2025-01",
  periodEnd: "2025-12",
  monthlySamples: 12,
  fundAnnualizedReturn: 0.1,
  benchmarkAnnualizedReturn: 0.09,
  trackingDifference: 0.01,
  trackingError: 0.02,
  source: "Tracking fixture provider",
  asOf: "2026-10-28T16:00:00.000Z",
};
const trackingHistoryFixtures = [
  { name: "valid", trackingComparison: validTrackingComparison },
  { name: "missing-history", trackingComparison: null },
  {
    name: "missing-start",
    trackingComparison: { ...validTrackingComparison, periodStart: undefined },
  },
  {
    name: "missing-sample-count",
    trackingComparison: { ...validTrackingComparison, monthlySamples: undefined },
  },
  {
    name: "malformed-period",
    trackingComparison: { ...validTrackingComparison, periodStart: "2025-13" },
  },
  {
    name: "reversed-period",
    trackingComparison: {
      ...validTrackingComparison,
      periodStart: "2026-01",
      periodEnd: "2025-12",
    },
  },
  {
    name: "impossible-sample-count",
    trackingComparison: { ...validTrackingComparison, monthlySamples: 13 },
  },
];

async function buildAnalysisScreenBundle(expenseRatio, scenarioOverrides = {}) {
  const response = etfScreenResponse(expenseRatio);
  const savedCompareSymbols = scenarioOverrides.savedCompareSymbols ?? [];
  const initialStorage = savedCompareSymbols.length
    ? { "@stocksense/etf_comparison_symbols_v1": JSON.stringify(savedCompareSymbols) }
    : {};
  const comparisonResponse = savedCompareSymbols.length
    ? { ...etfScreenResponse(expenseRatio), symbol: savedCompareSymbols[0], companyName: `${savedCompareSymbols[0]} comparison ETF` }
    : null;
  if (comparisonResponse) {
    comparisonResponse.etfAnalysis.expenseRatio = 0.002;
    comparisonResponse.etfAnalysis.annualizedReturn = 0.18;
    comparisonResponse.etfAnalysis.annualizedVolatility = 0.25;
    comparisonResponse.etfAnalysis.maxDrawdown = -0.3;
    comparisonResponse.etfAnalysis.dividendYield = 0.03;
    comparisonResponse.etfAnalysis.beta3Year = 1.3;
    comparisonResponse.etfAnalysis.totalAssets = 100_000_000_000;
  }
  if (Object.hasOwn(scenarioOverrides, "trackingComparison")) {
    const benchmark = {
      symbol: "SPY",
      name: "S&P 500",
      source: "Tracking fixture provider",
      asOf: "2026-10-28T16:00:00.000Z",
    };
    response.etfAnalysis.benchmark = benchmark;
    response.etfAnalysis.trackingComparison = scenarioOverrides.trackingComparison;
    if (comparisonResponse) {
      comparisonResponse.etfAnalysis.benchmark = benchmark;
      comparisonResponse.etfAnalysis.trackingComparison =
        Object.hasOwn(scenarioOverrides, "comparisonTrackingComparison")
          ? scenarioOverrides.comparisonTrackingComparison
          : scenarioOverrides.trackingComparison;
    }
  }
  if (scenarioOverrides.omitScenarios) {
    delete response.etfAnalysis.scenarios;
  } else if (Object.hasOwn(scenarioOverrides, "scenarios")) {
    response.etfAnalysis.scenarios = scenarioOverrides.scenarios;
  }
  const mockModules = new Map([
    ["@react-native-async-storage/async-storage", `
      const values = new Map(Object.entries(${JSON.stringify(initialStorage)}));
      window.__analysisTestStorage = values;
      export default {
        getItem: async (key) => values.get(key) ?? null,
        setItem: async (key, value) => { values.set(key, value); },
        removeItem: async () => {},
      };
    `],
    ["expo-router", `
      window.__analysisNavigation = [];
      export const useLocalSearchParams = () => ({ symbol: "VOO" });
      export const useRouter = () => ({
        back: () => {},
        push: (route) => window.__analysisNavigation.push(route),
      });
    `],
    ["react-native-safe-area-context", `
      export const useSafeAreaInsets = () => ({ top: 0, bottom: 0, left: 0, right: 0 });
    `],
    ["@expo/vector-icons", `
      export const Feather = () => null;
      export const Ionicons = () => null;
      export const MaterialCommunityIcons = () => null;
    `],
    ["expo-haptics", `
      export const ImpactFeedbackStyle = { Light: "light" };
      export const impactAsync = async () => {};
    `],
    ["expo-linear-gradient", `
      import React from "react";
      export const LinearGradient = ({ children }) => <>{children}</>;
    `],
    ["@workspace/api-client-react", `
      const response = ${JSON.stringify(response)};
      export function useAnalyzeStock() {
        return { mutate: () => {}, data: response, isPending: false, error: null };
      }
    `],
    ["@/hooks/useColors", `
      export function useColors() {
        return {
          background: "#10151C", card: "#1A222C", input: "#1A222C",
          secondary: "#29333F", accent: "#253548", border: "#405061",
          foreground: "#EAF0F6", heading: "#FFFFFF", mutedForeground: "#9AA9B8",
          primary: "#D4A847", primaryForeground: "#10151C", muted: "#29333F",
          buyColor: "#65C98B", buyBg: "#173D2C", sellColor: "#F07C79",
          sellBg: "#482829", holdColor: "#B7C4D1", holdBg: "#29333F",
        };
      }
    `],
    ["@/hooks/useApi", `
      const comparisonResponse = ${JSON.stringify(comparisonResponse)};
      window.__analysisChartRequests = [];
      let chartFailureCount = 0;
      const apiFetch = async (_url, options) => {
        if (_url.startsWith("/api/stocks/chart/")) {
          window.__analysisChartRequests.push(_url);
          if (${JSON.stringify(Boolean(scenarioOverrides.chartFailureOnce))} && chartFailureCount === 0) {
            chartFailureCount += 1;
            throw new Error("Fixture chart request failed.");
          }
          return { candles: [
            { t: 1792972800000, date: "2026-10-26", o: 100, h: 102, l: 99, c: 101, v: 1000 },
            { t: 1793059200000, date: "2026-10-27", o: 101, h: 104, l: 100, c: 103, v: 1200 },
            { t: 1793318400000, date: "2026-10-30", o: 103, h: 105, l: 102, c: 104, v: 900 },
          ] };
        }
        const candidate = options?.body ? JSON.parse(options.body).symbol : null;
        return candidate && candidate === comparisonResponse?.symbol
          ? comparisonResponse
          : { candles: [] };
      };
      export function useApi() {
        return { apiFetch };
      }
    `],
    ["@/contexts/AmericanModeContext", `
      export function useAmericanMode() {
        return {
          isActive: false, neonGucciActive: false,
          brew: { neonGucciPhrasesActive: false },
        };
      }
    `],
    ["@/contexts/AchievementsContext", `
      export function useAchievements() {
        return { awardAchievement: async () => {} };
      }
    `],
    ["@/hooks/useWatchlist", `
      export function useWatchlist() {
        return {
          isWatched: () => false, activeAlertFor: () => null,
          add: async () => {}, remove: async () => {},
          saveAlert: async () => {}, deleteAlert: async () => {},
        };
      }
    `],
    ["@/hooks/usePushNotifications", `
      export function usePushNotifications() {
        return {
          pushToken: null, status: "unavailable", registrationError: null,
          requestPermission: async () => {}, openNotificationSettings: async () => {},
        };
      }
    `],
    ["@/components/ComparisonChart", `
      import React from "react";
      import { View, Text } from "react-native";
      export const ComparisonChart = ({ primaryCandles, primarySymbol, compSymbol }) => (
        <View testID="etf-chart-test-render">
          <Text testID="etf-chart-test-series">
            {primarySymbol + ":" + primaryCandles.map((candle) => candle.date + ":" + candle.c).join("|") + (compSymbol ? " vs " + compSymbol : "")}
          </Text>
        </View>
      );
    `],
    ["@/components/AmericanSteelBackground", `
      import React from "react";
      export function AmericanSteelBackground({ children }) {
        return <>{children}</>;
      }
    `],
    ["@/components/NeonAnalysisLoader", `
      export const NeonAnalysisLoader = () => null;
    `],
    ["@/components/PriceAlertModal", `
      export const PriceAlertModal = () => null;
    `],
  ]);

  const result = await build({
    stdin: {
      contents: `
        import React from "react";
        import { createRoot } from "react-dom/client";
        import AnalysisScreen from ${JSON.stringify(join(mobileDir, "app/analysis/[symbol].tsx"))};
        const root = document.getElementById("root");
        if (!root) throw new Error("Analysis browser test root was not found.");
        createRoot(root).render(<AnalysisScreen />);
      `,
      resolveDir: mobileDir,
      sourcefile: "analysis-browser-entry.tsx",
      loader: "tsx",
    },
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2022",
    jsx: "automatic",
    mainFields: ["browser", "module", "main"],
    conditions: ["browser"],
    plugins: [{
      name: "analysis-browser-test-aliases",
      setup(buildApi) {
        buildApi.onResolve({ filter: /^react-native$/ }, () => ({ path: reactNativeWebEntry }));
        buildApi.onResolve({ filter: /^@\// }, ({ path }) => {
          if (mockModules.has(path)) return { path, namespace: "analysis-mock" };
          const sourcePath = resolve(mobileDir, path.slice(2));
          const extension = [".tsx", ".ts", ".jsx", ".js"]
            .find((candidate) => existsSync(`${sourcePath}${candidate}`));
          return extension
            ? { path: `${sourcePath}${extension}` }
            : { errors: [{ text: `Unable to resolve ${path}.` }] };
        });
        buildApi.onResolve({ filter: /.*/ }, ({ path }) => (
          mockModules.has(path) ? { path, namespace: "analysis-mock" } : null
        ));
        buildApi.onLoad({ filter: /.*/, namespace: "analysis-mock" }, ({ path }) => ({
          contents: mockModules.get(path),
          loader: "tsx",
          resolveDir: mobileDir,
        }));
      },
    }],
  });
  return result.outputFiles[0].text;
}

async function waitForDebuggerPort(profileDir, chrome, stderr) {
  const portFile = join(profileDir, "DevToolsActivePort");
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try {
      const [port] = (await readFile(portFile, "utf8")).trim().split("\n");
      return Number(port);
    } catch {
      if (chrome.exitCode !== null) {
        throw new Error(`Chromium exited before opening its debugging port.\n${stderr()}`);
      }
      await delay(40);
    }
  }
  throw new Error(`Timed out waiting for Chromium's debugging port.\n${stderr()}`);
}

function connectDebugger(webSocketUrl) {
  return new Promise((resolveConnection, rejectConnection) => {
    const socket = new WebSocket(webSocketUrl);
    const waiting = new Map();
    let nextId = 0;
    socket.addEventListener("open", () => resolveConnection({
      socket,
      send(method, params = {}) {
        const id = ++nextId;
        return new Promise((resolveMessage, rejectMessage) => {
          waiting.set(id, { resolveMessage, rejectMessage });
          socket.send(JSON.stringify({ id, method, params }));
        });
      },
      evaluate(expression) {
        return this.send("Runtime.evaluate", {
          expression, awaitPromise: true, returnByValue: true,
        }).then((reply) => {
          if (reply.result.exceptionDetails) {
          throw new Error(
            `${reply.result.exceptionDetails.exception?.description
              ?? reply.result.exceptionDetails.text
              ?? "Browser evaluation failed."} (expression: ${expression})`,
          );
          }
          return reply.result.result.value;
        }).catch((error) => {
          throw new Error(`${error instanceof Error ? error.message : String(error)} (expression: ${expression})`);
        });
      },
      async close() {
        if (socket.readyState === WebSocket.CLOSED) return;
        const closed = new Promise((resolveClose) => {
          socket.addEventListener("close", resolveClose, { once: true });
        });
        socket.close();
        await Promise.race([closed, delay(1000)]);
      },
    }));
    socket.addEventListener("error", rejectConnection, { once: true });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id === undefined) return;
      const pending = waiting.get(message.id);
      if (!pending) return;
      waiting.delete(message.id);
      if (message.error) pending.rejectMessage(new Error(message.error.message));
      else pending.resolveMessage(message);
    });
  });
}

async function waitForBrowserValue(browser, expression, message, timeout = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await browser.evaluate(expression)) return;
    await delay(40);
  }
  throw new Error(message);
}

test("rendered ETF detail and comparison hide invalid tracking history", async () => {
  const trackingFixtureBundles = await Promise.all(
    trackingHistoryFixtures.map(async (fixture) => [
      `/bundle-tracking-${fixture.name}.js`,
      await buildAnalysisScreenBundle(undefined, {
        savedCompareSymbols: ["VTI"],
        trackingComparison: fixture.trackingComparison,
      }),
    ]),
  );
  const bundlePaths = Object.fromEntries(
    trackingHistoryFixtures.map((fixture) => [
      `/tracking-${fixture.name}`,
      `/bundle-tracking-${fixture.name}.js`,
    ]),
  );
  const server = createServer((request, response) => {
    const bundles = Object.fromEntries(trackingFixtureBundles);
    if (Object.hasOwn(bundles, request.url)) {
      response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      response.end(bundles[request.url]);
      return;
    }
    const scriptPath = bundlePaths[request.url] ?? bundlePaths["/tracking-valid"];
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(`<!doctype html><html><head>
      <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
      <style>html,body,#root{width:100%;height:100%;margin:0;padding:0}#root{display:flex;flex-direction:column}</style>
      </head><body><div id="root"></div><script src="${scriptPath}"></script></body></html>`);
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });

  const profileDir = await mkdtemp(join(tmpdir(), "analysis-tracking-browser-"));
  let chromeStderr = "";
  const chrome = spawn(browserExecutable(), [
    "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
    "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0",
    `--user-data-dir=${profileDir}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  chrome.stderr.setEncoding("utf8");
  chrome.stderr.on("data", (chunk) => { chromeStderr = (chromeStderr + chunk).slice(-5000); });

  let browser;
  try {
    const debugPort = await waitForDebuggerPort(profileDir, chrome, () => chromeStderr);
    const targets = await fetch(`http://127.0.0.1:${debugPort}/json`).then((result) => result.json());
    const page = targets.find((target) => target.type === "page");
    assert.ok(page?.webSocketDebuggerUrl, "Chromium must expose a page target.");
    browser = await connectDebugger(page.webSocketDebuggerUrl);
    await browser.send("Page.enable");
    await browser.send("Runtime.enable");
    await browser.send("Emulation.setDeviceMetricsOverride", {
      width: 320, height: 720, deviceScaleFactor: 1, mobile: true,
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const detailTrackingSection = '[data-testid="analysis-section-benchmark-tracking"]';
    const comparisonTrackingSection = '[data-testid="analysis-section-etf-cost-risk-performance"]';

    for (const fixture of trackingHistoryFixtures) {
      await browser.send("Page.navigate", {
        url: `http://127.0.0.1:${address.port}/tracking-${fixture.name}`,
      });
      await waitForBrowserValue(
        browser,
        `document.body?.innerText?.includes("At a glance") ?? false`,
        `The ${fixture.name} tracking fixture should render the ETF detail screen.`,
      );
      await waitForBrowserValue(
        browser,
        `document.body?.innerText?.includes("ETF COST, RISK & PERFORMANCE") ?? false`,
        `The ${fixture.name} tracking fixture should render its comparison screen.`,
      );
      const isValid = fixture.name === "valid";
      assert.equal(
        await browser.evaluate(`Boolean(document.querySelector(${JSON.stringify(detailTrackingSection)}))`),
        isValid,
        `ETF detail should ${isValid ? "show" : "hide"} the ${fixture.name} tracking section.`,
      );

      await browser.evaluate(`document.querySelector(${JSON.stringify(detailTrackingSection)})?.click()`);
      if (isValid) {
        await waitForBrowserValue(
          browser,
          `document.querySelector(${JSON.stringify(detailTrackingSection)})?.parentElement?.textContent.includes("Adjusted monthly returns")`,
          "Valid ETF detail history should remain visible when expanded.",
        );
        const detailTrackingText = await browser.evaluate(
          `document.querySelector(${JSON.stringify(detailTrackingSection)})?.parentElement?.textContent ?? ""`,
        );
        assert.match(detailTrackingText, /2025-01–2025-12 · 12 monthly samples/);
      }

      await browser.evaluate(`document.querySelector(${JSON.stringify(comparisonTrackingSection)})?.click()`);
      await waitForBrowserValue(
        browser,
        `document.querySelector(${JSON.stringify(comparisonTrackingSection)})?.parentElement?.textContent.includes("VTI")`,
        `The ${fixture.name} ETF comparison should be available when expanded.`,
      );
      const comparisonTrackingText = await browser.evaluate(
        `document.querySelector(${JSON.stringify(comparisonTrackingSection)})?.parentElement?.textContent ?? ""`,
      );
      if (isValid) {
        assert.match(comparisonTrackingText, /Tracking history: 2025-01–2025-12 · 12 monthly samples/);
        assert.match(comparisonTrackingText, /Tracking difference/);
      } else {
        assert.doesNotMatch(comparisonTrackingText, /Tracking history:/);
        assert.doesNotMatch(comparisonTrackingText, /Tracking difference|Annualized tracking error/);
        for (const rawValue of [
          fixture.trackingComparison?.periodStart,
          fixture.trackingComparison?.periodEnd,
          fixture.trackingComparison?.monthlySamples == null
            ? null
            : `${fixture.trackingComparison.monthlySamples} monthly samples`,
        ]) {
          if (rawValue != null) {
            assert.ok(
              !comparisonTrackingText.includes(String(rawValue)),
              `Invalid ${fixture.name} metadata must not render in verified comparison history: ${rawValue}`,
            );
          }
        }
      }
    }
  } finally {
    await browser?.close();
    if (chrome.exitCode === null && chrome.signalCode === null) {
      const exited = new Promise((resolveExit) => chrome.once("exit", resolveExit));
      chrome.kill("SIGTERM");
      const didExit = await Promise.race([
        exited.then(() => true),
        delay(2000).then(() => false),
      ]);
      if (!didExit) {
        chrome.kill("SIGKILL");
        await exited;
      }
    }
    await new Promise((resolveClose) => server.close(resolveClose));
    await rm(profileDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

test("ETF analysis sections render, expand, and collapse without 320px overflow", async () => {
  const bundle = await buildAnalysisScreenBundle();
  const chartRetryBundle = await buildAnalysisScreenBundle(0.0003, { chartFailureOnce: true });
  const comparisonBundle = await buildAnalysisScreenBundle(undefined, {
    savedCompareSymbols: ["VTI"],
  });
  const unavailableFeeBundle = await buildAnalysisScreenBundle(null);
  const missingScenariosBundle = await buildAnalysisScreenBundle(0.0003, { omitScenarios: true });
  const malformedScenariosBundle = await buildAnalysisScreenBundle(0.0003, { scenarios: { label: "Broken" } });
  const server = createServer((request, response) => {
    const bundles = {
      "/bundle.js": bundle,
      "/bundle-chart-retry.js": chartRetryBundle,
      "/bundle-comparison.js": comparisonBundle,
      "/bundle-unavailable-fee.js": unavailableFeeBundle,
      "/bundle-missing-scenarios.js": missingScenariosBundle,
      "/bundle-malformed-scenarios.js": malformedScenariosBundle,
    };
    if (Object.hasOwn(bundles, request.url)) {
      response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      response.end(bundles[request.url]);
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    const scriptPath = {
      "/comparison": "/bundle-comparison.js",
      "/chart-retry": "/bundle-chart-retry.js",
      "/unavailable-fee": "/bundle-unavailable-fee.js",
      "/missing-scenarios": "/bundle-missing-scenarios.js",
      "/malformed-scenarios": "/bundle-malformed-scenarios.js",
    }[request.url] ?? "/bundle.js";
    response.end(`<!doctype html><html><head>
      <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
      <style>html,body,#root{width:100%;height:100%;margin:0;padding:0}#root{display:flex;flex-direction:column}body{overflow-x:auto}</style>
      </head><body><div id="root"></div><script src="${scriptPath}"></script></body></html>`);
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });

  const profileDir = await mkdtemp(join(tmpdir(), "analysis-browser-"));
  let chromeStderr = "";
  const chrome = spawn(browserExecutable(), [
    "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
    "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0",
    `--user-data-dir=${profileDir}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  chrome.stderr.setEncoding("utf8");
  chrome.stderr.on("data", (chunk) => { chromeStderr = (chromeStderr + chunk).slice(-5000); });

  let browser;
  try {
    const debugPort = await waitForDebuggerPort(profileDir, chrome, () => chromeStderr);
    const targets = await fetch(`http://127.0.0.1:${debugPort}/json`).then((result) => result.json());
    const page = targets.find((target) => target.type === "page");
    assert.ok(page?.webSocketDebuggerUrl, "Chromium must expose a page target.");
    browser = await connectDebugger(page.webSocketDebuggerUrl);
    await browser.send("Page.enable");
    await browser.send("Runtime.enable");
    await browser.send("Emulation.setDeviceMetricsOverride", {
      width: 320, height: 720, deviceScaleFactor: 1, mobile: true,
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    await browser.send("Page.navigate", { url: `http://127.0.0.1:${address.port}/` });

    await waitForBrowserValue(
      browser,
      "document.body?.innerText.includes('At a glance')",
      "The real ETF analysis screen did not render its overview.",
    );
    await waitForBrowserValue(
      browser,
      `Boolean(document.querySelector('[data-testid="etf-chart-test-render"]'))`,
      "ETF price history should render from dated provider candles.",
    );
    assert.match(
      await browser.evaluate(`document.querySelector('[data-testid="etf-chart-test-series"]')?.textContent ?? ""`),
      /VOO:2026-10-26:101\|2026-10-27:103\|2026-10-30:104/,
      "The chart should receive real dated candle values without filling calendar gaps.",
    );
    assert.equal(
      await browser.evaluate(`document.body?.innerText.includes("Calendar gaps are not filled or interpolated.")`),
      true,
      "The chart should disclose that missing dates are not interpolated.",
    );
    await browser.evaluate(`document.querySelector('[data-testid="etf-chart-period-1y"]')?.click()`);
    await waitForBrowserValue(
      browser,
      `window.__analysisChartRequests?.some((url) => url.includes("period=1y"))`,
      "Selecting a chart range should request that supported period.",
    );
    assert.equal(
      await browser.evaluate(`window.__analysisChartRequests?.filter((url) => url.includes("period=1y")).length`),
      1,
      "A range selection should issue one chart request, not duplicates.",
    );
    const sectionState = await browser.evaluate(`Array.from(
      document.querySelectorAll('[data-testid^="analysis-section-"]'),
      (section) => ({ id: section.dataset.testid, cardText: section.parentElement.textContent })
    )`);
    assert.ok(sectionState.length >= 7, "All ETF detail sections should render.");
    const collapsedEvidence = [
      "AI commentary summarizes supplied fund data",
      "Missing components are excluded",
      "Expense ratio",
      "Benchmark unavailable.",
      "Category expense comparison unavailable.",
      "Apple Inc. (AAPL)",
      "Historical regime data unavailable.",
      "These are historical-regime illustrations",
    ];
    assert.ok(
      collapsedEvidence.every((evidence) => !sectionState.some((section) => section.cardText.includes(evidence))),
      `Every ETF evidence section should start collapsed: ${JSON.stringify(sectionState)}`,
    );
    assert.equal(
      await browser.evaluate(
        "document.documentElement.scrollWidth <= window.innerWidth && document.body.scrollWidth <= window.innerWidth",
      ),
      true,
      "The ETF analysis screen must not overflow horizontally at 320px.",
    );

    const sectionId = "analysis-section-fund-profile-risk";
    const sectionSelector = `[data-testid="${sectionId}"]`;
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(sectionSelector)})?.parentElement?.textContent.includes("Expense ratio")`),
      false,
      "Collapsed fund-profile evidence must not be visible.",
    );
    await browser.evaluate(`(() => {
      const section = document.querySelector(${JSON.stringify(sectionSelector)});
      section?.scrollIntoView({ block: "nearest", inline: "nearest" });
      section?.click();
    })()`);
    await waitForBrowserValue(
      browser,
      `document.querySelector(${JSON.stringify(sectionSelector)})?.parentElement?.textContent.includes("Expense ratio")`,
      "Tapping the fund-profile section should expand it.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(sectionSelector)})?.parentElement?.textContent.includes("Expense ratio")`),
      true,
      "Opening a section should reveal its fund evidence.",
    );
    assert.equal(
      await browser.evaluate(
        "document.documentElement.scrollWidth <= window.innerWidth && document.body.scrollWidth <= window.innerWidth",
      ),
      true,
      "Expanded ETF evidence must not overflow horizontally at 320px.",
    );

    await browser.evaluate(`document.querySelector(${JSON.stringify(sectionSelector)})?.click()`);
    await waitForBrowserValue(
      browser,
      `!document.querySelector(${JSON.stringify(sectionSelector)})?.parentElement?.textContent.includes("Expense ratio")`,
      "Tapping an expanded section again should collapse it.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(sectionSelector)})?.parentElement?.textContent.includes("Expense ratio")`),
      false,
      "Collapsing a section should hide its evidence again.",
    );

    const scenarioSectionSelector = '[data-testid="analysis-section-long-range-scenarios"]';
    await browser.evaluate(`(() => {
      const section = document.querySelector(${JSON.stringify(scenarioSectionSelector)});
      section?.scrollIntoView({ block: "nearest", inline: "nearest" });
      section?.click();
    })()`);
    await waitForBrowserValue(
      browser,
      `document.querySelector(${JSON.stringify(scenarioSectionSelector)})?.parentElement?.textContent.includes("Annual expense ratio used")`,
      "Opening the scenarios section should reveal its applied annual fee.",
    );
    const scenarioCardText = await browser.evaluate(
      `document.querySelector(${JSON.stringify(scenarioSectionSelector)})?.parentElement?.textContent ?? ""`,
    );
    assert.match(scenarioCardText, /Annual expense ratio used\s*0\.03%/);
    assert.match(scenarioCardText, /No-fee annual return\s*10\.00%/);
    assert.match(scenarioCardText, /After-fee annual return\s*9\.97%/);
    assert.match(scenarioCardText, /No-fee value in 10 years\s*\$259\.37/);
    assert.match(scenarioCardText, /After-fee value in 10 years\s*\$258\.67/);
    assert.match(scenarioCardText, /Starting investment\s*\$100\.00/);
    assert.match(scenarioCardText, /Total contributions\s*\$0\.00/);
    assert.match(scenarioCardText, /Deposited at the end of each month/);
    for (const cadence of ["weekly", "monthly", "quarterly"]) {
      assert.ok(
        scenarioCardText.includes(cadence.charAt(0).toUpperCase() + cadence.slice(1)),
        `The contribution schedule selector should offer ${cadence} deposits.`,
      );
    }
    await browser.evaluate(`(() => {
      const input = document.querySelector('[data-testid="etf-scenario-contribution-input"]');
      input?.focus();
      input?.setSelectionRange(0, input.value.length);
    })()`);
    await browser.send("Input.insertText", { text: "25" });
    await waitForBrowserValue(
      browser,
      `document.querySelector(${JSON.stringify(scenarioSectionSelector)})?.parentElement?.textContent.includes("Total contributions$3,000.00")`,
      "Changing the contribution amount should update the displayed deposit total.",
    );
    await browser.evaluate(`document.querySelector('[data-testid="etf-scenario-cadence-weekly"]')?.click()`);
    await waitForBrowserValue(
      browser,
      `document.querySelector(${JSON.stringify(scenarioSectionSelector)})?.parentElement?.textContent.includes("Total contributions$13,000.00")`,
      "Selecting weekly should update the displayed contribution total.",
    );
    await browser.evaluate(`document.querySelector('[data-testid="etf-scenario-cadence-monthly"]')?.click()`);
    await waitForBrowserValue(
      browser,
      `document.querySelector(${JSON.stringify(scenarioSectionSelector)})?.parentElement?.textContent.includes("Total contributions$3,000.00")`,
      "Selecting monthly should restore the monthly contribution total.",
    );
    assert.match(scenarioCardText, /1 yr.*3 yr.*5 yr.*10 yr.*20 yr/);
    await browser.evaluate(`document.querySelector('[data-testid="etf-scenario-horizon-5"]')?.click()`);
    await waitForBrowserValue(
      browser,
      `document.querySelector(${JSON.stringify(scenarioSectionSelector)})?.parentElement?.textContent.includes("Total contributions$1,500.00")`,
      "Selecting a horizon should update the displayed contribution values.",
    );
    const fiveYearScenarioText = await browser.evaluate(
      `document.querySelector(${JSON.stringify(scenarioSectionSelector)})?.parentElement?.textContent ?? ""`,
    );
    assert.match(fiveYearScenarioText, /No-fee value in 5 years\s*\$2,075\.08/);
    assert.match(fiveYearScenarioText, /After-fee value in 5 years\s*\$2,073\.48/);
    assert.match(fiveYearScenarioText, /Starting investment\s*\$100\.00/);
    assert.match(fiveYearScenarioText, /Total contributions\s*\$1,500\.00/);
    assert.match(fiveYearScenarioText, /No-fee projected growth in 5 years\s*\$475\.08/);
    assert.match(fiveYearScenarioText, /After-fee projected growth in 5 years\s*\$473\.48/);

    const feeImpactSelector = '[data-testid="analysis-section-etf-fee-dollar-impact"]';
    await browser.evaluate(`(() => {
      const section = document.querySelector(${JSON.stringify(feeImpactSelector)});
      section?.scrollIntoView({ block: "nearest" });
      section?.click();
    })()`);
    await waitForBrowserValue(
      browser,
      `document.querySelector(${JSON.stringify(feeImpactSelector)})?.parentElement?.textContent.includes("Estimated fees over 10 years")`,
      "Opening the fee impact section should show the estimate.",
    );
    let feeImpactText = await browser.evaluate(
      `document.querySelector(${JSON.stringify(feeImpactSelector)})?.parentElement?.textContent ?? ""`,
    );
    assert.match(feeImpactText, /Provider-reported expense ratio\s*0\.03%/);
    assert.match(feeImpactText, /Estimated fees over 10 years\s*\$30\.00/);
    await browser.evaluate(`document.querySelector('[data-testid="etf-fee-impact-amount-5000"]')?.click()`);
    await waitForBrowserValue(
      browser,
      `document.querySelector(${JSON.stringify(feeImpactSelector)})?.parentElement?.textContent.includes("$15.00")`,
      "Changing the investment amount should update estimated fees.",
    );
    await browser.evaluate(`document.querySelector('[data-testid="etf-fee-impact-horizon-5"]')?.click()`);
    await waitForBrowserValue(
      browser,
      `document.querySelector(${JSON.stringify(feeImpactSelector)})?.parentElement?.textContent.includes("Estimated fees over 5 years")`,
      "Changing the holding period should update the fee estimate.",
    );
    feeImpactText = await browser.evaluate(
      `document.querySelector(${JSON.stringify(feeImpactSelector)})?.parentElement?.textContent ?? ""`,
    );
    assert.match(feeImpactText, /Estimated fees over 5 years\s*\$7\.50/);

    await browser.send("Page.navigate", { url: `http://127.0.0.1:${address.port}/unavailable-fee` });
    await waitForBrowserValue(
      browser,
      "document.body?.innerText.includes('ETF with unavailable fee')",
      "The ETF analysis screen should render with an unavailable fee.",
    );
    await browser.evaluate(`(() => {
      const section = document.querySelector(${JSON.stringify(feeImpactSelector)});
      section?.scrollIntoView({ block: "nearest" });
      section?.click();
    })()`);
    await waitForBrowserValue(
      browser,
      `document.querySelector(${JSON.stringify(feeImpactSelector)})?.parentElement?.textContent.includes("Fee estimate unavailable")`,
      "Missing expense-ratio data should show an unavailable fee estimate.",
    );
    const unavailableFeeImpactText = await browser.evaluate(
      `document.querySelector(${JSON.stringify(feeImpactSelector)})?.parentElement?.textContent ?? ""`,
    );
    assert.match(unavailableFeeImpactText, /Provider-reported expense ratio\s*Unavailable/);
    assert.match(unavailableFeeImpactText, /Estimated fees over 10 years\s*Unavailable/);
    assert.doesNotMatch(unavailableFeeImpactText, /Estimated fees over 10 years\s*\$0\.00/);
    await browser.evaluate(`(() => {
      const section = document.querySelector(${JSON.stringify(scenarioSectionSelector)});
      section?.scrollIntoView({ block: "nearest", inline: "nearest" });
      section?.click();
    })()`);
    await waitForBrowserValue(
      browser,
      `document.querySelector(${JSON.stringify(scenarioSectionSelector)})?.parentElement?.textContent.includes("Annual expense ratio used")`,
      "Opening the scenarios section should reveal unavailable fee data.",
    );
    const unavailableScenarioText = await browser.evaluate(
      `document.querySelector(${JSON.stringify(scenarioSectionSelector)})?.parentElement?.textContent ?? ""`,
    );
    assert.match(unavailableScenarioText, /Annual expense ratio used\s*Unavailable/);
    assert.match(unavailableScenarioText, /No-fee annual return\s*10\.00%/);
    assert.match(unavailableScenarioText, /After-fee annual return\s*Unavailable/);
    assert.match(unavailableScenarioText, /After-fee value in 10 years\s*Unavailable/);
    assert.match(unavailableScenarioText, /No-fee value in 10 years\s*\$259\.37/);
    await browser.evaluate(`document.querySelector('[data-testid="etf-scenario-horizon-5"]')?.click()`);
    await waitForBrowserValue(
      browser,
      `document.querySelector(${JSON.stringify(scenarioSectionSelector)})?.parentElement?.textContent.includes("No-fee value in 5 years")`,
      "A missing expense ratio should remain unavailable at the selected horizon.",
    );
    const unavailableFiveYearText = await browser.evaluate(
      `document.querySelector(${JSON.stringify(scenarioSectionSelector)})?.parentElement?.textContent ?? ""`,
    );
    assert.match(unavailableFiveYearText, /After-fee value in 5 years\s*Unavailable/);
    assert.match(unavailableFiveYearText, /No-fee value in 5 years\s*\$161\.05/);

    for (const path of ["/missing-scenarios", "/malformed-scenarios"]) {
      await browser.send("Page.navigate", { url: `http://127.0.0.1:${address.port}${path}` });
      await waitForBrowserValue(
        browser,
        "document.body?.innerText.includes('At a glance')",
        `The ETF analysis screen should render for ${path}.`,
      );
      await browser.evaluate(`(() => {
        const section = document.querySelector(${JSON.stringify(scenarioSectionSelector)});
        section?.scrollIntoView({ block: "nearest" });
        section?.click();
      })()`);
      await waitForBrowserValue(
        browser,
        `document.querySelector(${JSON.stringify(scenarioSectionSelector)})?.parentElement?.textContent.includes("Long-range scenario data unavailable.")`,
        `The scenarios section should show its unavailable state for ${path}.`,
      );
      const fallbackText = await browser.evaluate(
        `document.querySelector(${JSON.stringify(scenarioSectionSelector)})?.parentElement?.textContent ?? ""`,
      );
      assert.match(fallbackText, /Long-range scenario data unavailable\./);
      assert.doesNotMatch(fallbackText, /No-fee annual return/);
    }

    await browser.send("Page.navigate", { url: `http://127.0.0.1:${address.port}/comparison` });
    await waitForBrowserValue(
      browser,
      "document.body?.innerText.includes('ETF COST, RISK & PERFORMANCE')",
      "The saved comparison ETF should be restored before testing navigation.",
    );
    await waitForBrowserValue(
      browser,
      "document.querySelector('[data-testid=\"etf-comparison-highlights\"]')?.textContent.includes('Key differences across compared ETFs')",
      "The comparison highlights should appear near the top after restoring a comparison ETF.",
    );
    const highlightText = await browser.evaluate(
      `document.querySelector('[data-testid="etf-comparison-highlights"]')?.textContent ?? ""`,
    );
    assert.match(highlightText, /VOO 0\.03%\s*→\s*VTI 0\.20%/);
    assert.match(highlightText, /VOO 12\.00%\s*→\s*VTI 18\.00%/);
    assert.match(highlightText, /VOO 18\.00%\s*→\s*VTI 25\.00%/);
    assert.doesNotMatch(highlightText, /1-year maximum drawdown/);
    assert.equal(
      await browser.evaluate(`(() => {
        const summary = document.querySelector('[data-testid="etf-comparison-highlights"]');
        const fullDetails = document.querySelector('[data-testid="analysis-section-etf-cost-risk-performance"]');
        return summary && fullDetails
          ? summary.getBoundingClientRect().top < fullDetails.getBoundingClientRect().top
          : false;
      })()`),
      true,
      "The summary should appear above the full comparison details.",
    );
    assert.equal(
      await browser.evaluate(`Array.from(document.querySelectorAll('[data-testid^="etf-section-nav-"]')).length`),
      6,
      "ETF analysis should render all six section navigation controls.",
    );
    const navAndAnchorOrder = await browser.evaluate(`(() => {
      const navOrder = Array.from(document.querySelectorAll('[data-testid^="etf-section-nav-"]'))
        .map((node) => node.getAttribute("data-testid").replace("etf-section-nav-", ""));
      const anchorOrder = Array.from(document.querySelectorAll('[data-testid^="etf-section-"]'))
        .map((node) => node.getAttribute("data-testid"))
        .filter((testID) => !testID.startsWith("etf-section-nav-"))
        .map((testID) => testID.replace("etf-section-", ""));
      return { navOrder, anchorOrder };
    })()`);
    assert.deepEqual(
      navAndAnchorOrder.navOrder,
      navAndAnchorOrder.anchorOrder,
      "The section tabs should follow the same order as their content while scrolling.",
    );
    await browser.evaluate(`document.querySelector('[data-testid="etf-section-nav-projections"]')?.click()`);
    await waitForBrowserValue(
      browser,
      `document.querySelector('[data-testid="etf-section-nav-projections"]')?.getAttribute('aria-label') === 'Selected section: Future Projections'`,
      "Choosing a section should update its selected accessible label.",
    );
    await waitForBrowserValue(
      browser,
      `document.querySelector('[data-testid="etf-section-projections"]')?.getBoundingClientRect().top < 700`,
      "Choosing a section should scroll the report to its content.",
    );

    await browser.evaluate(`document.querySelector('[data-testid="analysis-section-etf-cost-risk-performance"]')?.scrollIntoView({ block: "nearest" })`);
    await browser.evaluate(`document.querySelector('[data-testid="analysis-section-etf-cost-risk-performance"]')?.click()`);
    await waitForBrowserValue(
      browser,
      `document.querySelector('[data-testid="analysis-section-etf-cost-risk-performance"]')?.parentElement?.textContent.includes("VTI")`,
      "The comparison data should remain available after navigating to its section.",
    );
    assert.deepEqual(
      await browser.evaluate(`JSON.parse(window.__analysisTestStorage.get("@stocksense/etf_comparison_symbols_v1") ?? "[]")`),
      ["VTI"],
      "Showing comparison highlights must preserve the saved comparison selection.",
    );
    assert.equal(
      await browser.evaluate(`document.documentElement.scrollWidth <= window.innerWidth && document.body.scrollWidth <= window.innerWidth`),
      true,
      "The comparison switcher must remain within the 320px phone viewport.",
    );
    const commentarySelector = '[data-testid="analysis-section-ai-commentary"]';
    await browser.evaluate(`(() => {
      const section = document.querySelector(${JSON.stringify(commentarySelector)});
      section?.scrollIntoView({ block: "nearest" });
      section?.click();
    })()`);
    await waitForBrowserValue(
      browser,
      `document.querySelector(${JSON.stringify(commentarySelector)})?.parentElement?.textContent.includes("AI commentary summarizes supplied fund data")`,
      "Expanded AI commentary should retain its narrative explanation.",
    );
    assert.deepEqual(
      await browser.evaluate(`({
        strengthCount: (document.body?.innerText ?? "").split("Low annual fee").length - 1,
        riskCount: (document.body?.innerText ?? "").split("Market concentration").length - 1,
      })`),
      { strengthCount: 1, riskCount: 1 },
      "AI strengths and risks should appear once, in the overview rather than again in commentary.",
    );
    await browser.evaluate(`(() => {
      const switcher = document.querySelector('[data-testid="etf-comparison-switcher"]');
      const control = document.querySelector('[data-testid="etf-comparison-switch-VTI"]');
      switcher?.scrollIntoView({ block: "nearest" });
      control?.click();
    })()`);
    await waitForBrowserValue(
      browser,
      "window.__analysisNavigation.length === 1",
      "Selecting a compared ETF should navigate to that fund's details.",
    );
    assert.deepEqual(
      await browser.evaluate(`window.__analysisNavigation[0]`),
      { pathname: "/analysis/[symbol]", params: { symbol: "VTI" } },
      "The selected comparison should open the requested ETF details.",
    );
    assert.deepEqual(
      await browser.evaluate(`JSON.parse(window.__analysisTestStorage.get("@stocksense/etf_comparison_symbols_v1") ?? "[]")`),
      ["VOO"],
      "Switching focus should retain the previous current ETF in the comparison lineup.",
    );
    await browser.send("Page.navigate", { url: `http://127.0.0.1:${address.port}/chart-retry` });
    await waitForBrowserValue(
      browser,
      `Boolean(document.querySelector('[data-testid="etf-chart-retry"]'))`,
      "A failed price-history request should show a retry action.",
    );
    await browser.evaluate(`document.querySelector('[data-testid="etf-chart-retry"]')?.click()`);
    await waitForBrowserValue(
      browser,
      `Boolean(document.querySelector('[data-testid="etf-chart-test-render"]'))`,
      "Retry should load and display the available chart data.",
    );
    assert.equal(
      await browser.evaluate(`window.__analysisChartRequests?.length`),
      2,
      "A user retry should create exactly one additional chart request.",
    );
  } finally {
    await browser?.close();
    if (chrome.exitCode === null && chrome.signalCode === null) {
      const exited = new Promise((resolveExit) => chrome.once("exit", resolveExit));
      chrome.kill("SIGTERM");
      const didExit = await Promise.race([
        exited.then(() => true),
        delay(2000).then(() => false),
      ]);
      if (!didExit) {
        chrome.kill("SIGKILL");
        await exited;
      }
    }
    await new Promise((resolveClose) => server.close(resolveClose));
    await rm(profileDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});