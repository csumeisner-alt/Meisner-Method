#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OPENAPI_PATH = resolve(SCRIPT_DIR, "../../../lib/api-spec/openapi.yaml");
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 500;
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

export function getOpenApiPaths(openApiSource) {
  return [...openApiSource.matchAll(/^  (\/[^:\s]+):\s*$/gm)].map((match) => match[1]);
}

export function getOpenApiMethodsByPath(openApiSource) {
  const methodsByPath = new Map();
  let currentPath = null;

  for (const line of openApiSource.split(/\r?\n/)) {
    const pathMatch = line.match(/^  (\/[^:\s]+):\s*$/);
    if (pathMatch) {
      currentPath = pathMatch[1];
      methodsByPath.set(currentPath, new Set());
      continue;
    }

    const methodMatch = currentPath && line.match(/^    (get|post|put|patch|delete):\s*$/i);
    if (methodMatch) methodsByPath.get(currentPath).add(methodMatch[1].toUpperCase());
  }

  return methodsByPath;
}

function pathsMatch(mobilePath, openApiPath) {
  const mobileSegments = mobilePath.split("/").filter(Boolean);
  const openApiSegments = openApiPath.split("/").filter(Boolean);
  return mobileSegments.length === openApiSegments.length
    && openApiSegments.every((segment, index) =>
      /^\{[^}]+\}$/.test(segment) || segment === mobileSegments[index],
    );
}

export function getMissingMobileApiPaths(mobilePaths, openApiSource) {
  const documentedPaths = getOpenApiPaths(openApiSource);
  return [...new Set(mobilePaths)]
    .filter((mobilePath) => !documentedPaths.some((path) => pathsMatch(mobilePath, path)))
    .sort();
}

export function getMissingMobileApiMethods(mobileRequests, openApiSource) {
  const methodsByPath = getOpenApiMethodsByPath(openApiSource);
  const missing = new Map();

  for (const request of mobileRequests) {
    const documentedPath = [...methodsByPath.keys()].find((path) =>
      pathsMatch(request.path, path),
    );
    if (!documentedPath) continue;
    if (methodsByPath.get(documentedPath).has(request.method.toUpperCase())) {
      continue;
    }

    const key = `${request.method.toUpperCase()} ${request.path}`;
    missing.set(key, { path: request.path, method: request.method.toUpperCase() });
  }

  return [...missing.values()].sort((left, right) =>
    left.path.localeCompare(right.path) || left.method.localeCompare(right.method),
  );
}

async function listMobileSourceFiles(directory) {
  const ignoredDirectories = new Set([".expo", "mocks", "node_modules", "scripts", "__tests__"]);
  const sourceExtensions = new Set([".js", ".jsx", ".ts", ".tsx"]);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        files.push(...await listMobileSourceFiles(path));
      }
    } else if (
      entry.isFile()
      && sourceExtensions.has(entry.name.slice(entry.name.lastIndexOf(".")))
      && !/\.(?:test|spec)\.[^.]+$/.test(entry.name)
    ) {
      files.push(path);
    }
  }
  return files;
}

function getMethodAfterApiLiteral(source, literalEnd) {
  let cursor = literalEnd;
  while (/\s/.test(source[cursor] ?? "")) cursor += 1;
  if (source[cursor] !== ",") return "GET";

  cursor += 1;
  while (/\s/.test(source[cursor] ?? "")) cursor += 1;
  if (source[cursor] !== "{") return "GET";

  const optionsStart = cursor;
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (; cursor < source.length; cursor += 1) {
    const character = source[cursor];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}" && --depth === 0) {
      break;
    }
  }

  const options = source.slice(optionsStart, cursor + 1);
  const methodMatch = options.match(/\bmethod\s*:\s*(['"])(GET|POST|PUT|PATCH|DELETE)\1/i);
  return methodMatch?.[2].toUpperCase() ?? "GET";
}

export async function getMobileApiRequests(
  mobileRoot = resolve(SCRIPT_DIR, ".."),
) {
  const requests = new Map();
  const sourceFiles = await listMobileSourceFiles(mobileRoot);
  const stringLiteralPattern =
    /(?:'((?:\\.|[^'\\\r\n])*)'|"((?:\\.|[^"\\\r\n])*)"|`([^`\r\n]*)`)/g;

  for (const sourceFile of sourceFiles) {
    const source = await readFile(sourceFile, "utf8");
    for (const match of source.matchAll(stringLiteralPattern)) {
      const literal = match[1] ?? match[2] ?? match[3] ?? "";
      if (!literal.includes("/api/")) continue;

      const start = literal.indexOf("/api/");
      const route = literal
        .slice(start + 4)
        .replace(/\$\{[^{}]*\}/g, "{param}")
        .split(/[?#]/, 1)[0]
        .replace(/\/+$/, "");
      if (route.startsWith("/")) {
        const method = getMethodAfterApiLiteral(source, match.index + match[0].length);
        requests.set(`${method} ${route}`, { path: route, method });
      }
    }
  }

  return [...requests.values()].sort((left, right) =>
    left.path.localeCompare(right.path) || left.method.localeCompare(right.method),
  );
}

export async function getMobileApiPaths(mobileRoot = resolve(SCRIPT_DIR, "..")) {
  return [...new Set((await getMobileApiRequests(mobileRoot)).map(({ path }) => path))].sort();
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

function isRetryableStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

function wait(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function checkRoute({
  baseUrl,
  path,
  fetchImpl,
  timeoutMs,
  maxAttempts,
  retryDelayMs,
}) {
  const url = buildProbeUrl(baseUrl, path);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
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

      const retryable = isRetryableStatus(response.status) && attempt < maxAttempts;
      if (retryable) {
        await wait(retryDelayMs * attempt);
        continue;
      }

      return {
        path,
        url: url.toString(),
        status: response.status,
        attempts: attempt,
        result: response.status === 404
          ? "missing"
          : response.status >= 200 && response.status < 300
            ? "available"
            : "unconfirmed",
      };
    } catch (error) {
      if (attempt < maxAttempts) {
        await wait(retryDelayMs * attempt);
        continue;
      }

      const detail = error?.name === "AbortError"
        ? `timed out after ${timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : String(error);
      return {
        path,
        url: url.toString(),
        attempts: attempt,
        result: "failed",
        detail,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export async function runApiRoutePreflight({
  baseUrl = getPublishedApiBaseUrl(),
  paths,
  openApiSource,
  fetchImpl = fetch,
  timeoutMs = Number(process.env.API_ROUTE_PREFLIGHT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
} = {}) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error("API route preflight maxAttempts must be a positive integer");
  }
  if (!Number.isFinite(retryDelayMs) || retryDelayMs < 0) {
    throw new Error("API route preflight retryDelayMs must be a non-negative number");
  }
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
        maxAttempts,
        retryDelayMs,
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
