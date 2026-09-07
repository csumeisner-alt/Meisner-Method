#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const DEFAULT_SYMBOL = "AAPL";
const DEFAULT_TIMEOUT_MS = 45_000;
const VALID_ACTIONS = new Set(["buy", "hold", "sell"]);
const FALLBACK_REASONING =
  "The AI explanation was unavailable, so this analysis is based on the rules-based technical, fundamental, and behavioral scores shown above.";

function describeValue(value) {
  return typeof value === "string" ? JSON.stringify(value) : String(value);
}

export function validateAnalysisResponse(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("response body must be a JSON object");
  }

  const response = payload;
  const recommendation = response.recommendation;
  if (!recommendation || typeof recommendation !== "object" || Array.isArray(recommendation)) {
    throw new Error("response.recommendation is missing or is not an object");
  }

  if (!VALID_ACTIONS.has(recommendation.action)) {
    throw new Error(
      `response.recommendation.action must be one of buy, hold, or sell; received ${describeValue(recommendation.action)}`,
    );
  }

  const fundamental = response.fundamental;
  if (!fundamental || typeof fundamental !== "object" || Array.isArray(fundamental)) {
    throw new Error("response.fundamental is missing or is not an object");
  }

  if (!Object.prototype.hasOwnProperty.call(fundamental, "dividendYield")) {
    throw new Error("response.fundamental.dividendYield is missing");
  }

  const dividendYield = fundamental.dividendYield;
  if (
    typeof dividendYield !== "number" ||
    !Number.isFinite(dividendYield) ||
    dividendYield < 0 ||
    dividendYield > 1
  ) {
    throw new Error(
      `response.fundamental.dividendYield must be a finite decimal fraction between 0 and 1; received ${describeValue(dividendYield)}`,
    );
  }

  if (typeof recommendation.reasoning !== "string" || recommendation.reasoning.trim() === "") {
    throw new Error("response.recommendation.reasoning is missing or empty");
  }

  const isDeterministicFallback = recommendation.reasoning === FALLBACK_REASONING;
  if (!isDeterministicFallback) {
    if (!Array.isArray(recommendation.risks) || !Array.isArray(recommendation.strengths)) {
      throw new Error(
        "response.recommendation.risks and strengths must be arrays when AI commentary is present",
      );
    }
  }

  return {
    action: recommendation.action,
    dividendYield,
    commentary: isDeterministicFallback ? "deterministic fallback" : "AI commentary",
  };
}

function endpointFromEnvironment() {
  const explicitUrl = process.env.ANALYSIS_SMOKE_URL?.trim();
  if (explicitUrl) return explicitUrl;

  const domain =
    process.env.EXPO_PUBLIC_DOMAIN?.trim() ||
    process.env.REPLIT_INTERNAL_APP_DOMAIN?.trim();
  if (!domain) {
    throw new Error(
      "no published API domain configured; set EXPO_PUBLIC_DOMAIN or ANALYSIS_SMOKE_URL",
    );
  }

  return `${/^https?:\/\//i.test(domain) ? domain : `https://${domain}`}/api/stocks/analyze`;
}

export async function runSmokeCheck({
  endpoint = endpointFromEnvironment(),
  symbol = process.env.ANALYSIS_SMOKE_SYMBOL?.trim() || DEFAULT_SYMBOL,
  timeoutMs = Number(process.env.ANALYSIS_SMOKE_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  fetchImpl = fetch,
} = {}) {
  if (!symbol) throw new Error("analysis smoke check requires a non-empty symbol");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ symbol }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`POST ${endpoint} timed out after ${timeoutMs}ms`);
    }
    throw new Error(`POST ${endpoint} failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timeout);
  }

  const bodyText = await response.text();
  if (response.status !== 200) {
    const detail = bodyText.replace(/\s+/g, " ").trim().slice(0, 500);
    throw new Error(
      `POST ${endpoint} returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
    );
  }

  let payload;
  try {
    payload = JSON.parse(bodyText);
  } catch (error) {
    throw new Error(
      `POST ${endpoint} returned HTTP 200 but not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const result = validateAnalysisResponse(payload);
  return { endpoint, symbol, ...result };
}

const isMainModule =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  try {
    const result = await runSmokeCheck();
    console.log(
      `Stock analysis smoke check passed: ${result.symbol} -> ${result.action}; ` +
        `dividendYield=${result.dividendYield}; commentary=${result.commentary}`,
    );
  } catch (error) {
    console.error(
      `Stock analysis smoke check failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}