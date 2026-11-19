#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OPENAPI_PATH = resolve(SCRIPT_DIR, "../../../lib/api-spec/openapi.yaml");
const DEFAULT_TIMEOUT_MS = 30_000;
const REQUEST_CONCURRENCY = 2;

const SAMPLE_QUERY_PARAMETERS = {
  "/stocks/heat-map/search": { q: "SPY", category: "etfs" },
  "/stocks/search": { q: "AAPL" },
  "/stocks/heat-map": { category: "custom", symbols: "AAPL", period: "1d" },
  "/stocks/chart/{symbol}": { period: "3mo", interval: "1d" },
};

function normalizeBaseUrl(value) {
  const input = value?.trim();
  if (!input) {
    throw new Error(
      "No verified published API URL configured; set API_ROUTE_PREFLIGHT_BASE_URL from deployment metadata",
    );
  }

  const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  if (url.protocol !== "https:") {
    throw new Error("API route preflight requires an HTTPS published API URL");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("API route preflight URL must not include credentials, a query, or a fragment");
  }
  if (
    url.hostname === "localhost" ||
    url.hostname.endsWith(".replit.dev") ||
    url.hostname.endsWith(".local")
  ) {
    throw new Error("API route preflight only checks a published backend, not a development URL");
  }

  return url.origin;
}

export function getPublishedApiBaseUrl(env = process.env) {
  return normalizeBaseUrl(env.API_ROUTE_PREFLIGHT_BASE_URL?.trim());
}

export function getOpenApiGetPaths(openApiSource) {
  const paths = [];
  let currentPath = null;

  for (const line of openApiSource.split(/\r?\n/)) {
    const pathMatch = line.match(/^  (\/[^:\s]+):\s*$/);
    if (pathMatch) {
      currentPath = pathMatch[1];
      continue;
    }

    if (currentPath && /^    get:\s*$/.test(line)) {
      if (currentPath === "/healthz" || currentPath.startsWith("/stocks/")) {
        paths.push(currentPath);
      }
      currentPath = null;
    }
  }

  if (paths.length === 0) {
    throw new Error("OpenAPI spec did not contain any expected mobile GET routes");
  }
  return paths;
}

export function getExpectedMobileGetPaths(openApiSource) {
  return getOpenApiGetPaths(openApiSource);
}

function sampleValueForParameter(name, path) {
  switch (name) {
    case "symbol":
      if (path.includes("/crypto/")) return "BTC-USD";
      if (path.includes("/etf-")) return "SPY";
      return "AAPL";
    case "period":
      return "1mo";
    case "interval":
      return "1d";
    case "relationshipId":
      return "gold-silver";
    case "rangeDays":
      return "30";
    default:
      throw new Error(`No safe sample value configured for {${name}} in ${path}`);
  }
}

export function buildProbeUrl(baseUrl, path) {
  const resolvedPath = path.replace(/\{([^}]+)\}/g, (_match, parameter) =>
    encodeURIComponent(sampleValueForParameter(parameter, path)),
  );
  const url = new URL(`/api${resolvedPath}`, normalizeBaseUrl(baseUrl));
  for (const [key, value] of Object.entries(SAMPLE_QUERY_PARAMETERS[path] ?? {})) {
    url.searchParams.set(key, value);
  }
  return url;
}

async function checkRoute({ baseUrl, path, fetchImpl, timeoutMs }) {
  const url = buildProbeUrl(baseUrl, path);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    try {
      await response.body?.cancel();
    } catch {
      // The response status is sufficient to establish the route result.
    }

    return {
      path,
      url: url.toString(),
      status: response.status,
      result: response.status === 404
        ? "missing"
        : response.status >= 200 && response.status < 300
          ? "available"
          : "unconfirmed",
    };
  } catch (error) {
    const detail = error?.name === "AbortError"
      ? `timed out after ${timeoutMs}ms`
      : error instanceof Error
        ? error.message
        : String(error);
    return { path, url: url.toString(), result: "failed", detail };
  } finally {
    clearTimeout(timeout);
  }
}

export async function runApiRoutePreflight({
  baseUrl = getPublishedApiBaseUrl(),
  paths,
  openApiSource,
  fetchImpl = fetch,
  timeoutMs = Number(process.env.API_ROUTE_PREFLIGHT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
} = {}) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const routes = paths ?? getExpectedMobileGetPaths(
    openApiSource ?? await readFile(OPENAPI_PATH, "utf8"),
  );
  const results = new Array(routes.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < routes.length) {
      const index = nextIndex++;
      results[index] = await checkRoute({
        baseUrl: normalizedBaseUrl,
        path: routes[index],
        fetchImpl,
        timeoutMs,
      });
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(REQUEST_CONCURRENCY, routes.length) }, runWorker),
  );
  return { baseUrl: normalizedBaseUrl, results };
}

export function formatRouteResult(result) {
  if (result.result === "available") return `PASS   GET ${result.path} -> HTTP ${result.status}`;
  if (result.result === "missing") return `MISSING GET ${result.path} -> HTTP 404`;
  if (result.result === "unconfirmed") {
    return `CHECK  GET ${result.path} -> HTTP ${result.status} (route responded, availability not confirmed)`;
  }
  return `FAILED GET ${result.path} -> ${result.detail}`;
}

const isMainModule =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  try {
    const { baseUrl, results } = await runApiRoutePreflight();
    console.log(`Read-only mobile API route preflight against ${baseUrl}`);
    for (const result of results) console.log(formatRouteResult(result));

    const missing = results.filter((result) => result.result === "missing");
    const unconfirmed = results.filter((result) =>
      result.result === "unconfirmed" || result.result === "failed",
    );
    if (missing.length > 0 || unconfirmed.length > 0) {
      console.error(
        `API route preflight failed: ${missing.length} missing route(s), ` +
          `${unconfirmed.length} route(s) not confirmed.`,
      );
      process.exitCode = 1;
    } else {
      console.log(`API route preflight passed: all ${results.length} GET routes responded successfully.`);
    }
  } catch (error) {
    console.error(
      `API route preflight failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
