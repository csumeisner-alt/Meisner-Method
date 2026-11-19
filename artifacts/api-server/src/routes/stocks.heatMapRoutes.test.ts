import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "express";
import { build } from "esbuild";
import test from "node:test";

test("heat-map routes are registered and reject invalid inputs before provider access", async () => {
  const routesDirectory = dirname(fileURLToPath(import.meta.url));
  const bundleDirectory = await mkdtemp(join(routesDirectory, ".heat-map-router-test-"));
  let server: ReturnType<ReturnType<typeof express>["listen"]> | undefined;
  try {
    const bundlePath = join(bundleDirectory, "index.mjs");
    await build({
      entryPoints: [join(routesDirectory, "index.ts")],
      outfile: bundlePath,
      bundle: true,
      platform: "node",
      format: "esm",
      logLevel: "silent",
      external: [
        "@clerk/express",
        "@clerk/shared",
        "cookie-parser",
        "cors",
        "express",
        "openai",
        "pg",
        "pino",
        "pino-http",
      ],
    });
    const { default: router } = await import(pathToFileURL(bundlePath).href) as {
      default: express.Router;
    };

    const app = express();
    app.use(express.json());
    app.use(router);
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");

    const routes = [
      {
        path: "/stocks/heat-map/quote/bad%20symbol",
        error: "INVALID_SYMBOL",
        message: "Use one valid ticker symbol.",
      },
      {
        path: "/stocks/heat-map/detail/bad%20symbol/summary",
        error: "INVALID_SYMBOL",
        message: "Use one valid ticker symbol.",
      },
      {
        path: "/stocks/heat-map/detail/bad%20symbol/etf-fund-data",
        error: "INVALID_SYMBOL",
        message: "Use one valid ticker symbol.",
      },
      {
        path: "/stocks/heat-map/detail/bad%20symbol/etf-history-fit",
        error: "INVALID_SYMBOL",
        message: "Use one valid ticker symbol.",
      },
      {
        path: "/stocks/heat-map?category=not-a-category",
        error: "INVALID_CATEGORY",
        message: "Choose stocks, ETFs, commodities, futures, cryptocurrency, or custom.",
      },
      {
        path: "/stocks/heat-map?category=stocks&period=2d",
        error: "INVALID_PERIOD",
        message: "Choose 1d, 1w, 1m, 3m, 6m, 1y, 3y, 5y, or max.",
      },
      {
        path: "/stocks/heat-map?category=custom&symbols=AAPL%2FMSFT",
        error: "INVALID_SYMBOLS",
        message: "Use up to 40 valid ticker symbols.",
      },
      {
        path: "/stocks/heat-map/search?q=ab&category=stocks",
        error: "INVALID_QUERY",
        message: "Enter 2 to 80 characters and choose ETFs, commodities, futures, or cryptocurrency.",
      },
    ];

    for (const route of routes) {
      const response = await fetch(`http://127.0.0.1:${address.port}${route.path}`);
      assert.equal(response.status, 400, `${route.path} should return a validation error`);
      assert.deepEqual(await response.json(), {
        error: route.error,
        message: route.message,
      });
    }

    const validationResponse = await fetch(
      `http://127.0.0.1:${address.port}/stocks/heat-map/validate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: "bad symbol" }),
      },
    );
    assert.equal(validationResponse.status, 400, "ticker validation should reject an invalid symbol");
    assert.deepEqual(await validationResponse.json(), {
      error: "INVALID_SYMBOL",
      message: "Enter one valid ticker symbol.",
    });
  } finally {
    if (server) {
      server.close();
      await once(server, "close");
    }
    await rm(bundleDirectory, { recursive: true, force: true });
  }
});
