import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildProbeUrl,
  formatRouteResult,
  getExpectedMobileGetPaths,
  getOpenApiGetPaths,
  getPublishedApiBaseUrl,
  runApiRoutePreflight,
} from "./smoke-test-api-routes.mjs";

const openApiSource = await readFile(
  new URL("../../../lib/api-spec/openapi.yaml", import.meta.url),
  "utf8",
);

test("builds expected mobile GET routes from OpenAPI and mobile-only paths", () => {
  const paths = getOpenApiGetPaths(openApiSource);
  assert.ok(paths.includes("/healthz"));
  assert.ok(paths.includes("/stocks/info/{symbol}"));
  for (const path of [
    "/stocks/heat-map/quote/{symbol}",
    "/stocks/heat-map/detail/{symbol}/summary",
    "/stocks/heat-map/detail/{symbol}/etf-fund-data",
    "/stocks/heat-map/detail/{symbol}/etf-history-fit",
  ]) {
    assert.ok(paths.includes(path), `missing heat-map preflight route: ${path}`);
  }
  assert.ok(!paths.includes("/stocks/analyze"));
  assert.ok(!paths.includes("/stocks/quotes"));
  const expectedMobilePaths = getExpectedMobileGetPaths(openApiSource);
  assert.ok(expectedMobilePaths.includes("/stocks/chart/{symbol}"));
  assert.ok(expectedMobilePaths.includes("/stocks/quote/{symbol}"));
  assert.ok(expectedMobilePaths.includes("/stocks/top-picks"));
  assert.ok(expectedMobilePaths.includes("/stocks/trending"));
  assert.equal(expectedMobilePaths.length, 18);
});

test("uses valid sample path and query parameters for read-only probes", () => {
  assert.equal(
    buildProbeUrl("https://published.example", "/stocks/heat-map/detail/{symbol}/summary").href,
    "https://published.example/api/stocks/heat-map/detail/AAPL/summary",
  );
  assert.equal(
    buildProbeUrl("https://published.example", "/stocks/heat-map/search").href,
    "https://published.example/api/stocks/heat-map/search?q=SPY&category=etfs",
  );
  assert.equal(
    buildProbeUrl("https://published.example", "/stocks/heat-map").href,
    "https://published.example/api/stocks/heat-map?category=custom&symbols=AAPL&period=1d",
  );
  assert.equal(
    buildProbeUrl("https://published.example", "/stocks/chart/{symbol}").href,
    "https://published.example/api/stocks/chart/AAPL?period=3mo&interval=1d",
  );
  assert.equal(
    buildProbeUrl("https://published.example", "/stocks/crypto/{symbol}/supply-history/{rangeDays}").href,
    "https://published.example/api/stocks/crypto/BTC-USD/supply-history/30",
  );
});

test("requires a published HTTPS URL and rejects development hosts", () => {
  assert.equal(
    getPublishedApiBaseUrl({ API_ROUTE_PREFLIGHT_BASE_URL: "https://published.example/" }),
    "https://published.example",
  );
  assert.throws(
    () => getPublishedApiBaseUrl({ EXPO_PUBLIC_DOMAIN: "stock-analyzer.replit.app" }),
    /set API_ROUTE_PREFLIGHT_BASE_URL/,
  );
  assert.throws(
    () => getPublishedApiBaseUrl({ API_ROUTE_PREFLIGHT_BASE_URL: "https://workspace.replit.dev" }),
    /only checks a published backend/,
  );
  assert.throws(
    () => getPublishedApiBaseUrl({}),
    /set API_ROUTE_PREFLIGHT_BASE_URL from deployment metadata/,
  );
  assert.throws(
    () => getPublishedApiBaseUrl({ API_ROUTE_PREFLIGHT_BASE_URL: "http://published.example" }),
    /requires an HTTPS/,
  );
});

test("checks only GET routes and reports missing routes separately", async () => {
  const methods = [];
  const report = await runApiRoutePreflight({
    baseUrl: "https://published.example",
    paths: [
      "/stocks/info/{symbol}",
      "/stocks/heat-map/detail/{symbol}/summary",
    ],
    fetchImpl: async (url, options) => {
      methods.push(options.method);
      return {
        status: url.pathname.endsWith("/summary") ? 404 : 200,
        body: null,
      };
    },
  });

  assert.deepEqual(methods, ["GET", "GET"]);
  assert.deepEqual(report.results.map(({ result }) => result), ["available", "missing"]);
  assert.match(report.results[1].url, /\/api\/stocks\/heat-map\/detail\/AAPL\/summary$/);
});

test("keeps server errors distinct from missing routes", async () => {
  const report = await runApiRoutePreflight({
    baseUrl: "https://published.example",
    paths: ["/stocks/info/{symbol}"],
    fetchImpl: async () => ({ status: 503, body: null }),
  });

  assert.equal(report.results[0].result, "unconfirmed");
  assert.equal(report.results[0].status, 503);
});

test("formats missing route findings with the exact GET path and 404 status", () => {
  assert.equal(
    formatRouteResult({
      path: "/stocks/heat-map/detail/{symbol}/summary",
      status: 404,
      result: "missing",
    }),
    "MISSING GET /stocks/heat-map/detail/{symbol}/summary -> HTTP 404",
  );
});
