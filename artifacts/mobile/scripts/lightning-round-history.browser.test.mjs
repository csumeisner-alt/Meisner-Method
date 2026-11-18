import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "esbuild";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const mobileDir = resolve(scriptDir, "..");
const fixtureDir = join(scriptDir, "lightning-round-browser");
const require = createRequire(import.meta.url);
const reactNativeWebEntry = require.resolve("react-native-web", { paths: [mobileDir] });
const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
const selector = (testID) => `[data-testid=${JSON.stringify(testID)}]`;

function browserExecutable() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  if (existsSync("/repl/tools/bin/chromium")) return "/repl/tools/bin/chromium";
  return "chromium";
}

async function buildFixture() {
  const aliases = new Map([
    ["@react-native-async-storage/async-storage", join(fixtureDir, "mocks/async-storage.ts")],
    ["expo-router", join(fixtureDir, "mocks/expo-router.ts")],
    ["react-native-safe-area-context", join(fixtureDir, "mocks/safe-area-context.tsx")],
    ["react-native-keyboard-controller", join(fixtureDir, "mocks/keyboard-controller.tsx")],
    ["react-native-view-shot", join(fixtureDir, "mocks/view-shot.tsx")],
    ["@expo/vector-icons", join(fixtureDir, "mocks/vector-icons.tsx")],
    ["@/hooks/useColors", join(fixtureDir, "mocks/use-colors.ts")],
    ["@/components/BottomTabBar", join(fixtureDir, "mocks/components.tsx")],
    ["@/components/PaperChallengeLeaderboard", join(fixtureDir, "mocks/components.tsx")],
    ["@/components/PaperEventShareCard", join(fixtureDir, "mocks/components.tsx")],
    ["@/components/PaperChallengeMilestoneBadges", join(fixtureDir, "mocks/components.tsx")],
    ["@/components/PaperCharts", join(fixtureDir, "mocks/components.tsx")],
    ["@/lib/installation", join(fixtureDir, "mocks/installation.ts")],
  ]);
  const result = await build({
    entryPoints: [join(fixtureDir, "entry.tsx")],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2022",
    jsx: "automatic",
    define: { "process.env.EXPO_PUBLIC_DOMAIN": '"lightning-round.test"', global: "globalThis" },
    loader: { ".jpg": "dataurl", ".png": "dataurl", ".js": "jsx" },
    resolveExtensions: [".web.tsx", ".web.ts", ".web.jsx", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    mainFields: ["browser", "module", "main"],
    conditions: ["browser"],
    plugins: [{
      name: "lightning-round-browser-test-aliases",
      setup(buildApi) {
        buildApi.onResolve({ filter: /^react-native$/ }, () => ({ path: reactNativeWebEntry }));
        buildApi.onResolve({ filter: /^@\// }, ({ path }) => {
          const alias = aliases.get(path);
          if (alias) return { path: alias };
          const sourcePath = resolve(mobileDir, path.slice(2));
          if (existsSync(sourcePath)) return { path: sourcePath };
          const extension = [".tsx", ".ts", ".jsx", ".js"]
            .find((candidate) => existsSync(`${sourcePath}${candidate}`));
          return extension ? { path: `${sourcePath}${extension}` } : { errors: [{ text: `Unable to resolve ${path}.` }] };
        });
        buildApi.onResolve({ filter: /.*/ }, ({ path }) => {
          const alias = aliases.get(path);
          return alias ? { path: alias } : null;
        });
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
      if (chrome.exitCode !== null) throw new Error(`Chromium exited before opening its debugging port.\n${stderr()}`);
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
          expression,
          awaitPromise: true,
          returnByValue: true,
        }).then((reply) => {
          if (reply.result.exceptionDetails) throw new Error(reply.result.exceptionDetails.text ?? "Browser evaluation failed.");
          return reply.result.result.value;
        });
      },
      close() {
        socket.close();
      },
    }));
    socket.addEventListener("error", rejectConnection, { once: true });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      const pending = waiting.get(message.id);
      if (message.id === undefined || !pending) return;
      waiting.delete(message.id);
      if (message.error) pending.rejectMessage(new Error(message.error.message));
      else pending.resolveMessage(message);
    });
  });
}

