import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "express";
import { build } from "esbuild";
import test from "node:test";

test("heat-map detail routes are registered and reject invalid symbols before provider access", async () => {
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
    app.use(router);
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");

    const routes = [
      "/stocks/heat-map/quote/bad%20symbol",
      "/stocks/heat-map/detail/bad%20symbol/summary",
      "/stocks/heat-map/detail/bad%20symbol/etf-fund-data",
      "/stocks/heat-map/detail/bad%20symbol/etf-history-fit",
    ];

    for (const path of routes) {
      const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
      assert.equal(response.status, 400, `${path} should resolve to symbol validation`);
      assert.deepEqual(await response.json(), {
        error: "INVALID_SYMBOL",
        message: "Use one valid ticker symbol.",
      });
    }
  } finally {
    if (server) {
      server.close();
      await once(server, "close");
    }
    await rm(bundleDirectory, { recursive: true, force: true });
  }
});