async function waitFor(browser, expression, message, timeout = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const result = await browser.evaluate(expression);
    if (result) return result;
    await delay(40);
  }
  const renderedText = await browser.evaluate("document.body.innerText").catch(() => "");
  throw new Error(`${message}${renderedText ? `\nRendered page: ${renderedText}` : ""}`);
}

async function clickTestID(browser, testID) {
  const clicked = await browser.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector(testID))});
    if (!element) return false;
    element.scrollIntoView({ block: "nearest", inline: "nearest" });
    element.click();
    return true;
  })()`);
  assert.equal(clicked, true, `Expected ${testID} to be rendered and clickable.`);
}

function savedSummary(eventId, overrides = {}) {
  const now = Date.now();
  return {
    eventId,
    eventStartAtMs: now - 10 * 86_400_000,
    eventEndAtMs: now - 9 * 86_400_000,
    joinedAtMs: now - 10 * 86_400_000,
    accountId: `paper-lightning:${eventId}`,
    accountName: "Lightning Round",
    eventType: "lightning-round",
    artworkId: "lightning-round-arena",
    startingBalance: 100_000,
    rankingDirection: "highest-return",
    startEquity: 100_000,
    endEquity: 100_000,
    netProfit: 0,
    returnPercent: 0,
    tradeCount: 0,
    buyCount: 0,
    sellCount: 0,
    symbolsTraded: [],
    realizedPnL: 0,
    completedAtMs: now - 1000,
    ...overrides,
  };
}

test("signed-in Lightning Round reads mixed device history and opens saved archived details", async () => {
  const completedOne = savedSummary("lightning-2026-11-06", {
    eventStartAtMs: Date.parse("2026-11-06T14:30:00.000Z"),
    eventEndAtMs: Date.parse("2026-11-07T14:30:00.000Z"),
    joinedAtMs: Date.parse("2026-11-06T14:30:00.000Z"),
    startEquity: 100_000,
    endEquity: 105_000,
    netProfit: 5_000,
    returnPercent: 5,
    finalRank: 3,
    tradingFingerprintObservation: {
      version: 1,
      observationId: "positive-trade-consistency",
      headline: "Your results came from consistency",
      supportingSentence: "3 of 3 trades with reported realized results were profitable (100%).",
      score: 87.5,
      scoreParts: { magnitude: 1, uniqueness: 1, reliability: 0.375 },
      evidence: { positiveTradeCount: 3, realizedTradeCount: 3, positiveTradeSharePercent: 100 },
    },
    tradeCount: 1,
    symbolsTraded: ["LUMN"],
    equityHistory: [
      { date: "2026-11-06T14:30:00.000Z", value: 100_000 },
      { date: "2026-11-07T14:30:00.000Z", value: 105_000 },
    ],
    finalPositions: [{
      symbol: "LUMN",
      companyName: "Lumen Technologies",
      shares: 100,
      positionType: "long",
      avgCost: 1000,
      marketPrice: 1050,
      marketValue: 105_000,
      unrealizedPnL: 5_000,
    }],
    transactions: [{
      id: "saved-trade-lumn",
      symbol: "LUMN",
      action: "BUY",
      shares: 100,
      price: 1000,
      total: 100_000,
      date: "2026-11-06T15:00:00.000Z",
    }],
  });
  const completedTwo = savedSummary("lightning-2026-10-23", {
    eventStartAtMs: Date.parse("2026-10-23T14:30:00.000Z"),
    eventEndAtMs: Date.parse("2026-10-24T14:30:00.000Z"),
    joinedAtMs: Date.parse("2026-10-23T14:30:00.000Z"),
    startEquity: 200_000,
    endEquity: 198_000,
    netProfit: -2_000,
    returnPercent: -1,
    finalRank: 1,
  });
  const unfinishedLightning = savedSummary("lightning-2026-11-13", {
    eventStartAtMs: Date.parse("2026-11-13T14:30:00.000Z"),
    eventEndAtMs: Date.parse("2026-11-14T14:30:00.000Z"),
    joinedAtMs: Date.parse("2026-11-13T14:30:00.000Z"),
    netProfit: 900_000,
    completedAtMs: Date.now() + 86_400_000,
    finalRank: 2,
  });
  const regularEvent = savedSummary("regular-event", {
    eventType: "event-arena",
    artworkId: "stadium",
    accountId: "paper-event:regular-event",
    netProfit: 90_000,
    finalRank: 1,
  });
  const savedStore = {
    enrollment: null,
    lightningEnrollment: null,
    history: [completedOne, completedTwo, unfinishedLightning, regularEvent],
  };
  const bundle = await buildFixture();
  const server = createServer((request, response) => {
    if (request.url === "/bundle.js") {
      response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      response.end(bundle);
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(`<!doctype html><html><head>
      <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
      <style>html,body,#root{width:100%;height:100%;margin:0;padding:0;overflow:hidden}</style>
      <script>
        localStorage.setItem(
          "__async_storage__:@stocksense/paper_events_v1",
          ${JSON.stringify(JSON.stringify(savedStore))}
        );
      </script>
      </head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`);
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });

  const profileDir = await mkdtemp(join(tmpdir(), "lightning-round-browser-"));
  let chromeStderr = "";
  const chrome = spawn(browserExecutable(), [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDir}`,
    "about:blank",
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
      width: 400,
      height: 720,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await browser.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    await browser.send("Page.navigate", { url: `http://127.0.0.1:${address.port}/` });
    await waitFor(browser,
      `!!document.querySelector(${JSON.stringify(selector("lightning-round-season-summary"))})`,
      "The rendered Lightning Round season summary did not load from device storage.");

    const seasonSummary = () => browser.evaluate(
      `document.querySelector(${JSON.stringify(selector("lightning-round-season-summary"))})?.textContent`,
    );
    assert.equal(await browser.evaluate(`!!document.querySelector(${JSON.stringify(selector("fixture-signed-in-state"))})`), true);
    assert.match(await seasonSummary(), /2 completed rounds/);
    assert.match(await seasonSummary(), /\+\$3,000\.00/);
    assert.match(await seasonSummary(), /\+1\.00%/);
    assert.match(await seasonSummary(), /#1/);
    assert.doesNotMatch(await seasonSummary(), /\$90,000\.00|\$900,000\.00/);
    assert.equal(await browser.evaluate(`!!document.querySelector(${JSON.stringify(selector("lightning-round-past-event-lightning-2026-11-06"))})`), true);
    assert.equal(await browser.evaluate(`!!document.querySelector(${JSON.stringify(selector("lightning-round-past-event-lightning-2026-10-23"))})`), true);
    assert.equal(await browser.evaluate(`!!document.querySelector(${JSON.stringify(selector("lightning-round-past-event-regular-event"))})`), false);

    // Exercise the production header, not a duplicate test-only navigation row.
    for (const width of [320, 360, 390, 430]) {
      await browser.send("Emulation.setDeviceMetricsOverride", {
        width, height: 720, deviceScaleFactor: 1, mobile: true,
      });
      await delay(80);
      const tabs = await browser.evaluate(`Array.from(document.querySelectorAll('[data-testid^="lightning-round-tab-"]')).map(element => {
        const bounds = element.getBoundingClientRect();
        const image = element.querySelector('img');
        return { label: element.getAttribute('aria-label') || element.textContent, role: element.getAttribute('role'),
          x: bounds.x, right: bounds.right, width: bounds.width, height: bounds.height,
          loaded: !!image && image.complete && image.naturalWidth > 0 };
      })`);
      assert.equal(tabs.length, 4);
      assert.deepEqual(tabs.map((tab) => tab.label), ["Round", "Leaderboard", "My Trades", "Past Events"]);
      for (const tab of tabs) {
        assert.equal(tab.role, "tab");
        assert.ok(tab.x >= 0 && tab.right <= width + 1, `${tab.label} fits at ${width}px`);
        assert.ok(tab.width >= 44 && tab.height >= 44, `${tab.label} has a comfortable tap target`);
        assert.equal(tab.loaded, true, `${tab.label} artwork loaded at ${width}px`);
      }
      assert.ok(Math.max(...tabs.map((tab) => tab.height)) - Math.min(...tabs.map((tab) => tab.height)) < 1);
    }

    for (const [id, content] of [
      ["overview", "NEXT ROUND STARTS IN|TIME LEFT IN THIS ROUND"],
      ["leaderboard", "test-paper-challenge-leaderboard"],
      ["trades", "Lightning Round trades"],
      ["past", "Past Lightning Rounds"],
    ]) {
      await clickTestID(browser, `lightning-round-tab-${id}`);
      await waitFor(browser,
        id === "leaderboard"
          ? `!!document.querySelector(${JSON.stringify(selector(content))})`
          : `new RegExp(${JSON.stringify(content)}).test(document.body.innerText)`,
        `The ${id} tab did not open its existing destination.`);
      assert.equal(await browser.evaluate(
        `document.querySelector(${JSON.stringify(selector(`lightning-round-tab-${id}`))})?.getAttribute('aria-selected')`,
      ), "true");
    }
    await clickTestID(browser, "lightning-round-tab-trades");
    await browser.evaluate(`document.querySelector('[aria-label="Open Past Events"]').click()`);
    await waitFor(browser,
      `!!document.querySelector(${JSON.stringify(selector("lightning-round-season-summary"))})`,
      "The header archive control did not open Past Events.");
    await browser.evaluate(`document.querySelector('[aria-label="Go back"]').click()`);
    assert.equal(await browser.evaluate("document.documentElement.dataset.lightningBackCount"), "1");

    await clickTestID(browser, "fixture-open-event-history");
    await clickTestID(browser, "settings-events-button");
    await clickTestID(browser, "open-paper-event-archive");
    await waitFor(browser,
      `!!document.querySelector(${JSON.stringify(selector("paper-event-lightning-season-summary"))})`,
      "The saved Event Arena archive did not load.");
    assert.match(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("paper-event-lightning-season-summary"))})?.textContent`),
      /2 completed rounds saved on this device/,
    );
    await clickTestID(browser, "paper-event-card-lightning-2026-11-06");
    await waitFor(browser,
      `!!document.querySelector(${JSON.stringify(selector("paper-event-detail-lightning-2026-11-06"))})`,
      "The selected archived Lightning Round result did not open.");

    const detail = await browser.evaluate(
      `document.querySelector(${JSON.stringify(selector("paper-event-detail-lightning-2026-11-06"))})?.textContent`,
    );
    assert.match(detail, /Event ID · lightning-2026-11-06/);
    assert.match(detail, /Final value\$105,000\.00/);
    assert.match(detail, /Profit \/ loss\+\$5,000\.00/);
    assert.match(detail, /Final rank#3/);
    assert.match(detail, /LUMN · 100 shares/);
    assert.match(detail, /Lumen Technologies · close \$1,050\.00/);
    assert.match(detail, /BUY/);
    assert.match(detail, /\$100,000\.00/);
    const fingerprintTestId = "trading-fingerprint-lightning-2026-11-06";
    assert.equal(
      await browser.evaluate(`!!document.querySelector(${JSON.stringify(selector(fingerprintTestId))})`),
      true,
      "The saved Trading Fingerprint should appear in the completed event summary.",
    );
    const fingerprintText = await browser.evaluate(
      `document.querySelector(${JSON.stringify(selector(fingerprintTestId))})?.textContent`,
    );
    assert.match(fingerprintText, /YOUR TRADING FINGERPRINT/);
    assert.match(fingerprintText, /Your results came from consistency/);
    assert.match(fingerprintText, /3 of 3 trades.*100%/);
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("paper-event-history-artwork-lightning-2026-11-06"))}) !== null`),
      true,
      "The opened result should retain its saved artwork.",
    );
    for (const width of [320, 360, 400]) {
      await browser.send("Emulation.setDeviceMetricsOverride", {
        width, height: 720, deviceScaleFactor: 1, mobile: true,
      });
      await delay(50);
      const bounds = await browser.evaluate(`(() => {
        const element = document.querySelector(${JSON.stringify(selector(fingerprintTestId))});
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return { x: rect.x, right: rect.right, width: rect.width, viewport: innerWidth, document: document.documentElement.scrollWidth };
      })()`);
      assert.ok(bounds, `The fingerprint card should remain visible at ${width}px.`);
      assert.ok(bounds.x >= 0 && bounds.right <= width + 1, `The fingerprint card fits at ${width}px.`);
      assert.ok(bounds.document <= width + 1, `The event summary has no horizontal overflow at ${width}px.`);
    }
  } finally {
    browser?.close();
    chrome.kill("SIGTERM");
    await new Promise((resolveClose) => server.close(resolveClose));
    await rm(profileDir, { recursive: true, force: true });
  }
});
