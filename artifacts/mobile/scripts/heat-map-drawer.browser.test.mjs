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
const fixtureDir = join(scriptDir, "heat-map-browser");
const require = createRequire(import.meta.url);
const reactNativeWebEntry = require.resolve("react-native-web", { paths: [mobileDir] });
const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

test("heat-map resume refresh imports React Native AppState before subscribing", async () => {
  const source = await readFile(join(mobileDir, "app/heat-map.tsx"), "utf8");
  assert.match(source, /import\s*\{[^}]*\bAppState\b[^}]*\}\s*from\s*['"]react-native['"]/s);
  assert.match(source, /AppState\?\.addEventListener\?\.\('change'/);
  assert.match(source, /import\s*\{[^}]*\bgetHeatMapRegularOpenRefreshTimestamp\b[^}]*\}\s*from\s*['"]@\/lib\/heatMapQuoteDisplay['"]/s);
  assert.match(source, /import\s*\{[^}]*\bHEAT_MAP_CRYPTO_REFRESH_INTERVAL_MS\b[^}]*\}\s*from\s*['"]@\/lib\/heatMapQuoteDisplay['"]/s);
  assert.match(source, /import\s*\{[^}]*\bshouldRefreshHeatMapOnForegroundCadence\b[^}]*\}\s*from\s*['"]@\/lib\/heatMapQuoteDisplay['"]/s);
  assert.match(source, /import\s*\{[^}]*\bshouldRefreshCryptoHeatMapOnResume\b[^}]*\}\s*from\s*['"]@\/lib\/heatMapQuoteDisplay['"]/s);
});

test("custom heat-map reorder supports long-press drag and accessible alternatives", async () => {
  const source = await readFile(join(mobileDir, "app/heat-map.tsx"), "utf8");
  assert.match(source, /\.activateAfterLongPress\(Platform\.OS === 'web' \? 320 : 420\)/);
  assert.match(source, /accessibilityHint=\{dragEnabled \? 'Tap for market details\. Long press and drag to change position\.'/);
  assert.match(source, /accessibilityActions=\{accessibilityActions\}/);
  assert.match(source, /Move earlier/);
  assert.match(source, /Move later/);
  assert.match(source, /swapCustomHeatMapSymbolWithIndex\(visibleSymbols, symbol, index\)/);
  assert.match(source, /mergeReorderedSubset\(currentSymbols, reorderedVisible\)/);
  assert.match(source, /simultaneousWithExternalGesture\(scrollGesture\)/);
  assert.match(source, /<GestureDetector gesture=\{dragGesture\} touchAction="pan-y">/);
  assert.match(source, /<GestureDetector gesture=\{scrollGesture\}>[\s\S]*?<ScrollView/);
  assert.match(source, /scrollEnabled=\{draggingSymbol === null\}/);
  assert.match(source, /symbols: \[\.\.\.customSymbols\]\.sort\(\)/);
  assert.match(source, /queryKey: getGetMarketHeatMapQueryKey\(queryKeyParams\)/);
  assert.match(source, /runOnJS\(onDragEnd\)\(quote\.symbol, targetIndex\)/);
  assert.match(source, /void enqueueSymbolsWrite\(nextSymbols\)\.catch/);
  assert.match(source, /Platform\.OS === 'ios'\) AccessibilityInfo\.announceForAccessibility\(announcement\)/);
  assert.match(source, /accessibilityLiveRegion="polite"/);
});

test("watchlist reorder writes the ordered entries to its local cache", async () => {
  const source = await readFile(join(mobileDir, "hooks/useWatchlist.ts"), "utf8");
  const reorder = source.match(/const reorder = useCallback\(async \(symbols: string\[\]\) => \{([\s\S]*?)\n  \}, \[\]\);/);
  assert.ok(reorder, "The watchlist hook should expose its reorder callback.");
  assert.match(reorder[1], /symbols\s*\.map/);
  assert.match(reorder[1], /writeCache\(GUEST_CACHE_KEY, next\)/);
});

function browserExecutable() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  if (existsSync("/repl/tools/bin/chromium")) return "/repl/tools/bin/chromium";
  return "chromium";
}

async function buildScreenBundle() {
  const stubs = new Map([
    ["@workspace/api-client-react", join(fixtureDir, "mocks/api-client-react.tsx")],
    ["expo-router", join(fixtureDir, "mocks/expo-router.ts")],
    ["@react-native-async-storage/async-storage", join(fixtureDir, "mocks/async-storage.ts")],
    ["@expo/vector-icons", join(fixtureDir, "mocks/vector-icons.tsx")],
    ["react-native-svg", join(fixtureDir, "mocks/react-native-svg.tsx")],
    ["react-native-safe-area-context", join(fixtureDir, "mocks/safe-area-context.tsx")],
    ["react-native-reanimated", join(fixtureDir, "mocks/reanimated.ts")],
    ["react-native-gesture-handler", join(fixtureDir, "mocks/gesture-handler.tsx")],
    ["react-native-keyboard-controller", join(fixtureDir, "mocks/keyboard-controller.tsx")],
    ["@/components/AmericanSteelBackground", join(fixtureDir, "mocks/american-steel-background.tsx")],
    ["@/components/BottomTabBar", join(fixtureDir, "mocks/bottom-tab-bar.tsx")],
    ["@/contexts/AchievementsContext", join(fixtureDir, "mocks/achievements-context.ts")],
    ["@/hooks/useApi", join(fixtureDir, "mocks/use-api.ts")],
    ["@/hooks/useWatchlist", join(fixtureDir, "mocks/use-watchlist.ts")],
    ["@/hooks/useColors", join(fixtureDir, "mocks/use-colors.ts")],
    ["@/lib/commodityPriceDrivers", join(fixtureDir, "mocks/commodity-price-drivers.ts")],
  ]);

  const result = await build({
    entryPoints: [join(fixtureDir, "entry.tsx")],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2022",
    jsx: "automatic",
    loader: { ".png": "dataurl" },
    mainFields: ["browser", "module", "main"],
    conditions: ["browser"],
    plugins: [{
      name: "heat-map-browser-test-aliases",
      setup(buildApi) {
        buildApi.onResolve({ filter: /^react-native$/ }, () => ({ path: reactNativeWebEntry }));
        buildApi.onResolve({ filter: /^@\// }, ({ path }) => {
          const stub = stubs.get(path);
          if (stub) return { path: stub };
          const sourcePath = resolve(mobileDir, path.slice(2));
          if (existsSync(sourcePath)) return { path: sourcePath };
          const extension = [".tsx", ".ts", ".jsx", ".js"]
            .find((candidate) => existsSync(`${sourcePath}${candidate}`));
          return extension ? { path: `${sourcePath}${extension}` } : { errors: [{ text: `Unable to resolve ${path}.` }] };
        });
        buildApi.onResolve({ filter: /.*/ }, ({ path }) => {
          const stub = stubs.get(path);
          return stub ? { path: stub } : null;
        });
      },
    }],
  });

  return result.outputFiles[0].text;
}

function quote(symbol, overrides = {}) {
  return {
    symbol,
    name: symbol,
    price: 123.45,
    priceChangePercent: 1.2,
    returnPercent: 2.5,
    returnBasis: "adjusted_total_return",
    returnUnavailableReason: null,
    historyStartDate: "2020-01-01",
    priceTimestamp: Date.now() / 1000,
    marketSession: "regular",
    nextRegularOpenTimestamp: null,
    assetType: "stock",
    sector: "Technology",
    exchange: "NASDAQ",
    exchangeTimezone: "America/New_York",
    marketCapUsd: 250_000_000_000,
    annualizedVolatilityPercent: 72,
    riskBand: "Aggressive",
    ...overrides,
  };
}

function makeResponse(category, period, symbol, requestedSector = null) {
  const assetType = {
    stocks: "stock",
    etfs: "etf",
    commodities: "commodity",
    futures: "future",
    cryptocurrency: "cryptocurrency",
    custom: "stock",
  }[category];
  return {
    category,
    period,
    requestedSector,
    updatedAt: Date.now() / 1000,
    quotes: category === "custom"
      ? []
      : [quote(symbol, {
        assetType,
        marketSession: "after_hours",
        nextRegularOpenTimestamp: Date.parse("2030-11-29T14:30:00Z") / 1000,
      })],
    unavailableSymbols: [],
  };
}

function makeCustomResponse(period, quotes, unavailableSymbols = []) {
  return {
    category: "custom",
    period,
    requestedSector: null,
    updatedAt: Date.now() / 1000,
    quotes,
    unavailableSymbols,
  };
}

function makeFilterResponse(requestedSector = null) {
  return {
    category: "stocks",
    period: "1d",
    requestedSector,
    updatedAt: Date.now() / 1000,
    quotes: [
      quote("MATCH"),
      quote("OTHER_CAP", { name: "Other Capital Inc.", marketCapUsd: 1_000_000_000, riskBand: "Moderate" }),
      quote("OTHER_SECTOR", { sector: "Financials" }),
      quote("OTHER_EXCHANGE", { exchange: "NYSE" }),
      quote("OTHER_RISK", { riskBand: "Conservative" }),
      quote("OTHER_COMBINATION", { marketCapUsd: 5_000_000_000, exchange: "NYSE", riskBand: "Moderate" }),
    ],
    unavailableSymbols: [],
  };
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
          expression,
          awaitPromise: true,
          returnByValue: true,
        }).then((reply) => {
          if (reply.result.exceptionDetails) {
            throw new Error(reply.result.exceptionDetails.text ?? "Browser evaluation failed.");
          }
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
      if (message.id === undefined) return;
      const pending = waiting.get(message.id);
      if (!pending) return;
      waiting.delete(message.id);
      if (message.error) pending.rejectMessage(new Error(message.error.message));
      else pending.resolveMessage(message);
    });
  });
}

async function waitFor(evaluate, expression, message, timeout = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const result = await evaluate(expression);
    if (result) return result;
    await delay(40);
  }
  throw new Error(message);
}

function selector(testID) {
  return `[data-testid=${JSON.stringify(testID)}]`;
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

async function replaceTextInput(browser, testID, text) {
  await browser.evaluate(`document.querySelector(${JSON.stringify(selector(testID))})?.focus()`);
  await browser.send("Input.dispatchKeyEvent", { type: "keyDown", key: "a", modifiers: 2 });
  await browser.send("Input.dispatchKeyEvent", { type: "keyUp", key: "a", modifiers: 2 });
  await browser.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Backspace" });
  await browser.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace" });
  await browser.send("Input.insertText", { text });
}

async function assertWatchlistAddIsUnique(browser, symbol) {
  await clickTestID(browser, "heat-map-detail-add-watchlist");
  await waitFor(
    (expression) => browser.evaluate(expression),
    `document.querySelector(${JSON.stringify(selector("heat-map-detail-add-watchlist"))})?.textContent.includes("In watchlist") && document.querySelector(${JSON.stringify(selector("heat-map-detail-add-watchlist"))})?.disabled`,
    `Adding ${symbol} should update its detail card to the already-added state.`,
  );
  const assertOnlyOneEntry = async () => {
    const symbols = await browser.evaluate("window.__heatMapWatchlistSymbols");
    assert.equal(
      symbols.filter((item) => item === symbol).length,
      1,
      `${symbol} should appear only once in the watchlist.`,
    );
    assert.equal(
      new Set(symbols).size,
      symbols.length,
      "The watchlist should not contain duplicate symbols.",
    );
  };
  await assertOnlyOneEntry();
  await browser.evaluate(`window.__heatMapAddToWatchlist(${JSON.stringify(symbol)})`);
  await assertOnlyOneEntry();
}

async function waitForRequest(browser, predicateExpression, description) {
  await waitFor(
    (expression) => browser.evaluate(expression),
    `window.__heatMapBrowserTest.requests.some(${predicateExpression})`,
    `Timed out waiting for the heat-map request for ${description}.`,
  );
}

async function setResponse(browser, response) {
  await browser.evaluate(`window.__heatMapBrowserTest.setResponse(${JSON.stringify(response)})`);
}

async function setDetailResponses(browser, responses) {
  await browser.evaluate(`window.__heatMapBrowserTest.setDetailResponses(${JSON.stringify(responses)})`);
}

test("heat-map drawer interaction, late responses, and narrow-phone layout render correctly", async () => {
  const historyDate = (daysAgo) => new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
  const historyDates = {
    oldest: historyDate(3),
    selected: historyDate(2),
    gap: historyDate(1),
    latest: historyDate(0),
  };
  const selectedHistoryDateLabel = new Date(`${historyDates.selected}T00:00:00Z`)
    .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const bundle = await buildScreenBundle();
  const server = createServer((request, response) => {
    if (request.url === "/bundle.js") {
      response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      response.end(bundle);
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(`<!doctype html>
      <html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
      <style>html,body,#root{width:100%;height:100%;margin:0;padding:0}body{overflow-x:auto}</style>
      </head><body><div id="root"></div><script>
        window.__heatMapReactKeyWarnings = [];
        const originalConsoleError = console.error.bind(console);
        console.error = (...args) => {
          const message = args.map((arg) => String(arg)).join(" ");
          if (/same key|unique.*key/i.test(message)) window.__heatMapReactKeyWarnings.push(message);
          originalConsoleError(...args);
        };
        window.__heatMapTrackedIntervals = [];
        const originalSetInterval = window.setInterval.bind(window);
        const originalClearInterval = window.clearInterval.bind(window);
        window.setInterval = (callback, delay, ...args) => {
          const id = originalSetInterval(() => {}, delay);
          window.__heatMapTrackedIntervals.push({ callback, delay, args, id, cleared: false });
          return id;
        };
        window.clearInterval = (id) => {
          const tracked = window.__heatMapTrackedIntervals.find((interval) => interval.id === id);
          if (tracked) tracked.cleared = true;
          return originalClearInterval(id);
        };
      </script><script src="/bundle.js"></script></body></html>`);
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });

  const profileDir = await mkdtemp(join(tmpdir(), "heat-map-browser-"));
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
      width: 320,
      height: 720,
      deviceScaleFactor: 1,
      mobile: true,
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    await browser.send("Page.navigate", { url: `http://127.0.0.1:${address.port}/` });

    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector(${JSON.stringify(selector("heat-map-filter-open"))})`,
      "The real heat-map screen did not mount in the browser.",
    );

    const pageFitsPhone = await browser.evaluate(
      "document.documentElement.scrollWidth <= window.innerWidth && document.body.scrollWidth <= window.innerWidth",
    );
    assert.equal(pageFitsPhone, true, "The heat-map page must not overflow horizontally at 320px.");

    await browser.evaluate(`(() => {
      const state = window.__heatMapBrowserTest;
      state.setCommodityDriverResponses([
        { type: "stall" },
        { type: "resolve", payload: { up: "Gold drivers after retry.", down: "Gold downside after retry." } },
        { type: "defer" },
        { type: "resolve", payload: { up: "Fresh gold drivers.", down: "Fresh gold downside." } },
      ]);
      state.setResponse({
        ...state.initialData,
        quotes: [
          { ...state.initialData.quotes[0], symbol: "GC=F", name: "Gold", assetType: "commodity" },
          { ...state.initialData.quotes[1], symbol: "SI=F", name: "Silver", assetType: "commodity" },
        ],
      });
    })()`);
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector(${JSON.stringify(selector("heat-map-open-detail-GC=F"))})`,
      "The updated commodity quotes should render before tapping the detail tile.",
    );
    await clickTestID(browser, "heat-map-open-detail-GC=F");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector(${JSON.stringify(selector("heat-map-detail-modal"))})`,
      "The commodity detail card should open at the narrow-phone viewport.",
    );
    const commodityDetailFitsPhone = await browser.evaluate(`(() => {
      const modal = document.querySelector(${JSON.stringify(selector("heat-map-detail-modal"))});
      const content = document.querySelector(${JSON.stringify(selector("heat-map-detail-scroll"))});
      return !!modal && !!content
        && modal.getBoundingClientRect().width <= window.innerWidth
        && content.scrollWidth <= content.clientWidth + 1
        && document.documentElement.scrollWidth <= window.innerWidth;
    })()`);
    assert.equal(
      commodityDetailFitsPhone,
      true,
      "The commodity detail card and its content must fit the 320px phone viewport without horizontal overflow.",
    );
    await waitFor(
      (expression) => browser.evaluate(expression),
      `window.__heatMapBrowserTest.commodityDriverRequests.some((request) => request.symbol === "GC=F")`,
      "Opening a commodity detail card should request its price drivers.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-commodity-driver-loading"))}) !== null`),
      true,
      "Commodity price drivers should show a loading state while their request is pending.",
    );
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector(${JSON.stringify(selector("heat-map-commodity-driver-error"))})`,
      "A stalled commodity-driver request should time out to an unavailable state.",
      15_000,
    );
    assert.match(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-commodity-driver-error"))})?.textContent`),
      /Could not load commodity price drivers/,
      "A driver timeout should explain that the data could not be loaded.",
    );
    assert.equal(
      await browser.evaluate(`window.__heatMapBrowserTest.commodityDriverSignals.findLast((request) => request.symbol === "GC=F")?.signal?.aborted`),
      true,
      "A timed-out commodity-driver request should be cancelled.",
    );
    await clickTestID(browser, "heat-map-commodity-driver-retry");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `window.__heatMapBrowserTest.commodityDriverRequests.filter((request) => request.symbol === "GC=F").length === 2`,
      "Retry should issue a fresh commodity-driver request.",
    );
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-commodity-driver-up"))})?.textContent.includes("Gold drivers after retry.")`,
      "Retry should load and display the commodity price drivers.",
    );
    await clickTestID(browser, "heat-map-detail-close");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!document.querySelector(${JSON.stringify(selector("heat-map-detail-modal"))})`,
      "The retried commodity detail card should close before testing cancellation.",
    );
    await clickTestID(browser, "heat-map-open-detail-SI=F");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `window.__heatMapBrowserTest.commodityDriverRequests.filter((request) => request.symbol === "SI=F").length === 1`,
      "Selecting a different commodity should start its own driver request.",
    );
    await clickTestID(browser, "heat-map-detail-close");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `window.__heatMapBrowserTest.commodityDriverSignals.findLast((request) => request.symbol === "SI=F")?.signal?.aborted`,
      "Closing a commodity detail card should cancel its pending driver request.",
    );
    assert.equal(
      await browser.evaluate(`window.__heatMapBrowserTest.resolvePendingCommodityDriverRequest("SI=F", { up: "Stale silver drivers.", down: "Stale silver downside." })`),
      true,
      "The test should be able to resolve a non-cooperative request after cancellation.",
    );
    await delay(80);
    await clickTestID(browser, "heat-map-open-detail-GC=F");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-commodity-driver-up"))})?.textContent.includes("Fresh gold drivers.")`,
      "A late result for a closed commodity must not replace the newly selected commodity's drivers.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-commodity-driver-up"))})?.textContent.includes("Stale")`),
      false,
      "Stale commodity drivers must not appear after changing the selected commodity.",
    );
    await clickTestID(browser, "heat-map-detail-close");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!document.querySelector(${JSON.stringify(selector("heat-map-detail-modal"))})`,
      "The commodity detail should close before restoring the initial market map.",
    );
    const etfFundData = {
      symbol: "ETF_TEST",
      status: "available",
      sectorWeights: [{ sector: "Technology", weight: 0.3 }],
      sectorWeightsRetrievedAt: "2026-11-18T12:00:00Z",
      topHoldings: [{ symbol: "ALPHA", name: "Alpha Corp", weight: 0.1 }],
      topHoldingsReportedCount: 1,
      topHoldingsRetrievedAt: "2026-11-18T12:00:00Z",
      largestSector: "Technology",
      largestSectorWeight: 0.3,
    };
    await browser.evaluate(`(() => {
      const state = window.__heatMapBrowserTest;
      state.setDetailSectionResponses("etf-fund-data", [
        { type: "reject" },
        { type: "resolve", payload: ${JSON.stringify(etfFundData)} },
      ]);
      state.setDetailSectionResponses("etf-history-fit", [
        { type: "reject" },
        { type: "resolve", payload: { symbol: "ETF_TEST", status: "not_reported", marketRegime: null } },
      ]);
      state.setResponse({
        ...state.initialData,
        quotes: [...state.initialData.quotes, ${JSON.stringify(quote("ETF_TEST", { name: "Test ETF", assetType: "etf" }))}],
      });
    })()`);
    await clickTestID(browser, "heat-map-open-detail-ETF_TEST");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-detail-title"))})?.textContent === "Test ETF"`,
      "The ETF detail card should open for the test instrument.",
    );
    const etfDetailSnapshot = await browser.evaluate(`(() => ({
      fundCategory: document.querySelector(${JSON.stringify(selector("heat-map-detail-stat-fund-category"))})?.textContent,
      fundRetry: !!document.querySelector(${JSON.stringify(selector("heat-map-etf-fund-data-retry"))}),
      historyRetry: !!document.querySelector(${JSON.stringify(selector("heat-map-etf-history-retry"))}),
      sections: window.__heatMapBrowserTest.detailEndpointRequests.slice(-2),
      requests: window.__heatMapBrowserTest.detailRequests.slice(-2),
    }))()`);
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-detail-stat-fund-category"))})?.textContent === "Large Blend" && !!document.querySelector(${JSON.stringify(selector("heat-map-etf-fund-data-retry"))}) && !!document.querySelector(${JSON.stringify(selector("heat-map-etf-history-retry"))})`,
      `ETF essentials should remain available when its separate holdings and history requests fail: ${JSON.stringify(etfDetailSnapshot)}`,
    );
    assert.equal(
      await browser.evaluate(`window.__heatMapBrowserTest.detailEndpointRequests.includes("/api/stocks/heat-map/detail/ETF_TEST/etf-fund-data") && window.__heatMapBrowserTest.detailEndpointRequests.includes("/api/stocks/heat-map/detail/ETF_TEST/etf-history-fit")`),
      true,
      "Fund data and market history should load through independent endpoints.",
    );
    await clickTestID(browser, "heat-map-etf-fund-data-retry");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-detail-scroll"))})?.textContent.includes("Alpha Corp") && document.querySelector(${JSON.stringify(selector("heat-map-detail-stat-fund-category"))})?.textContent === "Large Blend"`,
      "Retrying holdings should restore provider data without replacing the loaded quote statistics.",
    );
    await clickTestID(browser, "heat-map-etf-history-retry");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-detail-scroll"))})?.textContent.includes("There is not enough reported history") && !document.querySelector(${JSON.stringify(selector("heat-map-etf-history-retry"))})`,
      "A history retry should clear only its own error and preserve the available holdings.",
    );
    await clickTestID(browser, "heat-map-detail-close");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!document.querySelector(${JSON.stringify(selector("heat-map-detail-modal"))})`,
      "The ETF detail card should close before continuing the summary retry checks.",
    );
    await browser.evaluate("window.__heatMapBrowserTest.setResponse(window.__heatMapBrowserTest.initialData)");

    await clickTestID(browser, "heat-map-open-detail-MATCH");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector(${JSON.stringify(selector("heat-map-detail-modal"))})`,
      "Tapping a heat-map tile should open its market detail card.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-detail-title"))})?.textContent`),
      "MATCH",
      "The detail card should show the instrument name.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-detail-price"))})?.textContent`),
      "$123.45",
      "The current heat-map quote should display immediately in the detail card.",
    );
    await clickTestID(browser, "heat-map-detail-add-watchlist");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-detail-add-watchlist"))})?.textContent.includes("In watchlist")`,
      "Adding the selected heat-map item should update its watchlist state.",
    );
    await browser.evaluate(`(() => {
      const state = window.__heatMapBrowserTest;
      state.setDeferNextRefetch();
      state.setNextRefetchResponse({
        ...state.data,
        quotes: state.data.quotes.map((item) => item.symbol === "MATCH" ? { ...item, price: 150.25, priceChangePercent: 4.5 } : item),
      });
    })()`);
    const refetchCountBeforeQuoteRefresh = await browser.evaluate("window.__heatMapBrowserTest.refetches.length");
    const quoteRequestCountBeforeRefresh = await browser.evaluate("window.__heatMapBrowserTest.quoteRequests.length");
    await clickTestID(browser, "heat-map-detail-refresh-quote");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `window.__heatMapBrowserTest.pendingRefetchResolvers.length === 1 && !!document.querySelector(${JSON.stringify(selector("heat-map-detail-refresh-quote"))})`,
      "Refreshing the selected quote should remain pending in the open detail card.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-detail-title"))})?.textContent === "MATCH" && document.querySelector(${JSON.stringify(selector("heat-map-detail-price"))})?.textContent === "$123.45"`),
      true,
      "The card should keep showing the same instrument and last known price while refreshing.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-detail-refresh-quote"))})?.textContent.includes("Refreshing")`),
      true,
      "The quote refresh control should show progress while the request is pending.",
    );
    for (let tap = 0; tap < 3; tap += 1) {
      await clickTestID(browser, "heat-map-detail-refresh-quote");
    }
    assert.equal(
      await browser.evaluate(`window.__heatMapBrowserTest.pendingRefetchResolvers.length === 1 && window.__heatMapBrowserTest.quoteRequests.length === ${quoteRequestCountBeforeRefresh + 1} && window.__heatMapBrowserTest.refetches.length === ${refetchCountBeforeQuoteRefresh}`),
      true,
      "Repeated taps should keep one single-ticker refresh pending without reloading the map.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-detail-refresh-quote"))})?.textContent.includes("Refreshing")`),
      true,
      "Repeated taps should not clear the progress state before the pending request completes.",
    );
    assert.equal(
      await browser.evaluate("window.__heatMapBrowserTest.resolvePendingRefetch()"),
      true,
      "The pending quote refresh should be resolvable.",
    );
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-detail-price"))})?.textContent === "$150.25"`,
      "A successful quote refresh should update the open card to the newly reported price.",
    );
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-detail-refresh-quote"))})?.getAttribute("aria-label") === "Refresh selected market quote"`,
      "The quote refresh control should become available again after the request completes.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-detail-title"))})?.textContent`),
      "MATCH",
      "Refreshing the quote should not close or switch the selected detail card.",
    );

    await setResponse(browser, {
      ...await browser.evaluate("window.__heatMapBrowserTest.data"),
      quotes: await browser.evaluate("window.__heatMapBrowserTest.data.quotes.filter((item) => item.symbol !== 'MATCH')"),
    });
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector(${JSON.stringify(selector("heat-map-detail-quote-refresh-error"))})`,
      "A successful batch that omits the selected symbol should show a retry action in the open card.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-detail-title"))})?.textContent === "MATCH" && document.querySelector(${JSON.stringify(selector("heat-map-detail-price"))})?.textContent === "$150.25" && !!document.querySelector(${JSON.stringify(selector("heat-map-detail-quote-refresh-retry"))})`),
      true,
      "An omitted symbol should keep the selected instrument and last displayed price visible with a retry path.",
    );
    await clickTestID(browser, "heat-map-detail-quote-refresh-retry");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-detail-quote-refresh-error"))})?.textContent.includes("isn't in the latest batch")`,
      "Retrying while the symbol remains unavailable should keep the last displayed quote and explain the omission.",
    );
    await browser.evaluate(`(() => {
      const state = window.__heatMapBrowserTest;
      const recoveredQuote = state.initialData.quotes.find((item) => item.symbol === "MATCH");
      state.setResponse({
        ...state.data,
        quotes: [...state.data.quotes, { ...recoveredQuote, price: 152.75, priceChangePercent: 5.7 }],
      });
    })()`);
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-detail-price"))})?.textContent === "$152.75" && !document.querySelector(${JSON.stringify(selector("heat-map-detail-quote-refresh-error"))})`,
      "A later batch containing the symbol should update the quote and clear its unavailable state.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-detail-title"))})?.textContent`),
      "MATCH",
      "Recovering the quote should not close or switch the selected detail card.",
    );

    await browser.evaluate("window.__heatMapBrowserTest.setRefetchFailures(1)");
    await clickTestID(browser, "heat-map-detail-refresh-quote");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector(${JSON.stringify(selector("heat-map-detail-quote-refresh-error"))})`,
      "A failed quote refresh should show a retry action in the open detail card.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-detail-refresh-quote"))})?.getAttribute("aria-label") === "Refresh selected market quote"`),
      true,
      "The quote refresh control should become available again after a request fails.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-detail-price"))})?.textContent === "$152.75" && document.querySelector(${JSON.stringify(selector("heat-map-detail-title"))})?.textContent === "MATCH"`),
      true,
      "A failed refresh should preserve the last successful quote and selected instrument.",
    );
    await browser.evaluate(`window.__heatMapBrowserTest.setNextRefetchResponse({
      ...window.__heatMapBrowserTest.data,
      quotes: window.__heatMapBrowserTest.data.quotes.map((item) => item.symbol === "MATCH" ? { ...item, price: 154.99, priceChangePercent: 6.2 } : item),
    })`);
    await clickTestID(browser, "heat-map-detail-quote-refresh-retry");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-detail-price"))})?.textContent === "$154.99" && !document.querySelector(${JSON.stringify(selector("heat-map-detail-quote-refresh-error"))})`,
      "Retrying the failed quote refresh should update the quote and clear its error state.",
    );

    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-detail-stat-previous-close"))})?.textContent === "$122.00"`,
      "The detail card should fill its statistics from the market-info response.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-detail-stat-revenue-ttm"))})?.textContent`),
      "$30B",
      "The detail card should show revenue with a compact value.",
    );
    const matchDetailRequestsBeforeManualRefresh = await browser.evaluate(
      'window.__heatMapBrowserTest.detailRequests.filter((url) => url.endsWith("/MATCH")).length',
    );
    await browser.evaluate(`(() => {
      const state = window.__heatMapBrowserTest;
      state.setDeferNextRefetch();
      state.setNextRefetchResponse({
        ...state.data,
        quotes: state.data.quotes.map((item) => item.symbol === "MATCH" ? { ...item, price: 155.5, priceChangePercent: 6.5 } : item),
      });
    })()`);
    await clickTestID(browser, "heat-map-detail-refresh-quote");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `window.__heatMapBrowserTest.pendingRefetchResolvers.length === 1`,
      "Refreshing the quote after statistics load should remain pending for this check.",
    );
    assert.equal(
      await browser.evaluate(`window.__heatMapBrowserTest.detailRequests.filter((url) => url.endsWith("/MATCH")).length === ${matchDetailRequestsBeforeManualRefresh}`),
      true,
      "A quote refresh must not start another market-statistics request.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-detail-stat-previous-close"))})?.textContent === "$122.00" && document.querySelector(${JSON.stringify(selector("heat-map-detail-stat-revenue-ttm"))})?.textContent === "$30B"`),
      true,
      "Loaded statistics should remain visible and unchanged while the quote refresh is pending.",
    );
    assert.equal(
      await browser.evaluate("window.__heatMapBrowserTest.resolvePendingRefetch()"),
      true,
      "The successful quote refresh should be resolvable.",
    );
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-detail-price"))})?.textContent === "$155.50"`,
      "The refreshed quote should update its price.",
    );
    assert.equal(
      await browser.evaluate(`window.__heatMapBrowserTest.detailRequests.filter((url) => url.endsWith("/MATCH")).length === ${matchDetailRequestsBeforeManualRefresh}`),
      true,
      "Completing a quote refresh must not trigger another market-statistics request.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-detail-stat-previous-close"))})?.textContent === "$122.00" && document.querySelector(${JSON.stringify(selector("heat-map-detail-stat-revenue-ttm"))})?.textContent === "$30B"`),
      true,
      "The same loaded statistics should remain visible after the quote updates.",
    );
    await setDetailResponses(browser, [{ type: "defer" }]);
    await clickTestID(browser, "heat-map-detail-refresh");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `window.__heatMapBrowserTest.detailRequests.filter((url) => url.endsWith("/MATCH")).length === ${matchDetailRequestsBeforeManualRefresh + 1}`,
      "Refreshing an open detail card should request fresh statistics even when its cache is still valid.",
    );
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector(${JSON.stringify(selector("heat-map-detail-refresh-loading"))})`,
      "A manual statistics refresh should show clear loading feedback.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-detail-title"))})?.textContent`),
      "MATCH",
      "Refreshing should keep the selected instrument in the open detail card.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-detail-stat-previous-close"))})?.textContent`),
      "$122.00",
      "Refreshing should keep the displayed statistics visible while fresh data loads.",
    );
    assert.equal(
      await browser.evaluate('window.__heatMapBrowserTest.resolvePendingDetailRequest("/api/stocks/info/MATCH", { previousClose: 122, marketCap: 250000000000 })'),
      true,
      "The pending manual statistics refresh should be resolvable.",
    );
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!document.querySelector(${JSON.stringify(selector("heat-map-detail-refresh-loading"))})`,
      "The refresh loading feedback should clear after statistics load.",
    );
    await browser.evaluate(`(() => {
      const state = window.__heatMapBrowserTest;
      state.setResponse({
        ...state.data,
        quotes: [...state.data.quotes, ${JSON.stringify(quote("LATE_TARGET", { name: "Late Target Corp." }))}],
      });
      state.setDeferNextRefetch();
      state.setNextRefetchResponse({
        ...state.data,
        quotes: state.data.quotes.map((item) => item.symbol === "MATCH"
          ? { ...item, price: 999.99, priceChangePercent: 99 }
          : item.symbol === "LATE_TARGET"
            ? { ...item, price: 123.45, priceChangePercent: 12 }
            : item),
      });
    })()`);
    await clickTestID(browser, "heat-map-detail-refresh-quote");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `window.__heatMapBrowserTest.pendingRefetchResolvers.length === 1`,
      "The first instrument's quote refresh should remain pending while it is selected.",
    );
    await clickTestID(browser, "heat-map-detail-close");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!document.querySelector(${JSON.stringify(selector("heat-map-detail-modal"))})`,
      "The first detail card should close while its quote refresh is still pending.",
    );
    await clickTestID(browser, "heat-map-open-detail-LATE_TARGET");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-detail-title"))})?.textContent === "Late Target Corp." && document.querySelector(${JSON.stringify(selector("heat-map-detail-price"))})?.textContent === "$123.45"`,
      "The second instrument's own card and quote should load before the first refresh finishes.",
    );
    assert.equal(
      await browser.evaluate("window.__heatMapBrowserTest.resolvePendingRefetch()"),
      true,
      "The first instrument's delayed quote response should be resolvable after switching cards.",
    );
    await waitFor(
      (expression) => browser.evaluate(expression),
      `window.__heatMapBrowserTest.data.quotes.find((item) => item.symbol === "MATCH")?.price === 999.99 && document.querySelector(${JSON.stringify(selector("heat-map-detail-title"))})?.textContent === "Late Target Corp."`,
      "The delayed refresh should finish without changing the newly selected card.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-detail-price"))})?.textContent`),
      "$123.45",
      "The newly selected instrument must keep its own quote instead of adopting the delayed quote.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelectorAll(${JSON.stringify(selector("heat-map-detail-quote-refresh-error"))}).length`),
      0,
      "A completed refresh from the previous instrument must not change the current card's error state.",
    );
    await clickTestID(browser, "heat-map-detail-close");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!document.querySelector(${JSON.stringify(selector("heat-map-detail-modal"))})`,
      "The second detail card should close before continuing the response-order checks.",
    );
    await browser.evaluate("window.__heatMapBrowserTest.setResponse(window.__heatMapBrowserTest.initialData)");

    await setDetailResponses(browser, [
      { type: "defer" },
      { type: "resolve", payload: { previousClose: 111, marketCap: 50_000_000_000 } },
    ]);
    await browser.evaluate(`(() => {
      const state = window.__heatMapBrowserTest;
      state.setResponse({
        ...state.data,
        quotes: state.data.quotes.map((item) => item.symbol === "OTHER_EXCHANGE"
          ? { ...item, name: "Other Exchange Corp.", price: 234.56 }
          : item),
      });
    })()`);
    await clickTestID(browser, "heat-map-open-detail-OTHER_SECTOR");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `window.__heatMapBrowserTest.pendingDetailRequests.some((request) => request.url.endsWith("/OTHER_SECTOR"))`,
      "The first instrument's statistics response should remain pending.",
    );
    assert.equal(
      await browser.evaluate(`window.__heatMapBrowserTest.detailRequestSignals.findLast((request) => request.url.endsWith("/OTHER_SECTOR"))?.signal?.aborted`),
      false,
      "A market statistics request should receive an active abort signal while its detail card is open.",
    );
    await clickTestID(browser, "heat-map-detail-close");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!document.querySelector(${JSON.stringify(selector("heat-map-detail-modal"))})`,
      "The first instrument should close while its statistics request is pending.",
    );
    await waitFor(
      (expression) => browser.evaluate(expression),
      `window.__heatMapBrowserTest.detailRequestSignals.findLast((request) => request.url.endsWith("/OTHER_SECTOR"))?.signal?.aborted`,
      "Closing a detail card should abort its outstanding statistics request.",
    );
    await clickTestID(browser, "heat-map-open-detail-OTHER_EXCHANGE");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-detail-title"))})?.textContent === "Other Exchange Corp." && document.querySelector(${JSON.stringify(selector("heat-map-detail-stat-previous-close"))})?.textContent === "$111.00"`,
      "The second instrument should load its own details before the older response arrives.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-detail-price"))})?.textContent`),
      "$234.56",
      "The second instrument's current quote should be visible while the older request is pending.",
    );
    await delay(120);
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-detail-title"))})?.textContent`),
      "Other Exchange Corp.",
      "The late response must not replace the second instrument's name.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-detail-price"))})?.textContent`),
      "$234.56",
      "The late response must not replace the second instrument's quote.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-detail-stat-previous-close"))})?.textContent`),
      "$111.00",
      "The late response must not replace the second instrument's statistics.",
    );
    await clickTestID(browser, "heat-map-detail-close");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!document.querySelector(${JSON.stringify(selector("heat-map-detail-modal"))})`,
      "The response-order test detail card should close before testing a separate instrument.",
    );

    await setDetailResponses(browser, [
      { type: "defer" },
      { type: "resolve", payload: { previousClose: 115, marketCap: 80_000_000_000 } },
    ]);
    await browser.evaluate(`(() => {
      const state = window.__heatMapBrowserTest;
      state.setResponse({
        ...state.data,
        quotes: state.data.quotes.map((item) => item.symbol === "OTHER_RISK"
          ? { ...item, name: "Other Risk Holdings", price: 345.67 }
          : item),
      });
    })()`);
    await clickTestID(browser, "heat-map-open-detail-OTHER_COMBINATION");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `window.__heatMapBrowserTest.pendingDetailRequests.some((request) => request.url.endsWith("/OTHER_COMBINATION"))`,
      "The first statistics request should remain pending before changing instruments.",
    );
    assert.equal(
      await browser.evaluate(`window.__heatMapBrowserTest.detailRequestSignals.findLast((request) => request.url.endsWith("/OTHER_COMBINATION"))?.signal?.aborted`),
      false,
      "The pending statistics request should have an active signal before closing its detail card.",
    );
    await clickTestID(browser, "heat-map-detail-close");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!document.querySelector(${JSON.stringify(selector("heat-map-detail-modal"))})`,
      "The first instrument should close while its statistics request is pending.",
    );
    await waitFor(
      (expression) => browser.evaluate(expression),
      `window.__heatMapBrowserTest.detailRequestSignals.findLast((request) => request.url.endsWith("/OTHER_COMBINATION"))?.signal?.aborted`,
      "Closing the detail card should abort the previous instrument's statistics request.",
    );
    await clickTestID(browser, "heat-map-open-detail-OTHER_RISK");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-detail-title"))})?.textContent === "Other Risk Holdings" && document.querySelector(${JSON.stringify(selector("heat-map-detail-stat-previous-close"))})?.textContent === "$115.00"`,
      "The newly selected instrument should load its own statistics successfully.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-detail-price"))})?.textContent`),
      "$345.67",
      "The newly selected instrument's quote should be visible before the old request fails.",
    );
    await delay(120);
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-detail-title"))})?.textContent`),
      "Other Risk Holdings",
      "A late failure must not replace the newly selected instrument's name.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-detail-price"))})?.textContent`),
      "$345.67",
      "A late failure must not replace the newly selected instrument's quote.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-detail-stat-previous-close"))})?.textContent`),
      "$115.00",
      "A late failure must not replace the newly selected instrument's statistics.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelectorAll(${JSON.stringify(selector("heat-map-detail-error"))}).length`),
      0,
      "A late failure must not show an error on the newly selected instrument.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelectorAll(${JSON.stringify(selector("heat-map-detail-retry"))}).length`),
      0,
      "A late failure must not add a retry prompt to the newly selected instrument.",
    );
    await clickTestID(browser, "heat-map-detail-close");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!document.querySelector(${JSON.stringify(selector("heat-map-detail-modal"))})`,
      "The delayed-failure test detail card should close before testing a separate instrument.",
    );
    await browser.evaluate("window.__heatMapBrowserTest.setResponse(window.__heatMapBrowserTest.initialData)");

    await setDetailResponses(browser, [
      { type: "reject" },
      { type: "resolve", payload: { previousClose: 121, marketCap: 100_000_000_000 } },
    ]);
    const matchDetailRequestsBeforeRefresh = await browser.evaluate(
      'window.__heatMapBrowserTest.detailRequests.filter((url) => url.endsWith("/MATCH")).length',
    );
    const expiredCacheAt = (await browser.evaluate("Date.now()")) + 6 * 60_000;
    await browser.evaluate(`(() => {
      window.__heatMapDetailOriginalDateNow = Date.now;
      Date.now = () => ${expiredCacheAt};
    })()`);
    await clickTestID(browser, "heat-map-open-detail-MATCH");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `window.__heatMapBrowserTest.detailRequests.filter((url) => url.endsWith("/MATCH")).length === ${matchDetailRequestsBeforeRefresh + 1}`,
      "Opening a detail card with expired cached statistics should refresh them.",
    );
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector(${JSON.stringify(selector("heat-map-detail-error"))}) && document.querySelector(${JSON.stringify(selector("heat-map-detail-stat-previous-close"))})?.textContent === "$122.00"`,
      "A failed refresh should keep the expired previous-close value visible with the warning.",
    );
    assert.match(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-detail-error"))})?.textContent`),
      /figures may be out of date/i,
      "A failed refresh with cached statistics should clearly identify them as potentially stale.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelectorAll(${JSON.stringify(selector("heat-map-detail-retry"))}).length`),
      1,
      "The stale-statistics warning should keep its retry control.",
    );

    await clickTestID(browser, "heat-map-detail-retry");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `window.__heatMapBrowserTest.detailRequests.filter((url) => url.endsWith("/MATCH")).length === ${matchDetailRequestsBeforeRefresh + 2}`,
      "Retry should request updated statistics after the cached refresh fails.",
    );
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-detail-stat-previous-close"))})?.textContent === "$121.00" && !document.querySelector(${JSON.stringify(selector("heat-map-detail-error"))})`,
      "A successful retry should replace the expired statistic and clear the stale-data warning.",
    );
    const matchRequestsBeforeFailedManualRefresh = await browser.evaluate(
      'window.__heatMapBrowserTest.detailRequests.filter((url) => url.endsWith("/MATCH")).length',
    );
    await setDetailResponses(browser, [{ type: "defer" }]);
    await clickTestID(browser, "heat-map-detail-refresh");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `window.__heatMapBrowserTest.detailRequests.filter((url) => url.endsWith("/MATCH")).length === ${matchRequestsBeforeFailedManualRefresh + 1}`,
      "The open detail card should accept another manual refresh request.",
    );
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector(${JSON.stringify(selector("heat-map-detail-refresh-loading"))})`,
      "The failed refresh attempt should show loading feedback while in progress.",
    );
    assert.equal(
      await browser.evaluate('window.__heatMapBrowserTest.rejectPendingDetailRequest("/api/stocks/info/MATCH")'),
      true,
      "The pending manual refresh should be rejectable for the failure test.",
    );
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector(${JSON.stringify(selector("heat-map-detail-error"))}) && document.querySelector(${JSON.stringify(selector("heat-map-detail-stat-previous-close"))})?.textContent === "$121.00"`,
      "A failed manual refresh should retain the already displayed statistics and show a warning.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelectorAll(${JSON.stringify(selector("heat-map-detail-retry"))}).length`),
      1,
      "A failed manual refresh should offer a retry path.",
    );
    await setDetailResponses(browser, [{ type: "resolve", payload: { previousClose: 122, marketCap: 250_000_000_000 } }]);
    await clickTestID(browser, "heat-map-detail-retry");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `window.__heatMapBrowserTest.detailRequests.filter((url) => url.endsWith("/MATCH")).length === ${matchRequestsBeforeFailedManualRefresh + 2}`,
      "The error retry should make a new statistics request.",
    );
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-detail-stat-previous-close"))})?.textContent === "$122.00" && !document.querySelector(${JSON.stringify(selector("heat-map-detail-error"))})`,
      "Retrying a failed manual refresh should replace the retained statistics and clear the warning.",
    );
    await browser.evaluate("Date.now = window.__heatMapDetailOriginalDateNow");
    await clickTestID(browser, "heat-map-detail-close");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!document.querySelector(${JSON.stringify(selector("heat-map-detail-modal"))})`,
      "The recovered market detail card should close before testing a separate instrument.",
    );

    await setDetailResponses(browser, [
      { type: "reject" },
      { type: "resolve", payload: [] },
      { type: "resolve", payload: { previousClose: 119, marketCap: 75_000_000_000 } },
    ]);
    await clickTestID(browser, "heat-map-open-detail-OTHER_CAP");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector(${JSON.stringify(selector("heat-map-detail-error"))})`,
      "A failed statistics request should show an unavailable-data message and retry control.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-detail-title"))})?.textContent`),
      "Other Capital Inc.",
      "A failed statistics request must leave the instrument name visible.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-detail-price"))})?.textContent`),
      "$123.45",
      "A failed statistics request must leave the current quote visible.",
    );
    assert.match(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-detail-error"))})?.textContent`),
      /Market statistics could not be loaded/,
      "A provider or network failure should explain that statistics are unavailable.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelectorAll(${JSON.stringify(selector("heat-map-detail-retry"))}).length`),
      1,
      "The unavailable-data message should include a retry control.",
    );
    assert.equal(
      await browser.evaluate(`window.__heatMapBrowserTest.detailRequests.filter((url) => url.endsWith("/OTHER_CAP")).length`),
      1,
      "Opening the card should make one statistics request for the selected instrument.",
    );

    await clickTestID(browser, "heat-map-detail-retry");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `window.__heatMapBrowserTest.detailRequests.filter((url) => url.endsWith("/OTHER_CAP")).length === 2`,
      "Retry should request statistics again after a network failure.",
    );
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector(${JSON.stringify(selector("heat-map-detail-error"))})`,
      "A malformed statistics response should keep the unavailable-data message visible.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-detail-title"))})?.textContent`),
      "Other Capital Inc.",
      "A malformed statistics response must leave the instrument name visible.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-detail-price"))})?.textContent`),
      "$123.45",
      "A malformed statistics response must leave the current quote visible.",
    );

    await clickTestID(browser, "heat-map-detail-retry");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `window.__heatMapBrowserTest.detailRequests.filter((url) => url.endsWith("/OTHER_CAP")).length === 3`,
      "Retry should make another statistics request after a malformed response.",
    );
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-detail-stat-previous-close"))})?.textContent === "$119.00" && !document.querySelector(${JSON.stringify(selector("heat-map-detail-error"))})`,
      "Retry should load fresh statistics and clear the unavailable-data message.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-detail-title"))})?.textContent`),
      "Other Capital Inc.",
      "Successful retry should keep the instrument name visible.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-detail-price"))})?.textContent`),
      "$123.45",
      "Successful retry should keep the current quote visible.",
    );
    await clickTestID(browser, "heat-map-detail-close");

    await browser.evaluate(`(() => {
      const state = window.__heatMapBrowserTest;
      state.setResponse({
        ...state.initialData,
        quotes: state.initialData.quotes.map((item) => item.symbol === "OTHER_CAP"
          ? { ...item, symbol: "OTHER_TIMEOUT", name: "Other Timeout Corp." }
          : item),
      });
    })()`);
    await setDetailResponses(browser, [
      { type: "stall" },
      { type: "resolve", payload: { previousClose: 118, marketCap: 76_000_000_000 } },
    ]);
    await clickTestID(browser, "heat-map-open-detail-OTHER_TIMEOUT");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `window.__heatMapBrowserTest.detailRequests.some((url) => url.endsWith("/OTHER_TIMEOUT"))`,
      "Opening the new detail card should start its statistics request.",
    );
    assert.equal(
      await browser.evaluate(`window.__heatMapBrowserTest.detailRequestSignals.findLast((request) => request.url.endsWith("/OTHER_TIMEOUT"))?.signal?.aborted`),
      false,
      "The stalled request should begin with an active abort signal.",
    );
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector(${JSON.stringify(selector("heat-map-detail-error"))})`,
      "A stalled request should time out and show the existing unavailable-data message.",
      15_000,
    );
    assert.match(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-detail-error"))})?.textContent`),
      /Market statistics could not be loaded/,
      "A timeout without cached statistics should use the unavailable-data message.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelectorAll(${JSON.stringify(selector("heat-map-detail-retry"))}).length`),
      1,
      "A timed-out request should offer retry.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelectorAll(${JSON.stringify(selector("heat-map-detail-loading"))}).length`),
      0,
      "A timed-out request should stop showing the loading indicator even if its promise never settles.",
    );
    assert.equal(
      await browser.evaluate(`window.__heatMapBrowserTest.detailRequestSignals.findLast((request) => request.url.endsWith("/OTHER_TIMEOUT"))?.signal?.aborted`),
      true,
      "The timeout should abort the stalled request.",
    );

    await clickTestID(browser, "heat-map-detail-retry");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `window.__heatMapBrowserTest.detailRequests.filter((url) => url.endsWith("/OTHER_TIMEOUT")).length === 2`,
      "Retry should start a new statistics request after a timeout.",
    );
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-detail-stat-previous-close"))})?.textContent === "$118.00" && !document.querySelector(${JSON.stringify(selector("heat-map-detail-error"))})`,
      "A successful retry should show fresh statistics and clear the timeout message.",
    );
    await clickTestID(browser, "heat-map-detail-close");
    await browser.evaluate("window.__heatMapBrowserTest.setResponse(window.__heatMapBrowserTest.initialData)");

    await browser.evaluate("window.__heatMapBrowserTest.setResponse(null)");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector(${JSON.stringify(selector("heat-map-fast-snapshot-note"))})`,
      "The quick daily snapshot should display while the full history request is pending.",
    );
    const quickSnapshotShowsQuotes = await browser.evaluate(
      'document.body.innerText.includes("MATCH")',
    );
    assert.equal(quickSnapshotShowsQuotes, true, "The map should show daily quotes before history finishes loading.");
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-counted-quotes"))})?.textContent`),
      "11",
      "The breadth snapshot should count each ticker only once even when the quote response repeats it.",
    );
    for (const symbol of ["HPE", "PURR", "UUUU", "SLB", "KLAC"]) {
      assert.equal(
        await browser.evaluate(`document.querySelectorAll(${JSON.stringify(selector(`heat-map-session-${symbol}`))}).length`),
        1,
        `${symbol} should appear as one tile even when it is repeated in the response.`,
      );
    }
    const hpeTileBoundsBeforeRepeat = await browser.evaluate(`(() => {
      const tile = document.querySelector(${JSON.stringify(selector("heat-map-session-HPE"))});
      const bounds = tile?.getBoundingClientRect();
      return bounds ? [bounds.x, bounds.y, bounds.width, bounds.height] : null;
    })()`);
    await browser.evaluate("window.__heatMapBrowserTest.setResponse(null)");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-counted-quotes"))})?.textContent === "11"`,
      "Repeated screener data should still render after a subsequent update.",
    );
    assert.deepEqual(
      await browser.evaluate(`(() => {
        const tile = document.querySelector(${JSON.stringify(selector("heat-map-session-HPE"))});
        const bounds = tile?.getBoundingClientRect();
        return bounds ? [bounds.x, bounds.y, bounds.width, bounds.height] : null;
      })()`),
      hpeTileBoundsBeforeRepeat,
      "HPE should keep its tile position when the same duplicate response is rendered again.",
    );
    assert.deepEqual(
      await browser.evaluate("window.__heatMapReactKeyWarnings"),
      [],
      "Repeated screener tickers must not produce React key warnings.",
    );
    await browser.evaluate("window.__heatMapBrowserTest.setResponse(window.__heatMapBrowserTest.initialData)");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!document.querySelector(${JSON.stringify(selector("heat-map-fast-snapshot-note"))})`,
      "The full history response should replace the quick snapshot when it arrives.",
    );

    // Each period, including 1D, must become stale when a later period is selected.
    await clickTestID(browser, "heat-map-filter-open");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector(${JSON.stringify(selector("heat-map-filter-drawer"))})`,
      "The filter drawer should open before selecting its period controls.",
    );
    const periodIds = ["1w", "1m", "3m", "6m", "1y", "3y", "5y", "max", "1d"];
    const periodLabels = new Map([
      ["1d", "1D"], ["1w", "1W"], ["1m", "1M"], ["3m", "3M"], ["6m", "6M"],
      ["1y", "1Y"], ["3y", "3Y"], ["5y", "5Y"], ["max", "Max"],
    ]);
    let previousPeriod = "1d";
    for (const nextPeriod of periodIds) {
      await clickTestID(browser, `heat-map-drawer-period-${nextPeriod}`);
      await waitForRequest(
        browser,
        `(request) => request.category === "stocks" && request.period === ${JSON.stringify(nextPeriod)}`,
        nextPeriod,
      );
      const lateSymbol = `LATE_PERIOD_${previousPeriod.toUpperCase()}`;
      await setResponse(browser, makeResponse("stocks", previousPeriod, lateSymbol));
      const staleVisible = await browser.evaluate(
        `!!document.querySelector(${JSON.stringify(selector(`heat-map-session-${lateSymbol}`))})`,
      );
      assert.equal(staleVisible, false, `A late ${previousPeriod} response must not replace ${nextPeriod}.`);

      const currentSymbol = `CURRENT_PERIOD_${nextPeriod.toUpperCase()}`;
      await setResponse(browser, makeResponse("stocks", nextPeriod, currentSymbol));
      await waitFor(
        (expression) => browser.evaluate(expression),
        `!!document.querySelector(${JSON.stringify(selector(`heat-map-session-${currentSymbol}`))})`,
        `The selected ${nextPeriod} response should render.`,
      );
      assert.equal(
        await browser.evaluate(`!!document.querySelector(${JSON.stringify(selector(`heat-map-next-open-${currentSymbol}`))})`),
        false,
        "Stocks should show one shared market status instead of next-open text in every hexagon.",
      );
      const statusVisual = await browser.evaluate(`(() => {
        const status = document.querySelector(${JSON.stringify(selector("heat-map-market-status"))});
        const label = document.querySelector(${JSON.stringify(selector("heat-map-market-status-label"))});
        const tile = document.querySelector(${JSON.stringify(selector(`heat-map-session-${currentSymbol}`))});
        return {
          text: label?.textContent.trim(),
          color: label ? getComputedStyle(label).color : null,
          aboveTiles: Boolean(status && tile && status.getBoundingClientRect().bottom < tile.getBoundingClientRect().top),
        };
      })()`);
      assert.equal(statusVisual.text, "OPEN · EXTENDED HOURS", "After-hours trading should be called out in the shared status.");
      assert.equal(statusVisual.color, "rgb(101, 201, 139)", "An active extended-hours session should use the green open color.");
      assert.equal(statusVisual.aboveTiles, true, "The shared status should sit above the hexagons.");
      assert.match(
        await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-selected-period"))}).textContent`),
        new RegExp(periodLabels.get(nextPeriod)),
      );
      previousPeriod = nextPeriod;
    }
    await clickTestID(browser, "heat-map-filter-close");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!document.querySelector(${JSON.stringify(selector("heat-map-filter-drawer"))})`,
      "The drawer should close after testing its period choices.",
    );

    const preMarketResponse = makeResponse("stocks", "1d", "PREMARKET_STATUS");
    preMarketResponse.quotes[0].marketSession = "pre_market";
    await setResponse(browser, preMarketResponse);
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-market-status-label"))})?.textContent.trim() === "OPEN · PRE-MARKET"`,
      "Pre-market trading should appear as open with its session identified.",
    );
    assert.equal(
      await browser.evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(selector("heat-map-market-status-label"))})).color`),
      "rgb(101, 201, 139)",
      "Pre-market trading should use the green open color.",
    );

    const closedResponse = makeResponse("stocks", "1d", "CLOSED_STATUS");
    closedResponse.quotes[0].marketSession = "closed";
    await setResponse(browser, closedResponse);
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-market-status-label"))})?.textContent.trim() === "MARKET CLOSED"`,
      "Closed regular trading should appear as market closed.",
    );
    assert.equal(
      await browser.evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(selector("heat-map-market-status-label"))})).color`),
      "rgb(240, 124, 121)",
      "A closed session should use the red closed color.",
    );

    // Change through every category and send each old category's response after selection changes.
    const categories = ["etfs", "commodities", "futures", "cryptocurrency", "custom", "stocks"];
    let previousCategory = "stocks";
    for (const nextCategory of categories) {
      await clickTestID(browser, "heat-map-category-picker");
      await clickTestID(browser, `heat-map-category-${nextCategory}`);
      await waitForRequest(
        browser,
        `(request) => request.category === ${JSON.stringify(nextCategory)} && request.period === "1d"`,
        nextCategory,
      );

      const pickerLabel = await browser.evaluate(
        `document.querySelector(${JSON.stringify(selector("heat-map-category-picker"))}).getAttribute("aria-label")`,
      );
      assert.match(pickerLabel, new RegExp(nextCategory === "cryptocurrency" ? "Cryptocurrency" : nextCategory === "etfs" ? "ETFs" : nextCategory[0].toUpperCase() + nextCategory.slice(1)));

      const lateSymbol = `LATE_CATEGORY_${previousCategory.toUpperCase()}`;
      await setResponse(browser, makeResponse(previousCategory, "1d", lateSymbol));
      const staleVisible = await browser.evaluate(
        `!!document.querySelector(${JSON.stringify(selector(`heat-map-session-${lateSymbol}`))})`,
      );
      assert.equal(staleVisible, false, `A late ${previousCategory} response must not replace ${nextCategory}.`);

      if (nextCategory !== "custom") {
        const currentSymbol = nextCategory === "commodities"
          ? "GC=F"
          : nextCategory === "futures"
            ? "ES=F"
            : `CURRENT_CATEGORY_${nextCategory.toUpperCase()}`;
        await setResponse(browser, makeResponse(nextCategory, "1d", currentSymbol));
        await waitFor(
          (expression) => browser.evaluate(expression),
          `!!document.querySelector(${JSON.stringify(selector(`heat-map-session-${currentSymbol}`))})`,
          `The selected ${nextCategory} response should render.`,
        );
        const expectedName = nextCategory === "commodities"
          ? "Gold"
          : nextCategory === "futures"
            ? "S&P 500"
            : null;
        if (expectedName) {
          assert.equal(
            await browser.evaluate(
              `document.querySelector(${JSON.stringify(selector(`heat-map-instrument-name-${currentSymbol}`))})?.textContent.trim()`,
            ),
            expectedName,
            `${nextCategory} tiles should show a clear instrument name.`,
          );
          assert.equal(
            await browser.evaluate(
              `!!document.querySelector(${JSON.stringify(selector(`heat-map-instrument-icon-${currentSymbol}`))})`,
            ),
            true,
            `${nextCategory} tiles should show a matching illustration.`,
          );
          const identityLayout = await browser.evaluate(`(() => {
              const name = document.querySelector(${JSON.stringify(selector(`heat-map-instrument-name-${currentSymbol}`))});
              const icon = document.querySelector(${JSON.stringify(selector(`heat-map-instrument-icon-${currentSymbol}`))});
              const tile = name?.parentElement?.parentElement;
              if (!name || !icon || !tile) return null;
              const nameRect = name.getBoundingClientRect();
              const iconRect = icon.getBoundingClientRect();
              const tileRect = tile.getBoundingClientRect();
              return {
                textAlign: getComputedStyle(name).textAlign,
                centerOffset: Math.abs((nameRect.left + nameRect.right) / 2 - (tileRect.left + tileRect.right) / 2),
                iconAboveName: iconRect.bottom <= nameRect.top + 1,
              };
            })()`);
          assert.ok(identityLayout, `${nextCategory} names and icons should share the centered tile header.`);
          assert.equal(identityLayout.textAlign, "center", `${nextCategory} names should be centered in the hexagon.`);
          assert.ok(identityLayout.centerOffset <= 1, `${nextCategory} names should align with the hexagon center.`);
          assert.equal(identityLayout.iconAboveName, true, `The ${nextCategory} illustration should sit above the centered name.`);
        }
      } else {
        await setResponse(browser, makeResponse("custom", "1d", ""));
        assert.equal(
          await browser.evaluate(`!!document.querySelector(${JSON.stringify(selector("heat-map-market-status"))})`),
          false,
          "An empty custom map should not show market status without quote data.",
        );
      }
      const hasSharedStatus = await browser.evaluate(
        `!!document.querySelector(${JSON.stringify(selector("heat-map-market-status"))})`,
      );
      assert.equal(
        hasSharedStatus,
        nextCategory === "etfs" || nextCategory === "stocks",
        `${nextCategory} should only show the shared market status when it is an equity category with quotes.`,
      );
      previousCategory = nextCategory;
    }

    await setResponse(browser, makeFilterResponse());
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-counted-quotes"))})?.textContent === "6"`,
      "The stock fixture should contain all six filter test quotes.",
    );
    const tileVisuals = await browser.evaluate(`(() => {
      const session = document.querySelector(${JSON.stringify(selector("heat-map-session-MATCH"))});
      const change = document.querySelector(${JSON.stringify(selector("heat-map-change-MATCH"))});
      const price = document.querySelector(${JSON.stringify(selector("heat-map-price-MATCH"))});
      const tile = session?.parentElement;
      if (!session || !change || !price || !tile) return null;
      return {
        width: tile.getBoundingClientRect().width,
        sessionFontSize: Number.parseFloat(getComputedStyle(session).fontSize),
        changeFontSize: Number.parseFloat(getComputedStyle(change).fontSize),
        priceFontSize: Number.parseFloat(getComputedStyle(price).fontSize),
        priceColor: getComputedStyle(price).color,
      };
    })()`);
    assert.ok(tileVisuals, "A fixture quote should render its session label inside a hexagon.");
    assert.ok(tileVisuals.width > 98, "The rendered hexagon should be larger than the previous 98px narrow-phone size.");
    assert.ok(tileVisuals.sessionFontSize > 7, "The session label should be larger than the previous 7px size.");
    assert.ok(tileVisuals.priceFontSize > 10, "The price should be larger than its previous 10px size.");
    assert.ok(tileVisuals.priceFontSize < tileVisuals.changeFontSize, "The percentage change should remain the primary label.");
    assert.equal(tileVisuals.priceColor, "rgb(234, 240, 246)", "The price should use the brighter foreground color.");
    assert.equal(
      await browser.evaluate("document.documentElement.scrollWidth <= window.innerWidth && document.body.scrollWidth <= window.innerWidth"),
      true,
      "The enlarged heat-map tiles must not overflow horizontally at 320px.",
    );

    // Open, close with the button, reopen, dismiss through the backdrop.
    await clickTestID(browser, "heat-map-filter-open");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector(${JSON.stringify(selector("heat-map-filter-drawer"))})`,
      "The filter drawer should open.",
    );
    await clickTestID(browser, "heat-map-filter-close");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!document.querySelector(${JSON.stringify(selector("heat-map-filter-drawer"))})`,
      "The close button should dismiss the filter drawer.",
    );
    await clickTestID(browser, "heat-map-filter-open");
    await clickTestID(browser, "heat-map-filter-backdrop");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!document.querySelector(${JSON.stringify(selector("heat-map-filter-drawer"))})`,
      "Tapping the backdrop should dismiss the filter drawer.",
    );

    await clickTestID(browser, "heat-map-filter-open");
    const drawerLayout = await waitFor(
      (expression) => browser.evaluate(expression),
      `(() => {
        const drawer = document.querySelector(${JSON.stringify(selector("heat-map-filter-drawer"))});
        const scroll = document.querySelector(${JSON.stringify(selector("heat-map-filter-scroll"))});
        const actions = document.querySelector(${JSON.stringify(selector("heat-map-filter-actions"))});
        if (!drawer || !scroll || !actions || !scroll.clientHeight) return null;
        const rect = (element) => { const value = element.getBoundingClientRect(); return { left:value.left,right:value.right,top:value.top,bottom:value.bottom,width:value.width,height:value.height }; };
        return { viewport:window.innerWidth, pageWidth:document.documentElement.scrollWidth, bodyWidth:document.body.scrollWidth, drawer:rect(drawer), scroll:rect(scroll), actions:rect(actions), scrollHeight:scroll.scrollHeight, clientHeight:scroll.clientHeight };
      })()`,
      "The filter drawer's scroll area should render.",
    );
    assert.equal(drawerLayout.viewport, 320);
    assert.ok(drawerLayout.drawer.left >= 0, "The drawer's left edge must stay on screen.");
    assert.ok(drawerLayout.drawer.right <= 320, "The drawer's right edge must stay on screen.");
    assert.ok(drawerLayout.pageWidth <= 320, "The open drawer must not cause horizontal page overflow.");
    assert.ok(drawerLayout.bodyWidth <= 320, "The open drawer must not cause body-level horizontal overflow.");
    assert.ok(drawerLayout.scrollHeight > drawerLayout.clientHeight, "Filter sections must scroll inside the drawer.");
    assert.ok(drawerLayout.actions.top >= drawerLayout.scroll.bottom - 1, "Drawer actions must remain outside the scrolling content.");
    assert.ok(drawerLayout.actions.bottom <= drawerLayout.drawer.bottom, "The drawer actions must not be clipped below the phone viewport.");

    const scrollProgress = await browser.evaluate(`(() => {
      const scroll = document.querySelector(${JSON.stringify(selector("heat-map-filter-scroll"))});
      scroll.scrollTop = scroll.scrollHeight;
      const explanation = document.querySelector(${JSON.stringify(selector("heat-map-filter-risk-explanation"))});
      const scrollRect = scroll.getBoundingClientRect();
      const riskRect = explanation.getBoundingClientRect();
      return {
        scrollTop: scroll.scrollTop,
        riskTop: riskRect.top,
        riskBottom: riskRect.bottom,
        scrollTopEdge: scrollRect.top,
        scrollBottomEdge: scrollRect.bottom,
      };
    })()`);
    assert.ok(scrollProgress.scrollTop > 0, "The drawer must scroll internally.");
    assert.ok(scrollProgress.riskTop >= scrollProgress.scrollTopEdge - 1, "The bottom content must not be clipped at the top of the scroll viewport.");
    assert.ok(scrollProgress.riskBottom <= scrollProgress.scrollBottomEdge + 1, "The last filter explanation must be reachable without being clipped.");

    // Pick four independent filters and ensure they combine into the one matching quote.
    const combinedFilterIDs = [
      "heat-map-filter-sector-Technology",
      "heat-map-filter-cap-Mega",
      "heat-map-filter-exchange-NASDAQ",
      "heat-map-filter-risk-Aggressive",
    ];
    for (let index = 0; index < combinedFilterIDs.length; index += 1) {
      await clickTestID(browser, combinedFilterIDs[index]);
      const expected = `${index + 1} selected`;
      await waitFor(
        (expression) => browser.evaluate(expression),
        `document.querySelector(${JSON.stringify(selector("heat-map-filter-selection-count"))})?.textContent.startsWith(${JSON.stringify(expected)})`,
        `The drawer should show ${expected} after combining filters.`,
      );
    }

    await clickTestID(browser, "heat-map-filter-apply");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!document.querySelector(${JSON.stringify(selector("heat-map-filter-drawer"))})`,
      "Applying filters should close the drawer.",
    );
    await waitForRequest(
      browser,
      `(request) => request.category === "stocks" && request.period === "1d" && request.sector === "Technology"`,
      "the selected stock sector",
    );
    await setResponse(browser, makeFilterResponse("Technology"));
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-counted-quotes"))})?.textContent === "1"`,
      "Combined filters should leave only the matching quote.",
    );
    assert.match(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-filter-open"))}).getAttribute("aria-label")`),
      /4 active/,
    );

    // Keep a non-default period, stock sector, and client filters selected while
    // the screen crosses the next regular open.
    await clickTestID(browser, "heat-map-filter-open");
    await clickTestID(browser, "heat-map-drawer-period-1w");
    await clickTestID(browser, "heat-map-filter-apply");
    await waitForRequest(
      browser,
      `(request) => request.category === "stocks" && request.period === "1w" && request.sector === "Technology"`,
      "the selected period with the stock sector",
    );
    const regularQuoteResponse = {
      category: "stocks",
      period: "1w",
      requestedSector: "Technology",
      updatedAt: Date.now() / 1000,
      quotes: [quote("MATCH", { marketSession: "regular" })],
      unavailableSymbols: [],
    };
    await setResponse(browser, regularQuoteResponse);
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-counted-quotes"))})?.textContent === "1"`,
      "the selected filters should match the active regular-session response.",
    );

    const refetchCountBeforeCadence = await browser.evaluate("window.__heatMapBrowserTest.refetches.length");
    await browser.evaluate("window.__heatMapBrowserTest.setRefetchFailures(1)");
    await browser.evaluate(`(() => {
      const activeIntervals = window.__heatMapTrackedIntervals.filter((item) => item.delay === 60_000 && !item.cleared);
      window.__heatMapTestRegularInterval = activeIntervals.at(-1);
      if (!window.__heatMapTestRegularInterval) throw new Error("The regular-session refresh interval was not started.");
      window.__heatMapTestRegularInterval.callback(...window.__heatMapTestRegularInterval.args);
      window.__heatMapTestRegularInterval.callback(...window.__heatMapTestRegularInterval.args);
    })()`);
    await waitFor(
      (expression) => browser.evaluate(expression),
      `window.__heatMapBrowserTest.refetches.length === ${refetchCountBeforeCadence + 1}`,
      "one cadence tick should refresh the active regular-session map.",
    );
    await delay(50);
    assert.equal(
      await browser.evaluate("window.__heatMapBrowserTest.refetches.length"),
      refetchCountBeforeCadence + 1,
      "rapid duplicate cadence callbacks should not create duplicate quote requests.",
    );
    assert.deepEqual(
      await browser.evaluate("window.__heatMapBrowserTest.refetches.at(-1)"),
      { category: "stocks", period: "1w", sector: "Technology" },
      "the cadence refresh should keep the selected query parameters.",
    );
    assert.match(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-filter-open"))}).getAttribute("aria-label")`),
      /4 active/,
      "the cadence refresh should keep the locally selected filters.",
    );
    await browser.evaluate(`window.__heatMapTestRegularInterval.callback(...window.__heatMapTestRegularInterval.args)`);
    await waitFor(
      (expression) => browser.evaluate(expression),
      `window.__heatMapBrowserTest.refetches.length === ${refetchCountBeforeCadence + 2}`,
      "a later cadence tick should recover after one quote request fails.",
    );
    await delay(50);
    assert.equal(
      await browser.evaluate("window.__heatMapBrowserTest.refetches.length"),
      refetchCountBeforeCadence + 2,
      "a recovered cadence tick should not cause an extra request.",
    );

    const refetchCountBeforeBackground = await browser.evaluate("window.__heatMapBrowserTest.refetches.length");
    await browser.evaluate(`(() => {
      window.__heatMapOriginalVisibilityDescriptor = Object.getOwnPropertyDescriptor(document, "visibilityState");
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    })()`);
    await waitFor(
      (expression) => browser.evaluate(expression),
      "window.__heatMapTestRegularInterval.cleared",
      "backgrounding the app should stop its regular-session refresh interval.",
    );
    await browser.evaluate(`window.__heatMapTestRegularInterval.callback(...window.__heatMapTestRegularInterval.args)`);
    await delay(50);
    assert.equal(
      await browser.evaluate("window.__heatMapBrowserTest.refetches.length"),
      refetchCountBeforeBackground,
      "a stale interval callback must not refresh while the app is backgrounded.",
    );
    await browser.evaluate(`(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    })()`);
    await waitFor(
      (expression) => browser.evaluate(expression),
      `window.__heatMapBrowserTest.refetches.length === ${refetchCountBeforeBackground + 1}`,
      "returning to the foreground should refresh the active map once.",
    );
    await browser.evaluate(`(() => {
      const activeIntervals = window.__heatMapTrackedIntervals.filter((item) => item.delay === 60_000 && !item.cleared);
      window.__heatMapTestRegularInterval = activeIntervals.at(-1);
      if (!window.__heatMapTestRegularInterval) throw new Error("The refresh interval did not resume in the foreground.");
      window.__heatMapSetFocused(false);
    })()`);
    await waitFor(
      (expression) => browser.evaluate(expression),
      "window.__heatMapTestRegularInterval.cleared",
      "leaving the heat-map screen should stop its regular-session refresh interval.",
    );
    const refetchCountBeforeBlur = await browser.evaluate("window.__heatMapBrowserTest.refetches.length");
    await browser.evaluate(`window.__heatMapTestRegularInterval.callback(...window.__heatMapTestRegularInterval.args)`);
    await delay(50);
    assert.equal(
      await browser.evaluate("window.__heatMapBrowserTest.refetches.length"),
      refetchCountBeforeBlur,
      "a stale interval callback must not refresh after the heat-map screen loses focus.",
    );
    await browser.evaluate("window.__heatMapSetFocused(true)");
    await waitFor(
      (expression) => browser.evaluate(expression),
      "window.__heatMapTrackedIntervals.filter((item) => item.delay === 60_000 && !item.cleared).length === 2",
      "returning to the heat-map screen should start one fresh refresh interval.",
    );
    await browser.evaluate(`(() => {
      if (window.__heatMapOriginalVisibilityDescriptor) {
        Object.defineProperty(document, "visibilityState", window.__heatMapOriginalVisibilityDescriptor);
        delete window.__heatMapOriginalVisibilityDescriptor;
      } else {
        delete document.visibilityState;
      }
    })()`);

    const simulatedNowMs = await browser.evaluate(`(() => {
      window.__heatMapOriginalDateNow = Date.now;
      const now = Date.now() + 3_000;
      Date.now = () => now;
      return now;
    })()`);
    const scheduledOpen = simulatedNowMs / 1000 + 0.3;
    const refetchCountBeforeOpen = await browser.evaluate("window.__heatMapBrowserTest.refetches.length");
    await browser.evaluate("window.__heatMapBrowserTest.setRefetchFailures(1)");
    await setResponse(browser, {
      category: "stocks",
      period: "1w",
      requestedSector: "Technology",
      updatedAt: simulatedNowMs / 1000,
      quotes: [quote("MATCH", {
        priceTimestamp: simulatedNowMs / 1000,
        marketSession: "closed",
        nextRegularOpenTimestamp: scheduledOpen,
      })],
      unavailableSymbols: [],
    });
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-session-MATCH"))})?.textContent === "Last close"`,
      "The selected map should show its closed-session quote before the scheduled open.",
    );
    await waitFor(
      (expression) => browser.evaluate(expression),
      `window.__heatMapBrowserTest.refetches.length === ${refetchCountBeforeOpen + 1}`,
      "The open heat map should automatically refresh after the scheduled regular open.",
    );
    assert.deepEqual(
      await browser.evaluate("window.__heatMapBrowserTest.refetches.at(-1)"),
      { category: "stocks", period: "1w", sector: "Technology" },
      "The scheduled refresh should reuse the selected category, period, and sector.",
    );
    const recoveredAt = await browser.evaluate("Date.now() / 1000");
    await browser.evaluate(`window.__heatMapBrowserTest.setNextRefetchResponse({
      category: "stocks",
      period: "1w",
      requestedSector: "Technology",
      updatedAt: ${recoveredAt},
      quotes: [${JSON.stringify(quote("MATCH", {
        priceTimestamp: Date.now() / 1000,
        marketSession: "regular",
        nextRegularOpenTimestamp: null,
      }))}],
      unavailableSymbols: [],
    })`);
    await delay(300);
    assert.equal(
      await browser.evaluate("window.__heatMapBrowserTest.refetches.length"),
      refetchCountBeforeOpen + 1,
      "A failed scheduled request should wait before retrying.",
    );
    await waitFor(
      (expression) => browser.evaluate(expression),
      `window.__heatMapBrowserTest.refetches.length === ${refetchCountBeforeOpen + 2}`,
      "The failed scheduled refresh should get exactly one delayed retry.",
    );
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-session-MATCH"))})?.textContent === "Regular"`,
      "The successful retry should replace the closed-session label with Regular.",
    );
    await delay(250);
    assert.equal(
      await browser.evaluate("window.__heatMapBrowserTest.refetches.length"),
      refetchCountBeforeOpen + 2,
      "A successful retry should not trigger further automatic requests.",
    );
    assert.match(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-selected-period"))}).textContent`),
      /1W/,
    );
    assert.match(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-filter-open"))}).getAttribute("aria-label")`),
      /4 active/,
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-counted-quotes"))})?.textContent`),
      "1",
      "The selected filters should remain applied after the refreshed response arrives.",
    );

    // Two failures exhaust the one-retry budget for a separate scheduled open.
    const exhaustedOpen = simulatedNowMs / 1000 + 0.6;
    const refetchCountBeforeExhaustion = await browser.evaluate("window.__heatMapBrowserTest.refetches.length");
    await browser.evaluate("window.__heatMapBrowserTest.setRefetchFailures(2)");
    await setResponse(browser, {
      category: "stocks",
      period: "1w",
      requestedSector: "Technology",
      updatedAt: simulatedNowMs / 1000,
      quotes: [quote("MATCH", {
        priceTimestamp: simulatedNowMs / 1000,
        marketSession: "closed",
        nextRegularOpenTimestamp: exhaustedOpen,
      })],
      unavailableSymbols: [],
    });
    await waitFor(
      (expression) => browser.evaluate(expression),
      `window.__heatMapBrowserTest.refetches.length === ${refetchCountBeforeExhaustion + 1}`,
      "The second scheduled-open refresh should make its initial attempt.",
    );
    await waitFor(
      (expression) => browser.evaluate(expression),
      `window.__heatMapBrowserTest.refetches.length === ${refetchCountBeforeExhaustion + 2}`,
      "A second failure should still receive only one retry.",
    );
    await delay(1_250);
    assert.equal(
      await browser.evaluate("window.__heatMapBrowserTest.refetches.length"),
      refetchCountBeforeExhaustion + 2,
      "Repeated failures must exhaust the retry budget without further requests.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-session-MATCH"))})?.textContent`),
      "Last close",
      "The map should retain its last valid session label after retry exhaustion.",
    );
    assert.match(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-selected-period"))}).textContent`),
      /1W/,
      "Retry exhaustion should not change the active map period.",
    );
    assert.match(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-filter-open"))}).getAttribute("aria-label")`),
      /4 active/,
      "Retry exhaustion should not change active map filters.",
    );
    const missedOpen = simulatedNowMs / 1000 + 2;
    const resumedAtMs = (missedOpen + 2) * 1000;
    const refetchCountBeforeResume = await browser.evaluate("window.__heatMapBrowserTest.refetches.length");
    await browser.evaluate(`(() => {
      window.__heatMapHeldOpenTimeouts = [];
      window.__heatMapOriginalSetTimeout = window.setTimeout;
      window.__holdHeatMapOpenTimeout = true;
      window.setTimeout = function(callback, delay, ...args) {
        if (window.__holdHeatMapOpenTimeout && delay > 1_500 && delay < 10_000) {
          const id = window.__heatMapOriginalSetTimeout(() => {}, 60_000);
          window.__heatMapHeldOpenTimeouts.push({ callback, args, id });
          return id;
        }
        return window.__heatMapOriginalSetTimeout(callback, delay, ...args);
      };
      window.__heatMapOriginalVisibilityDescriptor = Object.getOwnPropertyDescriptor(document, "visibilityState");
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    })()`);
    await browser.evaluate(`window.__heatMapBrowserTest.setNextRefetchResponse({
      category: "stocks",
      period: "1w",
      requestedSector: "Technology",
      updatedAt: ${missedOpen + 2},
      quotes: [${JSON.stringify(quote("MATCH", {
        priceTimestamp: missedOpen + 2,
        marketSession: "regular",
        nextRegularOpenTimestamp: null,
      }))}],
      unavailableSymbols: [],
    })`);
    await setResponse(browser, {
      category: "stocks",
      period: "1w",
      requestedSector: "Technology",
      updatedAt: simulatedNowMs / 1000,
      quotes: [quote("MATCH", {
        priceTimestamp: simulatedNowMs / 1000,
        marketSession: "closed",
        nextRegularOpenTimestamp: missedOpen,
      })],
      unavailableSymbols: [],
    });
    await waitFor(
      (expression) => browser.evaluate(expression),
      "window.__heatMapHeldOpenTimeouts.length === 1",
      "The scheduled-open timer should be held to simulate the phone suspending.",
    );
    await browser.evaluate(`(() => {
      Date.now = () => ${resumedAtMs};
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    })()`);
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-session-MATCH"))})?.textContent === "Regular"`,
      "Resuming after the scheduled open should refresh the still-closed quote.",
    );
    assert.equal(
      await browser.evaluate("window.__heatMapBrowserTest.refetches.length"),
      refetchCountBeforeResume + 1,
      "Resuming after a delayed timer should issue exactly one refresh.",
    );
    assert.deepEqual(
      await browser.evaluate("window.__heatMapBrowserTest.refetches.at(-1)"),
      { category: "stocks", period: "1w", sector: "Technology" },
      "The resume refresh should preserve the selected category, period, and sector.",
    );
    assert.match(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-selected-period"))}).textContent`),
      /1W/,
      "Resuming should preserve the selected period.",
    );
    assert.match(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-filter-open"))}).getAttribute("aria-label")`),
      /4 active/,
      "Resuming should preserve locally selected filters.",
    );
    await browser.evaluate(`(() => {
      const held = window.__heatMapHeldOpenTimeouts[0];
      held.callback(...held.args);
      window.setTimeout = window.__heatMapOriginalSetTimeout;
      window.__holdHeatMapOpenTimeout = false;
      if (window.__heatMapOriginalVisibilityDescriptor) {
        Object.defineProperty(document, "visibilityState", window.__heatMapOriginalVisibilityDescriptor);
      } else {
        delete document.visibilityState;
      }
    })()`);
    await delay(100);
    assert.equal(
      await browser.evaluate("window.__heatMapBrowserTest.refetches.length"),
      refetchCountBeforeResume + 1,
      "The delayed timer callback should not duplicate the resume refresh.",
    );
    await browser.evaluate(`(() => {
      Date.now = window.__heatMapOriginalDateNow;
      delete window.__heatMapOriginalDateNow;
    })()`);

    await clickTestID(browser, "heat-map-filter-open");
    await clickTestID(browser, "heat-map-filter-reset");
    assert.match(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-filter-selection-count"))}).textContent`),
      /^0 selected/,
    );
    await waitForRequest(
      browser,
      `(request) => request.category === "stocks" && request.period === "1w" && request.sector === undefined`,
      "the cleared stock filters",
    );
    await setResponse(browser, { ...makeFilterResponse(), period: "1w" });
    assert.match(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-filter-apply"))}).textContent`),
      /0/,
    );
    await clickTestID(browser, "heat-map-filter-apply");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-counted-quotes"))})?.textContent === "6"`,
      "Clearing selections should restore all quotes.",
    );
    await clickTestID(browser, "heat-map-filter-open");
    await clickTestID(browser, "heat-map-drawer-period-1d");
    await clickTestID(browser, "heat-map-filter-apply");
    await waitForRequest(
      browser,
      `(request) => request.category === "stocks" && request.period === "1d" && request.sector === undefined`,
      "returning to the default period",
    );
    await setResponse(browser, makeFilterResponse());
    assert.equal(
      await browser.evaluate(
        "document.documentElement.scrollWidth <= window.innerWidth && document.body.scrollWidth <= window.innerWidth",
      ),
      true,
      "The drawer flow must finish without horizontal overflow at 320px.",
    );

    // Exercise actual custom-map taps against device-persistent AsyncStorage.
    const customSymbolsStorageKey = "__async_storage__:meisner.heat-map.custom-symbols.v1";
    await browser.evaluate(
      `localStorage.setItem(${JSON.stringify(customSymbolsStorageKey)}, ${JSON.stringify(JSON.stringify(["AAPL", "MSFT", "MISSING"]))})`,
    );
    await browser.evaluate(
      `sessionStorage.setItem("__heat_map_fail_custom_storage_read_once", "armed")`,
    );
    await browser.send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
      const failureFlag = "__heat_map_fail_custom_storage_read_once";
      if (sessionStorage.getItem(failureFlag) !== "armed") return;
      sessionStorage.removeItem(failureFlag);
      const originalGetItem = Storage.prototype.getItem;
      let failuresRemaining = 1;
      Storage.prototype.getItem = function(key) {
        if (key === ${JSON.stringify(customSymbolsStorageKey)} && failuresRemaining > 0) {
          failuresRemaining -= 1;
          throw new DOMException("Temporary device storage failure.", "UnknownError");
        }
        return originalGetItem.call(this, key);
      };
    })()` });
    await browser.send("Page.reload", { ignoreCache: true });
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector(${JSON.stringify(selector("heat-map-category-picker"))})`,
      "The heat-map screen should reopen before selecting the custom map.",
    );

    await clickTestID(browser, "heat-map-category-picker");
    await clickTestID(browser, "heat-map-category-custom");
    await clickTestID(browser, "heat-map-add-ticker-open");
    const addTickerPhoneBounds = await browser.evaluate(`(() => {
      const sheet = document.querySelector(${JSON.stringify(selector("heat-map-add-ticker-modal"))});
      const rect = sheet?.getBoundingClientRect();
      return rect ? { left: rect.left, right: rect.right, width: rect.width, viewport: window.innerWidth } : null;
    })()`);
    assert.ok(addTickerPhoneBounds, "The add-ticker modal should render on a phone viewport.");
    assert.ok(addTickerPhoneBounds.left >= 0 && addTickerPhoneBounds.right <= 320, "The modal must fit inside the 320px phone viewport.");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-storage-error"))})?.textContent.trim() === "Couldn't load saved tickers from this device." && !!document.querySelector(${JSON.stringify(selector("heat-map-storage-retry"))})`,
      "A failed saved-ticker read should explain the error and offer a retry.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-custom-add"))})?.disabled`),
      true,
      "Adding tickers must stay disabled until the saved list can be read, avoiding an overwrite.",
    );
    assert.equal(
      await browser.evaluate(`localStorage.getItem(${JSON.stringify(customSymbolsStorageKey)})`),
      JSON.stringify(["AAPL", "MSFT", "MISSING"]),
      "A failed storage read must not change the saved custom ticker list.",
    );
    await clickTestID(browser, "heat-map-storage-retry");
    await waitForRequest(
      browser,
      `(request) => request.category === "custom" && JSON.stringify(request.symbols) === '["AAPL","MSFT","MISSING"]'`,
      "the saved custom tickers after retry",
    );
    const customNextOpen = Date.parse("2030-11-29T14:30:00Z") / 1000;
    await setResponse(browser, makeCustomResponse("1d", [
      quote("AAPL", { marketSession: "after_hours", nextRegularOpenTimestamp: customNextOpen }),
      quote("MSFT", { marketSession: "after_hours", nextRegularOpenTimestamp: customNextOpen }),
    ], ["MISSING"]));
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector(${JSON.stringify(selector("heat-map-session-AAPL"))}) && !!document.querySelector(${JSON.stringify(selector("heat-map-session-MSFT"))}) && !document.querySelector(${JSON.stringify(selector("heat-map-storage-error"))})`,
      "A successful retry should load the saved tickers, render available hexagons, and clear the error.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-market-status-label"))})?.textContent.trim()`),
      "OPEN · EXTENDED HOURS",
      "Custom maps should show one shared status for their extended-hours quotes.",
    );
    assert.equal(
      await browser.evaluate(`!!document.querySelector(${JSON.stringify(selector("heat-map-next-open-AAPL"))})`),
      false,
      "Custom-map hexagons should not repeat the next-open time.",
    );
    await clickTestID(browser, "heat-map-add-ticker-close");

    await clickTestID(browser, "heat-map-custom-edit");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector(${JSON.stringify(selector("heat-map-remove-tile-AAPL"))})`,
      "Edit mode should make each visible ticker hexagon tappable for removal.",
    );
    await clickTestID(browser, "heat-map-remove-tile-AAPL");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `localStorage.getItem(${JSON.stringify(customSymbolsStorageKey)}) === ${JSON.stringify(JSON.stringify(["MSFT", "MISSING"]))}`,
      "Removing AAPL should save only the remaining tickers to device storage.",
    );
    await waitForRequest(
      browser,
      `(request) => request.category === "custom" && JSON.stringify(request.symbols) === '["MSFT","MISSING"]'`,
      "the custom map after removing AAPL",
    );
    await setResponse(browser, makeCustomResponse("1d", [quote("MSFT")], ["MISSING"]));
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!document.querySelector(${JSON.stringify(selector("heat-map-session-AAPL"))}) && !!document.querySelector(${JSON.stringify(selector("heat-map-session-MSFT"))})`,
      "Removing one hexagon should keep the other ticker visible and remove only the selected ticker.",
    );
    assert.ok(
      await browser.evaluate(`!!document.querySelector(${JSON.stringify(selector("heat-map-custom-undo"))})`),
      "Removing a ticker should immediately offer an undo action.",
    );
    await clickTestID(browser, "heat-map-custom-undo");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `localStorage.getItem(${JSON.stringify(customSymbolsStorageKey)}) === ${JSON.stringify(JSON.stringify(["AAPL", "MSFT", "MISSING"]))}`,
      "Undoing AAPL removal should restore the exact saved ticker list.",
    );
    await waitForRequest(
      browser,
      `(request) => request.category === "custom" && JSON.stringify(request.symbols) === '["AAPL","MSFT","MISSING"]'`,
      "the restored custom map",
    );
    await setResponse(browser, makeCustomResponse("1d", [quote("AAPL"), quote("MSFT")], ["MISSING"]));
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector(${JSON.stringify(selector("heat-map-session-AAPL"))}) && !!document.querySelector(${JSON.stringify(selector("heat-map-session-MSFT"))})`,
      "Undoing removal should bring AAPL back without changing MSFT.",
    );
    await clickTestID(browser, "heat-map-manage-open");
    assert.ok(
      await browser.evaluate(`!!document.querySelector(${JSON.stringify(selector("heat-map-remove-unavailable-MISSING"))})`),
      "The manager should list unavailable saved tickers with removal controls.",
    );
    await setResponse(browser, makeCustomResponse("1d", [], ["AAPL", "MSFT", "MISSING"]));
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!document.querySelector(${JSON.stringify(selector("heat-map-session-MSFT"))}) && !document.querySelector(${JSON.stringify(selector("heat-map-session-MISSING"))}) && !!document.querySelector(${JSON.stringify(selector("heat-map-remove-unavailable-AAPL"))}) && !!document.querySelector(${JSON.stringify(selector("heat-map-remove-unavailable-MSFT"))}) && !!document.querySelector(${JSON.stringify(selector("heat-map-remove-unavailable-MISSING"))})`,
      "When every custom ticker is unavailable, edit mode should show fallback removal controls instead of hexagons.",
    );
    await clickTestID(browser, "heat-map-remove-unavailable-MISSING");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `localStorage.getItem(${JSON.stringify(customSymbolsStorageKey)}) === ${JSON.stringify(JSON.stringify(["AAPL", "MSFT"]))}`,
      "Removing an unavailable ticker should leave both available tickers saved.",
    );
    await waitForRequest(
      browser,
      `(request) => request.category === "custom" && JSON.stringify(request.symbols) === '["AAPL","MSFT"]'`,
      "the custom map after removing its unavailable ticker",
    );
    await setResponse(browser, makeCustomResponse("1d", [quote("AAPL"), quote("MSFT")]));
    await browser.evaluate(`(() => {
      const originalSetItem = Storage.prototype.setItem;
      let failuresRemaining = 1;
      Storage.prototype.setItem = function(key, value) {
        if (key === ${JSON.stringify(customSymbolsStorageKey)} && failuresRemaining > 0) {
          failuresRemaining -= 1;
          throw new DOMException("Temporary device storage failure.", "QuotaExceededError");
        }
        return originalSetItem.call(this, key, value);
      };
    })()`);
    await clickTestID(browser, "heat-map-custom-undo");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `localStorage.getItem(${JSON.stringify(customSymbolsStorageKey)}) === ${JSON.stringify(JSON.stringify(["AAPL", "MSFT"]))} && document.querySelector(${JSON.stringify(selector("heat-map-custom-error"))})?.textContent === "Couldn't restore MISSING on this device. Try again." && !!document.querySelector(${JSON.stringify(selector("heat-map-custom-undo"))})`,
      "A failed restore should leave saved tickers unchanged, explain the failure, and keep Undo available.",
    );
    await clickTestID(browser, "heat-map-custom-undo");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `localStorage.getItem(${JSON.stringify(customSymbolsStorageKey)}) === ${JSON.stringify(JSON.stringify(["AAPL", "MSFT", "MISSING"]))}`,
      "Retrying the restore should recover the removed ticker and preserve all other saved tickers.",
    );
    await waitForRequest(
      browser,
      `(request) => request.category === "custom" && JSON.stringify(request.symbols) === '["AAPL","MSFT","MISSING"]'`,
      "restoring the unavailable ticker",
    );
    await setResponse(browser, makeCustomResponse("1d", [quote("AAPL"), quote("MSFT")], ["MISSING"]));

    const dragReorderUi = await browser.evaluate(`(() => ({
      hint: document.querySelector(${JSON.stringify(selector("heat-map-drag-reorder-hint"))})?.textContent.trim(),
      legacyList: !!document.querySelector(${JSON.stringify(selector("heat-map-custom-reorder-list"))}),
      legacyArrow: !!document.querySelector(${JSON.stringify(selector("heat-map-move-up-AAPL"))}),
      visibleHex: !!document.querySelector(${JSON.stringify(selector("heat-map-open-detail-AAPL"))})
        || !!document.querySelector(${JSON.stringify(selector("heat-map-remove-tile-AAPL"))}),
    }))()`);
    assert.deepEqual(dragReorderUi, {
      hint: "Long-press a hexagon and drag it to change its position.",
      legacyList: false,
      legacyArrow: false,
      visibleHex: true,
    }, "The custom map should explain direct hexagon dragging instead of rendering the old arrow list.");

    // This browser fixture deliberately mocks native gestures; seed an alternate
    // saved order for the reload and temporary-sort assertions below.
    await browser.evaluate(`localStorage.setItem(${JSON.stringify(customSymbolsStorageKey)}, ${JSON.stringify(JSON.stringify(["MSFT", "AAPL", "MISSING"]))})`);
    await browser.send("Page.reload", { ignoreCache: true });
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector(${JSON.stringify(selector("heat-map-category-picker"))})`,
      "The heat-map screen should be available after reopening.",
    );
    await clickTestID(browser, "heat-map-category-picker");
    await clickTestID(browser, "heat-map-category-custom");
    await waitForRequest(
      browser,
      `(request) => request.category === "custom" && JSON.stringify(request.symbols) === '["MSFT","AAPL","MISSING"]'`,
      "the restored custom map after reopening",
    );
    await setResponse(browser, makeCustomResponse("1d", [quote("AAPL"), quote("MSFT")], ["MISSING"]));
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector(${JSON.stringify(selector("heat-map-session-AAPL"))}) && !!document.querySelector(${JSON.stringify(selector("heat-map-session-MSFT"))})`,
      "The restored ticker and the other saved ticker should render after reopening the map.",
    );
    await clickTestID(browser, "heat-map-open-detail-AAPL");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-detail-title"))})?.textContent === "AAPL"`,
      "Tapping a custom-map tile should open its detail card.",
    );
    await assertWatchlistAddIsUnique(browser, "AAPL");
    await clickTestID(browser, "heat-map-detail-close");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!document.querySelector(${JSON.stringify(selector("heat-map-detail-modal"))})`,
      "The custom-map detail card should close before continuing.",
    );
    assert.deepEqual(
      await browser.evaluate(`Array.from(document.querySelectorAll('[data-testid^="heat-map-hex-tile-"]')).map((node) => node.getAttribute("data-testid").replace("heat-map-hex-tile-", ""))`),
      ["MSFT", "AAPL"],
      "Reopening the custom map should render visible tiles in the saved order.",
    );
    const savedCustomOrder = ["MSFT", "AAPL", "MISSING"];
    const orderedCustomQuotes = [
      quote("AAPL", { returnPercent: 8, sector: "Financials", exchange: "NASDAQ" }),
      quote("MSFT", { returnPercent: -4, sector: "Technology", exchange: "NYSE" }),
    ];
    const visibleCustomTileOrder = () => browser.evaluate(
      `Array.from(document.querySelectorAll('[data-testid^="heat-map-hex-tile-"]')).map((node) => node.getAttribute("data-testid").replace("heat-map-hex-tile-", ""))`,
    );

    await setResponse(browser, makeCustomResponse("1d", [orderedCustomQuotes[0]], ["MSFT", "MISSING"]));
    await waitFor(
      (expression) => browser.evaluate(expression),
      `Array.from(document.querySelectorAll('[data-testid^="heat-map-hex-tile-"]')).map((node) => node.getAttribute("data-testid").replace("heat-map-hex-tile-", "")).join(",") === "AAPL"`,
      "A saved Custom instrument should disappear from the tiles when its quote is temporarily unavailable.",
    );
    await setResponse(browser, makeCustomResponse("1d", orderedCustomQuotes, ["MISSING"]));
    await waitFor(
      (expression) => browser.evaluate(expression),
      `Array.from(document.querySelectorAll('[data-testid^="heat-map-hex-tile-"]')).map((node) => node.getAttribute("data-testid").replace("heat-map-hex-tile-", "")).join(",") === "MSFT,AAPL"`,
      "A recovered quote should return to its saved position, regardless of quote-batch order.",
    );

    await clickTestID(browser, "heat-map-period-1w");
    await waitForRequest(
      browser,
      `(request) => request.category === "custom" && request.period === "1w" && JSON.stringify(request.symbols) === '["MSFT","AAPL","MISSING"]'`,
      "the Custom map after changing its return period",
    );
    await setResponse(browser, makeCustomResponse("1w", orderedCustomQuotes, ["MISSING"]));
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-selected-period"))})?.textContent.includes("1W") && Array.from(document.querySelectorAll('[data-testid^="heat-map-hex-tile-"]')).map((node) => node.getAttribute("data-testid").replace("heat-map-hex-tile-", "")).join(",") === "MSFT,AAPL"`,
      "Changing the selected period should keep Custom tiles in saved order after refreshed quotes arrive.",
    );

    await clickTestID(browser, "heat-map-filter-open");
    await clickTestID(browser, "heat-map-filter-sector-Technology");
    await clickTestID(browser, "heat-map-filter-apply");
    assert.deepEqual(
      await visibleCustomTileOrder(),
      ["MSFT"],
      "An active Custom map filter should hide non-matching saved instruments.",
    );
    assert.equal(
      await browser.evaluate(`localStorage.getItem(${JSON.stringify(customSymbolsStorageKey)})`),
      JSON.stringify(savedCustomOrder),
      "Applying a filter must not rewrite the saved Custom map order.",
    );
    await clickTestID(browser, "heat-map-filter-open");
    await clickTestID(browser, "heat-map-filter-reset");
    await clickTestID(browser, "heat-map-filter-apply");
    assert.deepEqual(
      await visibleCustomTileOrder(),
      ["MSFT", "AAPL"],
      "Clearing filters should restore every quoted instrument in saved order.",
    );

    await clickTestID(browser, "heat-map-filter-open");
    await clickTestID(browser, "heat-map-sort-highest");
    await clickTestID(browser, "heat-map-filter-apply");
    assert.deepEqual(
      await visibleCustomTileOrder(),
      ["AAPL", "MSFT"],
      "Explicit highest-return sorting should temporarily override the saved tile order.",
    );
    assert.equal(
      await browser.evaluate(`localStorage.getItem(${JSON.stringify(customSymbolsStorageKey)})`),
      JSON.stringify(savedCustomOrder),
      "Applying explicit return sorting must not replace the saved Custom map order.",
    );
    await clickTestID(browser, "heat-map-filter-open");
    await clickTestID(browser, "heat-map-sort-default");
    await clickTestID(browser, "heat-map-filter-apply");
    assert.deepEqual(
      await visibleCustomTileOrder(),
      ["MSFT", "AAPL"],
      "Clearing explicit return sorting should restore the saved Custom map order.",
    );
    assert.equal(
      await browser.evaluate(`localStorage.getItem(${JSON.stringify(customSymbolsStorageKey)})`),
      JSON.stringify(savedCustomOrder),
      "Clearing explicit return sorting must leave the original saved order intact.",
    );

    await clickTestID(browser, "heat-map-filter-open");
    await clickTestID(browser, "heat-map-sort-highest");
    await clickTestID(browser, "heat-map-filter-apply");
    assert.deepEqual(
      await visibleCustomTileOrder(),
      ["AAPL", "MSFT"],
      "The browser regression should begin editing while the explicit return sort is active.",
    );
    await clickTestID(browser, "heat-map-add-ticker-open");
    await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-custom-input"))})?.focus()`);
    await browser.send("Input.insertText", { text: "NVDA" });
    await browser.evaluate(`window.__heatMapBrowserTest.setValidationResponses([{ type: "resolve", symbol: "NVDA" }])`);
    await clickTestID(browser, "heat-map-custom-add");
    const savedOrderAfterAdd = ["MSFT", "AAPL", "MISSING", "NVDA"];
    await waitFor(
      (expression) => browser.evaluate(expression),
      `localStorage.getItem(${JSON.stringify(customSymbolsStorageKey)}) === ${JSON.stringify(JSON.stringify(savedOrderAfterAdd))}`,
      "Adding a ticker during return sorting should append it to the saved order, not the sorted display order.",
    );
    await waitForRequest(
      browser,
      `(request) => request.category === "custom" && request.period === "1w" && JSON.stringify(request.symbols) === '["MSFT","AAPL","MISSING","NVDA"]'`,
      "the custom map after adding NVDA during return sorting",
    );
    const addedCustomQuotes = [
      quote("AAPL", { returnPercent: 8, sector: "Financials", exchange: "NASDAQ" }),
      quote("MSFT", { returnPercent: -4, sector: "Technology", exchange: "NYSE" }),
      quote("NVDA", { returnPercent: 12, sector: "Technology", exchange: "NASDAQ" }),
    ];
    await setResponse(browser, makeCustomResponse("1w", addedCustomQuotes, ["MISSING"]));
    await waitFor(
      (expression) => browser.evaluate(expression),
      `Array.from(document.querySelectorAll('[data-testid^="heat-map-hex-tile-"]')).map((node) => node.getAttribute("data-testid").replace("heat-map-hex-tile-", "")).join(",") === "NVDA,AAPL,MSFT"`,
      "The active return sort should continue controlling only the displayed tile order after adding.",
    );
    await clickTestID(browser, "heat-map-add-ticker-close");

    await clickTestID(browser, "heat-map-custom-edit");
    await clickTestID(browser, "heat-map-remove-tile-AAPL");
    const savedOrderAfterRemove = ["MSFT", "MISSING", "NVDA"];
    await waitFor(
      (expression) => browser.evaluate(expression),
      `localStorage.getItem(${JSON.stringify(customSymbolsStorageKey)}) === ${JSON.stringify(JSON.stringify(savedOrderAfterRemove))}`,
      "Removing a ticker during return sorting should remove it from its canonical saved position.",
    );
    await waitForRequest(
      browser,
      `(request) => request.category === "custom" && request.period === "1w" && JSON.stringify(request.symbols) === '["MSFT","MISSING","NVDA"]'`,
      "the custom map after removing AAPL during return sorting",
    );
    await setResponse(browser, makeCustomResponse("1w", [
      addedCustomQuotes[1],
      addedCustomQuotes[2],
    ], ["MISSING"]));
    await waitFor(
      (expression) => browser.evaluate(expression),
      `Array.from(document.querySelectorAll('[data-testid^="heat-map-hex-tile-"]')).map((node) => node.getAttribute("data-testid").replace("heat-map-hex-tile-", "")).join(",") === "NVDA,MSFT"`,
      "The remaining tiles should stay return-sorted until the temporary sort is cleared.",
    );
    await clickTestID(browser, "heat-map-custom-edit");
    await clickTestID(browser, "heat-map-filter-open");
    await clickTestID(browser, "heat-map-sort-default");
    await clickTestID(browser, "heat-map-filter-apply");
    await waitForRequest(
      browser,
      `(request) => request.category === "custom" && request.period === "1w" && JSON.stringify(request.symbols) === '["MSFT","MISSING","NVDA"]'`,
      "the canonical custom order after clearing return sorting",
    );
    await setResponse(browser, makeCustomResponse("1w", [
      addedCustomQuotes[2],
      addedCustomQuotes[1],
    ], ["MISSING"]));
    await waitFor(
      (expression) => browser.evaluate(expression),
      `Array.from(document.querySelectorAll('[data-testid^="heat-map-hex-tile-"]')).map((node) => node.getAttribute("data-testid").replace("heat-map-hex-tile-", "")).join(",") === "MSFT,NVDA"`,
      "Clearing return sorting should restore the saved order with NVDA added and AAPL removed.",
    );
    assert.equal(
      await browser.evaluate(`localStorage.getItem(${JSON.stringify(customSymbolsStorageKey)})`),
      JSON.stringify(savedOrderAfterRemove),
      "Device storage should retain the canonical Custom order after sorting is cleared.",
    );

    await clickTestID(browser, "heat-map-custom-edit");
    await clickTestID(browser, "heat-map-manage-open");
    assert.equal(
      await browser.evaluate(`localStorage.getItem(${JSON.stringify(customSymbolsStorageKey)})`),
      JSON.stringify(savedOrderAfterRemove),
      "The restored custom map should preserve its full saved ticker list after reopening.",
    );
    assert.equal(
      await browser.evaluate(`!!document.querySelector(${JSON.stringify(selector("heat-map-remove-unavailable-MISSING"))})`),
      true,
      "The unavailable ticker should remain saved and available for editing after reopening.",
    );

    const malformedCustomSymbols = "{not valid JSON";
    await browser.evaluate(
      `localStorage.setItem(${JSON.stringify(customSymbolsStorageKey)}, ${JSON.stringify(malformedCustomSymbols)})`,
    );
    await browser.send("Page.reload", { ignoreCache: true });
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector(${JSON.stringify(selector("heat-map-category-picker"))})`,
      "The heat-map screen should reopen before checking malformed saved tickers.",
    );
    await clickTestID(browser, "heat-map-category-picker");
    await clickTestID(browser, "heat-map-category-custom");
    await clickTestID(browser, "heat-map-add-ticker-open");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-storage-error"))})?.textContent.includes("device data is invalid") && !!document.querySelector(${JSON.stringify(selector("heat-map-storage-reset"))})`,
      "Malformed saved tickers should be identified and offer an explicit reset.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-custom-add"))})?.disabled`),
      true,
      "Adding tickers must stay disabled while the saved value is malformed.",
    );
    assert.equal(
      await browser.evaluate(`localStorage.getItem(${JSON.stringify(customSymbolsStorageKey)})`),
      malformedCustomSymbols,
      "Loading malformed saved tickers must preserve the exact unreadable value.",
    );
    await browser.evaluate(`(() => {
      const originalSetItem = Storage.prototype.setItem;
      let failuresRemaining = 1;
      Storage.prototype.setItem = function(key, value) {
        if (key === ${JSON.stringify(customSymbolsStorageKey)} && failuresRemaining > 0) {
          failuresRemaining -= 1;
          throw new DOMException("Temporary device storage failure.", "QuotaExceededError");
        }
        return originalSetItem.call(this, key, value);
      };
    })()`);
    await clickTestID(browser, "heat-map-storage-reset");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `localStorage.getItem(${JSON.stringify(customSymbolsStorageKey)}) === ${JSON.stringify(malformedCustomSymbols)} && document.querySelector(${JSON.stringify(selector("heat-map-custom-error"))})?.textContent === "Couldn't reset saved tickers on this device. Try again." && !!document.querySelector(${JSON.stringify(selector("heat-map-storage-reset"))})`,
      "A failed reset should preserve the malformed value and allow the user to retry.",
    );
    await clickTestID(browser, "heat-map-storage-reset");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `localStorage.getItem(${JSON.stringify(customSymbolsStorageKey)}) === "[]" && !document.querySelector(${JSON.stringify(selector("heat-map-storage-error"))}) && document.body.innerText.includes("Build a personal comparison")`,
      "Choosing reset should replace the malformed value with an empty custom map.",
    );

    await clickTestID(browser, "heat-map-custom-type-etfs");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector(${JSON.stringify(selector("heat-map-custom-pick-SPY"))}) && !!document.querySelector(${JSON.stringify(selector("heat-map-custom-pick-QQQ"))})`,
      "The ETF catalog should offer supported choices for a mixed batch-add test.",
    );
    await clickTestID(browser, "heat-map-custom-pick-SPY");
    await clickTestID(browser, "heat-map-custom-pick-QQQ");
    await clickTestID(browser, "heat-map-custom-pick-GLD");
    await browser.evaluate(`window.__heatMapBrowserTest.setValidationResponses([
      { type: "resolve", symbol: "SPY" },
      { type: "reject", error: "QUOTE_UNAVAILABLE", message: "Raw provider trace: internal detail" },
      { type: "reject", error: "MARKET_DATA_TEMPORARILY_UNAVAILABLE", message: "Raw provider trace: timeout detail" },
    ])`);
    await browser.evaluate(`(() => {
      const key = ${JSON.stringify(customSymbolsStorageKey)};
      const originalSetItem = Storage.prototype.setItem;
      window.__heatMapCustomWriteAttempts = 0;
      window.__heatMapFailNextCustomWrite = false;
      Storage.prototype.setItem = function(storageKey, value) {
        if (storageKey === key) {
          window.__heatMapCustomWriteAttempts += 1;
          if (window.__heatMapFailNextCustomWrite) {
            window.__heatMapFailNextCustomWrite = false;
            throw new DOMException("Temporary device storage failure.", "QuotaExceededError");
          }
        }
        return originalSetItem.call(this, storageKey, value);
      };
    })()`);
    await clickTestID(browser, "heat-map-custom-batch-add");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-custom-batch-feedback"))})?.textContent === "Added 1 instrument.\\nCouldn't add:\\nQQQ: This ticker isn't supported or has no current or recent quote.\\nGLD: Market data is temporarily unavailable. Try again."`,
      "A mixed batch should retain a successful choice and explain each unsupported or temporarily unavailable instrument.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-custom-batch-feedback"))})?.textContent.includes("Raw provider trace")`),
      false,
      "Validation feedback must not expose untrusted server or provider details.",
    );
    assert.deepEqual(
      await browser.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(customSymbolsStorageKey)}))`),
      ["SPY"],
      "The successfully validated instrument should be saved without the failed choice.",
    );
    assert.equal(
      await browser.evaluate("window.__heatMapCustomWriteAttempts"),
      1,
      "A batch with a successful validation should save its supported instruments exactly once.",
    );
    assert.deepEqual(
      await browser.evaluate("window.__heatMapBrowserTest.validationRequests"),
      ["SPY", "QQQ", "GLD"],
      "The batch should validate every selected instrument independently.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-custom-add-asset-SPY"))})?.textContent.includes("Added") && document.querySelector(${JSON.stringify(selector("heat-map-custom-pick-QQQ"))})?.getAttribute("aria-label")?.startsWith("Deselect") && document.querySelector(${JSON.stringify(selector("heat-map-custom-pick-GLD"))})?.getAttribute("aria-label")?.startsWith("Deselect") && !!document.querySelector(${JSON.stringify(selector("heat-map-custom-batch-add"))})`),
      true,
      "The failed choice should remain selected and available to retry, while the successful choice appears added.",
    );

    await browser.evaluate(`window.__heatMapBrowserTest.setValidationResponses([{ type: "resolve", symbol: "QQQ" }]); window.__heatMapFailNextCustomWrite = true`);
    await clickTestID(browser, "heat-map-custom-batch-add");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-custom-error"))})?.textContent === "Couldn't save the selected instruments on this device. Try again."`,
      "A device-storage write failure should be clearly explained.",
    );
    assert.deepEqual(
      await browser.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(customSymbolsStorageKey)}))`),
      ["SPY"],
      "A failed device-storage write must preserve the saved instrument list.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-custom-add-asset-SPY"))})?.textContent.includes("Added") && document.querySelector(${JSON.stringify(selector("heat-map-custom-pick-QQQ"))})?.getAttribute("aria-label")?.startsWith("Deselect") && !!document.querySelector(${JSON.stringify(selector("heat-map-custom-batch-add"))})`),
      true,
      "A failed device-storage write must preserve the pending choice for retry.",
    );
    await browser.evaluate(`window.__heatMapBrowserTest.setValidationResponses([
      { type: "resolve", symbol: "QQQ" },
      { type: "resolve", symbol: "GLD" },
    ])`);
    await clickTestID(browser, "heat-map-custom-batch-add");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `localStorage.getItem(${JSON.stringify(customSymbolsStorageKey)}) === ${JSON.stringify(JSON.stringify(["SPY", "QQQ", "GLD"]))} && !document.querySelector(${JSON.stringify(selector("heat-map-custom-batch-add"))})`,
      "Retrying after a storage failure should save all pending choices and clear the selection.",
    );
    assert.equal(
      await browser.evaluate("window.__heatMapCustomWriteAttempts"),
      3,
      "The successful mixed batch and the later retry should each make one save attempt.",
    );

    await clickTestID(browser, "heat-map-custom-type-commodities");
    await replaceTextInput(browser, "heat-map-custom-input", "Gold");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector(${JSON.stringify(selector("heat-map-custom-pick-GC=F"))}) && !document.querySelector(${JSON.stringify(selector("heat-map-custom-pick-GLD"))})`,
      "The commodities tab should show matching commodities without mixing in ETF results.",
    );
    const goldCommodityResult = await browser.evaluate(
      `document.querySelector(${JSON.stringify(selector("heat-map-custom-pick-GC=F"))})?.parentElement?.textContent`,
    );
    assert.match(goldCommodityResult, /Gold/);
    assert.match(goldCommodityResult, /Commodities/);

    await clickTestID(browser, "heat-map-custom-type-etfs");
    await replaceTextInput(browser, "heat-map-custom-input", "Gold");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector(${JSON.stringify(selector("heat-map-custom-pick-GLD"))}) && !document.querySelector(${JSON.stringify(selector("heat-map-custom-pick-GC=F"))})`,
      "The ETF tab should show the gold ETF without mixing in commodity futures.",
    );
    await clickTestID(browser, "heat-map-custom-type-futures");
    await replaceTextInput(browser, "heat-map-custom-input", "S&P 500");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector(${JSON.stringify(selector("heat-map-custom-pick-ES=F"))}) && !document.querySelector(${JSON.stringify(selector("heat-map-custom-pick-GC=F"))})`,
      "The futures tab should filter the catalog to matching futures.",
    );

    await browser.evaluate(`window.__heatMapBrowserTest.setStockSearchSuggestions("Gold", [
      { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ" },
      { symbol: "MSFT", name: "Microsoft Corporation", exchange: "NASDAQ" },
      { symbol: "NVDA", name: "NVIDIA Corporation", exchange: "NASDAQ" },
    ])`);
    await clickTestID(browser, "heat-map-custom-type-stocks");
    await replaceTextInput(browser, "heat-map-custom-input", "Gold");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector(${JSON.stringify(selector("heat-map-custom-suggestion-AAPL"))}) && !!document.querySelector(${JSON.stringify(selector("heat-map-custom-select-MSFT"))})`,
      "Stock search should offer a separate batch-selection control without removing its direct add action.",
    );
    await browser.evaluate(`window.__heatMapBrowserTest.setValidationResponses([{ type: "resolve", symbol: "AAPL" }])`);
    await clickTestID(browser, "heat-map-custom-suggestion-AAPL");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `localStorage.getItem(${JSON.stringify(customSymbolsStorageKey)}) === ${JSON.stringify(JSON.stringify(["SPY", "QQQ", "GLD", "AAPL"]))}`,
      "Tapping a stock search result should still add that single stock immediately.",
    );
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-custom-suggestion-AAPL"))})?.textContent.includes("Added") && !document.querySelector(${JSON.stringify(selector("heat-map-custom-select-AAPL"))})`,
      "A stock already in the Custom map should be labeled as added and not be selectable again.",
    );
    await clickTestID(browser, "heat-map-custom-select-MSFT");
    await clickTestID(browser, "heat-map-custom-select-NVDA");
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-custom-batch-add"))})?.getAttribute("aria-label")`),
      "Add 2 selected instruments",
      "Several stock suggestions should be selectable together before adding.",
    );
    await browser.evaluate(`window.__heatMapBrowserTest.setValidationResponses([
      { type: "resolve", symbol: "MSFT" },
      { type: "resolve", symbol: "NVDA" },
    ])`);
    await clickTestID(browser, "heat-map-custom-batch-add");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `localStorage.getItem(${JSON.stringify(customSymbolsStorageKey)}) === ${JSON.stringify(JSON.stringify(["SPY", "QQQ", "GLD", "AAPL", "MSFT", "NVDA"]))} && !document.querySelector(${JSON.stringify(selector("heat-map-custom-batch-add"))})`,
      "Adding selected stocks should validate and save the complete batch without duplicating the already-added stock.",
    );

    await replaceTextInput(browser, "heat-map-custom-input", "TSLA");
    await browser.evaluate(`window.__heatMapBrowserTest.setValidationResponses([{ type: "resolve", symbol: "TSLA" }])`);
    await clickTestID(browser, "heat-map-custom-add");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `localStorage.getItem(${JSON.stringify(customSymbolsStorageKey)}) === ${JSON.stringify(JSON.stringify(["SPY", "QQQ", "GLD", "AAPL", "MSFT", "NVDA", "TSLA"]))}`,
      "Direct ticker entry should still validate and add a stock.",
    );
    const directAddAfterSave = await browser.evaluate(`(() => {
      const button = document.querySelector(${JSON.stringify(selector("heat-map-custom-add"))});
      return {
        disabled: button?.disabled,
        text: button?.textContent,
        label: button?.getAttribute("aria-label"),
      };
    })()`);
    assert.equal(
      directAddAfterSave.disabled,
      true,
      `The direct-add control should prevent a duplicate ticker. Rendered state: ${JSON.stringify(directAddAfterSave)}`,
    );
    assert.match(
      `${directAddAfterSave.text} ${directAddAfterSave.label}`,
      /Added|already added/i,
      "The direct-add control should identify the saved ticker.",
    );

    await clickTestID(browser, "heat-map-custom-type-commodities");
    await replaceTextInput(browser, "heat-map-custom-input", "Gold");
    await clickTestID(browser, "heat-map-custom-add-asset-GC=F");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `localStorage.getItem(${JSON.stringify(customSymbolsStorageKey)}) === ${JSON.stringify(JSON.stringify(["SPY", "QQQ", "GLD", "AAPL", "MSFT", "NVDA", "TSLA", "GC=F"]))} && document.querySelector(${JSON.stringify(selector("heat-map-custom-add-asset-GC=F"))})?.textContent.includes("Added")`,
      "The commodity result should add directly and switch to its saved state.",
    );

    await clickTestID(browser, "heat-map-custom-type-cryptocurrency");
    await replaceTextInput(browser, "heat-map-custom-input", "Bitcoin");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector(${JSON.stringify(selector("heat-map-custom-pick-BTC-USD"))})`,
      "The Crypto tab should show its matching curated result.",
    );
    await browser.evaluate(`window.__heatMapBrowserTest.setValidationResponses([{ type: "resolve", symbol: "BTC-USD" }])`);
    await clickTestID(browser, "heat-map-custom-add-asset-BTC-USD");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `localStorage.getItem(${JSON.stringify(customSymbolsStorageKey)}) === ${JSON.stringify(JSON.stringify(["SPY", "QQQ", "GLD", "AAPL", "MSFT", "NVDA", "TSLA", "GC=F", "BTC-USD"]))}`,
      "The crypto result should validate and persist as a single saved asset.",
    );

    await clickTestID(browser, "heat-map-custom-type-futures");
    await replaceTextInput(browser, "heat-map-custom-input", "S&P 500");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector(${JSON.stringify(selector("heat-map-custom-pick-ES=F"))})`,
      "The Futures tab should show its matching curated result.",
    );
    await browser.evaluate(`window.__heatMapBrowserTest.setValidationResponses([{ type: "resolve", symbol: "ES=F" }])`);
    await clickTestID(browser, "heat-map-custom-add-asset-ES=F");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `localStorage.getItem(${JSON.stringify(customSymbolsStorageKey)}) === ${JSON.stringify(JSON.stringify(["SPY", "QQQ", "GLD", "AAPL", "MSFT", "NVDA", "TSLA", "GC=F", "BTC-USD", "ES=F"]))}`,
      "The futures result should validate and persist as a single saved asset.",
    );

    const fullMapSymbols = Array.from({ length: 40 }, (_, index) => `SYM${index}`);
    await browser.evaluate(
      `localStorage.setItem(${JSON.stringify(customSymbolsStorageKey)}, ${JSON.stringify(JSON.stringify(fullMapSymbols))})`,
    );
    await browser.send("Page.reload", { ignoreCache: true });
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector(${JSON.stringify(selector("heat-map-category-picker"))})`,
      "The heat-map screen should reopen before checking the saved-asset limit.",
    );
    await clickTestID(browser, "heat-map-category-picker");
    await clickTestID(browser, "heat-map-category-custom");
    await waitForRequest(
      browser,
      `(request) => request.category === "custom" && JSON.stringify(request.symbols) === ${JSON.stringify(JSON.stringify(fullMapSymbols))}`,
      "the full 40-asset Watch Map",
    );
    await setResponse(browser, makeCustomResponse("1d", [], fullMapSymbols));
    await clickTestID(browser, "heat-map-add-ticker-open");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-my-watch-map-count"))})?.textContent.trim() === "40/40" && !!document.querySelector(${JSON.stringify(selector("heat-map-capacity-message"))})`,
      "The manager should show the 40-asset limit and explain how to make room.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-custom-add"))})?.disabled`),
      true,
      "A full Watch Map should disable direct ticker addition.",
    );
    await clickTestID(browser, "heat-map-remove-unavailable-SYM0");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `JSON.parse(localStorage.getItem(${JSON.stringify(customSymbolsStorageKey)})).length === 39 && !document.querySelector(${JSON.stringify(selector("heat-map-capacity-message"))})`,
      "Removing a saved item should release capacity immediately.",
    );
    await replaceTextInput(browser, "heat-map-custom-input", "TSLA");
    await browser.evaluate(`window.__heatMapBrowserTest.setValidationResponses([{ type: "resolve", symbol: "TSLA" }])`);
    await clickTestID(browser, "heat-map-custom-add");
    const fullMapAfterReplace = [...fullMapSymbols.slice(1), "TSLA"];
    await waitFor(
      (expression) => browser.evaluate(expression),
      `localStorage.getItem(${JSON.stringify(customSymbolsStorageKey)}) === ${JSON.stringify(JSON.stringify(fullMapAfterReplace))} && document.querySelector(${JSON.stringify(selector("heat-map-my-watch-map-count"))})?.textContent.trim() === "40/40"`,
      "Adding a replacement ticker should fill the freed slot without exceeding the limit.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-custom-add"))})?.disabled && !!document.querySelector(${JSON.stringify(selector("heat-map-capacity-message"))})`),
      true,
      "The capacity warning and disabled add control should return at 40 assets.",
    );
    await clickTestID(browser, "heat-map-add-ticker-close");
    await browser.send("Page.reload", { ignoreCache: true });
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector(${JSON.stringify(selector("heat-map-category-picker"))})`,
      "The app should reopen after saving a replacement ticker.",
    );
    await clickTestID(browser, "heat-map-category-picker");
    await clickTestID(browser, "heat-map-category-custom");
    await clickTestID(browser, "heat-map-add-ticker-open");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-my-watch-map-count"))})?.textContent.trim() === "40/40" && !!document.querySelector(${JSON.stringify(selector("heat-map-saved-asset-TSLA"))})`,
      "The full saved list should persist after reopening the app.",
    );
    await clickTestID(browser, "heat-map-add-ticker-close");
    await browser.send("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await clickTestID(browser, "heat-map-add-ticker-open");
    await delay(400);
    const addTickerDesktopBounds = await browser.evaluate(`(() => {
      const sheet = document.querySelector(${JSON.stringify(selector("heat-map-add-ticker-modal"))});
      const rect = sheet?.getBoundingClientRect();
      return rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, viewport: window.innerWidth, height: window.innerHeight } : null;
    })()`);
    assert.ok(addTickerDesktopBounds, "The add-ticker modal should render on a desktop viewport.");
    assert.ok(
      addTickerDesktopBounds.left >= 0
        && addTickerDesktopBounds.right <= 1280
        && addTickerDesktopBounds.top >= 0
        && addTickerDesktopBounds.bottom <= 900,
      `The modal must stay inside the desktop viewport: ${JSON.stringify(addTickerDesktopBounds)}`,
    );
    await clickTestID(browser, "heat-map-add-ticker-close");
    await browser.send("Emulation.setDeviceMetricsOverride", {
      width: 320,
      height: 720,
      deviceScaleFactor: 1,
      mobile: true,
    });

    // A stale crypto batch refreshes when the focused screen resumes, while a fresh
    // batch does not. The user's selected period and local filters remain intact.
    await clickTestID(browser, "heat-map-category-picker");
    await clickTestID(browser, "heat-map-category-cryptocurrency");
    await waitForRequest(
      browser,
      `(request) => request.category === "cryptocurrency" && request.period === "1d"`,
      "the cryptocurrency map",
    );
    await clickTestID(browser, "heat-map-filter-open");
    await clickTestID(browser, "heat-map-drawer-period-1w");
    await clickTestID(browser, "heat-map-filter-apply");
    await waitForRequest(
      browser,
      `(request) => request.category === "cryptocurrency" && request.period === "1w"`,
      "the cryptocurrency map with the selected period",
    );
    const cryptoResponse = (updatedAt) => ({
      category: "cryptocurrency",
      period: "1w",
      requestedSector: null,
      updatedAt,
      quotes: [
        quote("BTC-USD", {
          assetType: "cryptocurrency",
          exchange: "COINBASE",
          priceTimestamp: Date.now() / 1000,
          riskBand: "Aggressive",
        }),
        quote("ETH-USD", {
          assetType: "cryptocurrency",
          exchange: "KRAKEN",
          priceTimestamp: Date.now() / 1000,
          riskBand: "Conservative",
        }),
      ],
      unavailableSymbols: [],
    });
    await setResponse(browser, cryptoResponse(Date.now() / 1000));
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector(${JSON.stringify(selector("heat-map-session-BTC-USD"))}) && !!document.querySelector(${JSON.stringify(selector("heat-map-session-ETH-USD"))})`,
      "fresh cryptocurrency quotes should render before filtering.",
    );
    await waitFor(
      (expression) => browser.evaluate(expression),
      `(() => {
        const logo = document.querySelector(${JSON.stringify(selector("heat-map-crypto-logo-BTC-USD"))});
        const ticker = document.querySelector(${JSON.stringify(selector("heat-map-crypto-symbol-BTC-USD"))});
        const image = logo?.querySelector("img");
        if (!logo || !ticker || !image) return false;
        const logoBounds = logo.getBoundingClientRect();
        const tickerBounds = ticker.getBoundingClientRect();
        const translateY = new DOMMatrixReadOnly(getComputedStyle(logo).transform).m42;
        return image.naturalWidth > 0
          && logoBounds.width >= 24
          && translateY < 0
          && logoBounds.bottom <= tickerBounds.top + 1;
      })()`,
      "the larger local Bitcoin logo should sit slightly higher than its ticker in the cryptocurrency tile.",
    );
    await clickTestID(browser, "heat-map-filter-open");
    await clickTestID(browser, "heat-map-filter-exchange-COINBASE");
    await clickTestID(browser, "heat-map-filter-risk-Aggressive");
    await clickTestID(browser, "heat-map-filter-apply");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-counted-quotes"))})?.textContent === "1"`,
      "the selected local crypto filters should leave only BTC visible.",
    );
    await clickTestID(browser, "heat-map-open-detail-BTC-USD");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector(${JSON.stringify(selector("heat-map-crypto-supply-discrepancy"))})`,
      "a large discrepancy between current supply and recent on-chain history should be flagged.",
    );
    const discrepancyText = await browser.evaluate(
      `document.querySelector(${JSON.stringify(selector("heat-map-crypto-supply-discrepancy"))})?.textContent`,
    );
    assert.match(discrepancyText, /21,000,000/);
    assert.match(discrepancyText, /19,876,600\.5/);
    assert.match(discrepancyText, /Both values are preserved as reported/);
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector(${JSON.stringify(selector(`heat-map-crypto-supply-point-${historyDates.selected}`))})`,
      "the supply chart should expose controls for its reported observations.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector(`heat-map-crypto-supply-point-${historyDates.gap}`))}) === null`),
      true,
      "a date with no provider observation must not be selectable.",
    );
    const supplyPointButton = await browser.evaluate(
      `document.querySelector(${JSON.stringify(selector(`heat-map-crypto-supply-point-${historyDates.selected}`))})?.getAttribute("aria-label")`,
    );
    assert.ok(supplyPointButton.includes(`${selectedHistoryDateLabel}: 19,876,543.123456`));
    await clickTestID(browser, `heat-map-crypto-supply-point-${historyDates.selected}`);
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-crypto-supply-selected-value"))})?.textContent === "19,876,543.123456"`,
      "selecting a plotted observation should reveal its exact provider-reported value.",
    );
    const historyRefreshesBefore = await browser.evaluate("window.__heatMapBrowserTest.cryptoSupplyHistoryRefetches.length");
    await clickTestID(browser, "heat-map-crypto-supply-refresh");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `window.__heatMapBrowserTest.cryptoSupplyHistoryRefetches.length === ${historyRefreshesBefore + 1}`,
      "the supply-history refresh action should request the selected history again.",
    );
    assert.equal(
      await browser.evaluate(`!!document.querySelector(${JSON.stringify(selector("heat-map-detail-modal"))}) && !!document.querySelector(${JSON.stringify(selector("heat-map-crypto-supply-chart"))}) && document.querySelector(${JSON.stringify(selector("heat-map-crypto-supply-selected-value"))})?.textContent === "19,876,543.123456"`),
      true,
      "refreshing supply history should keep the detail card open and preserve its existing chart and selected observation.",
    );
    await browser.evaluate(`window.__heatMapBrowserTest.setCryptoSupplyHistoryOverride("BTC-USD", { type: "resolve", payload: {
      symbol: "BTC-USD", provider: "Coin Metrics", metric: "SplyCur", rangeDays: 365, interval: "daily",
      startDate: ${JSON.stringify(historyDates.oldest)}, endDate: ${JSON.stringify(historyDates.latest)},
      points: [
        { date: ${JSON.stringify(historyDates.oldest)}, supply: 19_876_500 },
        { date: ${JSON.stringify(historyDates.selected)}, supply: 19_876_543.123456 },
        { date: ${JSON.stringify(historyDates.latest)}, supply: 19_876_600.5 },
      ],
    } })`);
    await browser.evaluate(`window.__heatMapBrowserTest.setCryptoSupplyHistoryOverride("BTC-USD", { type: "pending" })`);
    assert.equal(
      await browser.evaluate(`!!document.querySelector(${JSON.stringify(selector("heat-map-crypto-supply-loading"))}) && !!document.querySelector(${JSON.stringify(selector("heat-map-crypto-supply-chart"))}) && document.querySelector(${JSON.stringify(selector("heat-map-crypto-supply-change-value"))})?.textContent.includes("100.5")`),
      true,
      "while refreshed history is loading, the previous chart and its summary should remain visible.",
    );
    await browser.evaluate(`window.__heatMapBrowserTest.setCryptoSupplyHistoryOverride("BTC-USD", { type: "reject" })`);
    assert.equal(
      await browser.evaluate(`!!document.querySelector(${JSON.stringify(selector("heat-map-crypto-supply-refresh-error"))}) && !!document.querySelector(${JSON.stringify(selector("heat-map-crypto-supply-chart"))}) && !!document.querySelector(${JSON.stringify(selector("heat-map-detail-modal"))})`),
      true,
      "a failed refresh should explain that cached history remains visible without closing the detail card.",
    );
    const historyRefreshesBeforeRetry = await browser.evaluate("window.__heatMapBrowserTest.cryptoSupplyHistoryRefetches.length");
    await clickTestID(browser, "heat-map-crypto-supply-retry");
    assert.equal(
      await browser.evaluate(`window.__heatMapBrowserTest.cryptoSupplyHistoryRefetches.length === ${historyRefreshesBeforeRetry + 1}`),
      true,
      "the supply-history error state should offer a working retry action.",
    );
    await browser.evaluate(`window.__heatMapBrowserTest.setCryptoSupplyHistoryOverride("BTC-USD", { type: "resolve", payload: {
      symbol: "BTC-USD", provider: "Coin Metrics", metric: "SplyCur", rangeDays: 365, interval: "daily",
      startDate: ${JSON.stringify(historyDates.oldest)}, endDate: ${JSON.stringify(historyDates.latest)},
      points: [
        { date: ${JSON.stringify(historyDates.oldest)}, supply: 19_876_500 },
        { date: ${JSON.stringify(historyDates.selected)}, supply: 19_876_543.123456 },
        { date: ${JSON.stringify(historyDates.latest)}, supply: 19_876_600.5 },
      ],
    } })`);
    await browser.evaluate(`window.__heatMapBrowserTest.setCryptoSupplyHistoryOverride("BTC-USD", { type: "pending" })`);
    await browser.evaluate(`window.__heatMapBrowserTest.setDetailResponses([{ type: "late" }])`);
    await clickTestID(browser, "heat-map-detail-refresh");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `window.__heatMapBrowserTest.pendingDetailRequests.some((request) => request.url.endsWith("/BTC-USD")) && !!document.querySelector(${JSON.stringify(selector("heat-map-crypto-supply-loading"))})`,
      "Bitcoin's refreshed market statistics and supply history should both remain pending before switching coins.",
    );
    await clickTestID(browser, "heat-map-detail-close");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!document.querySelector(${JSON.stringify(selector("heat-map-detail-modal"))})`,
      "The Bitcoin detail card should close before checking a different coin.",
    );

    const switchedCryptoResponse = cryptoResponse(Date.now() / 1000);
    switchedCryptoResponse.quotes = switchedCryptoResponse.quotes.map((item) => item.symbol === "ETH-USD"
      ? { ...item, exchange: "COINBASE", riskBand: "Aggressive" }
      : item);
    await browser.evaluate(`window.__heatMapBrowserTest.setCryptoSupplyHistoryOverride("ETH-USD", { type: "pending" })`);
    await setResponse(browser, switchedCryptoResponse);
    await setDetailResponses(browser, [{ type: "defer" }]);
    await clickTestID(browser, "heat-map-open-detail-ETH-USD");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `window.__heatMapBrowserTest.pendingDetailRequests.some((request) => request.url.endsWith("/ETH-USD"))`,
      "Ethereum's market statistics should remain pending while its history is also loading.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-detail-title"))})?.textContent`),
      "ETH-USD",
      "The detail card should switch to the newly selected coin immediately.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelectorAll(${JSON.stringify(selector("heat-map-crypto-supply-discrepancy"))}).length`),
      0,
      "The previous coin's warning must disappear while the new coin's current supply and history are pending.",
    );
    assert.equal(
      await browser.evaluate(`document.body.innerText.includes("19,876,600.5")`),
      false,
      "The previous coin's historical value must not appear in the newly selected coin's card.",
    );

    assert.equal(
      await browser.evaluate(`window.__heatMapBrowserTest.resolvePendingDetailRequest("/api/stocks/info/BTC-USD", { circulatingSupply: 987_654_321, marketCap: 1_000_000_000_000 })`),
      true,
      "Bitcoin's old market-statistics response should be resolvable after Ethereum is selected.",
    );
    await browser.evaluate(`window.__heatMapBrowserTest.setCryptoSupplyHistoryOverride("BTC-USD", { type: "resolve", payload: {
      symbol: "BTC-USD", provider: "Coin Metrics", metric: "SplyCur", rangeDays: 365, interval: "daily",
      startDate: ${JSON.stringify(historyDates.latest)}, endDate: ${JSON.stringify(historyDates.latest)},
      points: [{ date: ${JSON.stringify(historyDates.latest)}, supply: 987_654_321.123 }],
    } })`);
    await delay(50);
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-detail-title"))})?.textContent === "ETH-USD" && document.querySelectorAll(${JSON.stringify(selector("heat-map-crypto-supply-discrepancy"))}).length === 0 && !document.body.innerText.includes("987,654,321")`),
      true,
      "Late Bitcoin statistics and history must not change Ethereum's pending supply or warning.",
    );

    assert.equal(
      await browser.evaluate(`window.__heatMapBrowserTest.resolvePendingDetailRequest("/api/stocks/info/ETH-USD", { circulatingSupply: 12_345_678, marketCap: 400_000_000_000 })`),
      true,
      "The new coin's pending current-supply response should be resolvable.",
    );
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-detail-stat-circulating-supply"))})?.textContent === "12.35M"`,
      "Ethereum's current supply should appear even while its history is still loading.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelectorAll(${JSON.stringify(selector("heat-map-crypto-supply-discrepancy"))}).length`),
      0,
      "A warning must wait for the selected coin's own history rather than reusing Bitcoin's observations.",
    );

    await browser.evaluate(`window.__heatMapBrowserTest.setCryptoSupplyHistoryOverride("ETH-USD", { type: "resolve", payload: {
      symbol: "ETH-USD", provider: "Coin Metrics", metric: "SplyCur", rangeDays: 365, interval: "daily",
      startDate: ${JSON.stringify(historyDates.latest)}, endDate: ${JSON.stringify(historyDates.latest)},
      points: [{ date: ${JSON.stringify(historyDates.latest)}, supply: 10_000_000 }],
    } })`);
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector(${JSON.stringify(selector("heat-map-crypto-supply-discrepancy"))})`,
      "A warning should appear once Ethereum's own current supply and history are both available.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-crypto-supply-discrepancy"))})?.textContent.includes("12,345,678") && document.querySelector(${JSON.stringify(selector("heat-map-crypto-supply-discrepancy"))})?.textContent.includes("10,000,000") && !document.querySelector(${JSON.stringify(selector("heat-map-crypto-supply-discrepancy"))})?.textContent.includes("19,876,600.5")`),
      true,
      "The warning should compare only Ethereum's current and historical values.",
    );
    await browser.evaluate(`window.__heatMapBrowserTest.setCryptoSupplyHistoryOverride("ETH-USD", { type: "pending" })`);
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector(${JSON.stringify(selector("heat-map-crypto-supply-loading"))})`,
      "A pending refresh of Ethereum's history should show a loading indicator.",
    );
    assert.equal(
      await browser.evaluate(`!!document.querySelector(${JSON.stringify(selector("heat-map-crypto-supply-discrepancy"))}) && document.querySelector(${JSON.stringify(selector("heat-map-crypto-supply-discrepancy"))})?.textContent.includes("10,000,000")`),
      true,
      "Ethereum's previous history comparison should remain visible during a refresh.",
    );

    await browser.evaluate(`window.__heatMapBrowserTest.setCryptoSupplyHistoryOverride("ETH-USD", { type: "resolve", payload: {
      symbol: "ETH-USD", provider: "Coin Metrics", metric: "SplyCur", rangeDays: 365, interval: "daily",
      startDate: null, endDate: null, points: [],
    } })`);
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!document.querySelector(${JSON.stringify(selector("heat-map-crypto-supply-loading"))})`,
      "An empty history response should finish loading for the selected coin.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-detail-stat-circulating-supply"))})?.textContent`),
      "12.35M",
      "The new coin's current supply should remain visible when its own history has no observations.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelectorAll(${JSON.stringify(selector("heat-map-crypto-supply-discrepancy"))}).length`),
      0,
      "Missing history for the selected coin must not leave the previous coin's warning behind.",
    );
    await clickTestID(browser, "heat-map-detail-close");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!document.querySelector(${JSON.stringify(selector("heat-map-detail-modal"))})`,
      "The Ethereum detail card should close before continuing the crypto refresh checks.",
    );

    const freshCryptoResponse = cryptoResponse(Date.now() / 1000);

    const refetchCountBeforeCryptoCadence = await browser.evaluate("window.__heatMapBrowserTest.refetches.length");
    await browser.evaluate(`(() => {
      const activeIntervals = window.__heatMapTrackedIntervals.filter((item) => item.delay === 60_000 && !item.cleared);
      window.__heatMapTestCryptoInterval = activeIntervals.at(-1);
      if (!window.__heatMapTestCryptoInterval) throw new Error("The foreground crypto refresh interval was not started.");
    })()`);
    await browser.evaluate(`window.__heatMapBrowserTest.setNextRefetchResponse(${JSON.stringify(freshCryptoResponse)})`);
    await browser.evaluate(`window.__heatMapTestCryptoInterval.callback(...window.__heatMapTestCryptoInterval.args)`);
    await waitFor(
      (expression) => browser.evaluate(expression),
      `window.__heatMapBrowserTest.refetches.length === ${refetchCountBeforeCryptoCadence + 1}`,
      "one foreground cadence tick should refresh the selected cryptocurrency map.",
    );
    assert.deepEqual(
      await browser.evaluate("window.__heatMapBrowserTest.refetches.at(-1)"),
      { category: "cryptocurrency", period: "1w" },
      "the crypto cadence refresh should preserve the selected category and period.",
    );
    assert.match(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-selected-period"))}).textContent`),
      /1W/,
      "the crypto cadence refresh should preserve the selected return period.",
    );
    assert.match(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-filter-open"))}).getAttribute("aria-label")`),
      /2 active/,
      "the crypto cadence refresh should preserve local filters.",
    );

    const refetchCountBeforeCryptoRetry = await browser.evaluate("window.__heatMapBrowserTest.refetches.length");
    await browser.evaluate("window.__heatMapBrowserTest.setRefetchFailures(2)");
    await browser.evaluate(`window.__heatMapTestCryptoInterval.callback(...window.__heatMapTestCryptoInterval.args)`);
    await waitFor(
      (expression) => browser.evaluate(expression),
      `window.__heatMapBrowserTest.refetches.length === ${refetchCountBeforeCryptoRetry + 2}`,
      "a failed crypto cadence tick should make only one delayed retry.",
    );
    await delay(50);
    assert.equal(
      await browser.evaluate("window.__heatMapBrowserTest.refetches.length"),
      refetchCountBeforeCryptoRetry + 2,
      "a second crypto refresh failure should not create an unbounded retry loop.",
    );

    const refetchCountBeforeBackgroundRetryCancellation = await browser.evaluate("window.__heatMapBrowserTest.refetches.length");
    await browser.evaluate("window.__heatMapBrowserTest.setRefetchFailures(1)");
    await browser.evaluate(`window.__heatMapTestCryptoInterval.callback(...window.__heatMapTestCryptoInterval.args)`);
    await waitFor(
      (expression) => browser.evaluate(expression),
      `window.__heatMapBrowserTest.refetches.length === ${refetchCountBeforeBackgroundRetryCancellation + 1}`,
      "a failed crypto cadence tick should start its bounded retry before backgrounding.",
    );
    await browser.evaluate(`(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    })()`);
    await waitFor(
      (expression) => browser.evaluate(expression),
      "window.__heatMapTestCryptoInterval.cleared",
      "backgrounding should stop the crypto interval and cancel its pending retry.",
    );
    await delay(1_100);
    assert.equal(
      await browser.evaluate("window.__heatMapBrowserTest.refetches.length"),
      refetchCountBeforeBackgroundRetryCancellation + 1,
      "a pending crypto retry must not run after the app backgrounds.",
    );
    await browser.evaluate(`(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    })()`);
    await waitFor(
      (expression) => browser.evaluate(expression),
      "window.__heatMapTrackedIntervals.filter((item) => item.delay === 60_000 && !item.cleared).at(-1) !== window.__heatMapTestCryptoInterval",
      "returning to the foreground should start a fresh crypto interval after canceling a retry.",
    );
    await browser.evaluate(`window.__heatMapTestCryptoInterval = window.__heatMapTrackedIntervals.filter((item) => item.delay === 60_000 && !item.cleared).at(-1)`);

    const refetchCountBeforeCryptoBackground = await browser.evaluate("window.__heatMapBrowserTest.refetches.length");
    await browser.evaluate(`(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    })()`);
    await waitFor(
      (expression) => browser.evaluate(expression),
      "window.__heatMapTestCryptoInterval.cleared",
      "backgrounding the app should stop the crypto refresh interval.",
    );
    await browser.evaluate(`window.__heatMapTestCryptoInterval.callback(...window.__heatMapTestCryptoInterval.args)`);
    await delay(50);
    assert.equal(
      await browser.evaluate("window.__heatMapBrowserTest.refetches.length"),
      refetchCountBeforeCryptoBackground,
      "a stale crypto interval callback must not refresh while the app is backgrounded.",
    );
    await browser.evaluate(`(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    })()`);
    await waitFor(
      (expression) => browser.evaluate(expression),
      "window.__heatMapTrackedIntervals.filter((item) => item.delay === 60_000 && !item.cleared).at(-1) !== window.__heatMapTestCryptoInterval",
      "returning to the foreground should start a fresh crypto refresh interval.",
    );
    await browser.evaluate(`window.__heatMapTestCryptoInterval = window.__heatMapTrackedIntervals.filter((item) => item.delay === 60_000 && !item.cleared).at(-1)`);

    const refetchCountBeforeCryptoBlur = await browser.evaluate("window.__heatMapBrowserTest.refetches.length");
    await browser.evaluate("window.__heatMapSetFocused(false)");
    await waitFor(
      (expression) => browser.evaluate(expression),
      "window.__heatMapTestCryptoInterval.cleared",
      "leaving the heat-map screen should stop the crypto refresh interval.",
    );
    await browser.evaluate(`window.__heatMapTestCryptoInterval.callback(...window.__heatMapTestCryptoInterval.args)`);
    await delay(50);
    assert.equal(
      await browser.evaluate("window.__heatMapBrowserTest.refetches.length"),
      refetchCountBeforeCryptoBlur,
      "a stale crypto interval callback must not refresh after the heat-map screen loses focus.",
    );
    await browser.evaluate("window.__heatMapSetFocused(true)");
    await waitFor(
      (expression) => browser.evaluate(expression),
      "window.__heatMapTrackedIntervals.filter((item) => item.delay === 60_000 && !item.cleared).at(-1) !== window.__heatMapTestCryptoInterval",
      "returning to the heat-map screen should start a fresh crypto refresh interval.",
    );
    await browser.evaluate(`window.__heatMapTestCryptoInterval = window.__heatMapTrackedIntervals.filter((item) => item.delay === 60_000 && !item.cleared).at(-1)`);

    const refetchCountBeforeCryptoResume = await browser.evaluate("window.__heatMapBrowserTest.refetches.length");
    await browser.evaluate(`window.__heatMapBrowserTest.setNextRefetchResponse(${JSON.stringify(freshCryptoResponse)})`);
    await browser.evaluate("window.__heatMapBrowserTest.setRefetchFailures(1)");
    await setResponse(browser, cryptoResponse(Date.now() / 1000 - 6 * 60));
    await browser.evaluate(`(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    })()`);
    await browser.evaluate(`(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    })()`);
    await waitFor(
      (expression) => browser.evaluate(expression),
      `window.__heatMapBrowserTest.refetches.length === ${refetchCountBeforeCryptoResume + 1}`,
      "resuming with a stale cryptocurrency batch should make its initial refresh attempt.",
    );
    assert.deepEqual(
      await browser.evaluate("window.__heatMapBrowserTest.refetches.slice(-1)"),
      [{ category: "cryptocurrency", period: "1w" }],
      "the initial stale-crypto resume attempt should preserve the selected map.",
    );
    await waitFor(
      (expression) => browser.evaluate(expression),
      `window.__heatMapBrowserTest.refetches.length === ${refetchCountBeforeCryptoResume + 2}`,
      "a failed stale-crypto resume refresh should get one delayed retry.",
    );
    assert.deepEqual(
      await browser.evaluate("window.__heatMapBrowserTest.refetches.at(-1)"),
      { category: "cryptocurrency", period: "1w" },
      "the successful retry should keep the selected category and period.",
    );
    assert.match(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-selected-period"))}).textContent`),
      /1W/,
      "the stale crypto retry should preserve the selected return period.",
    );
    assert.match(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-filter-open"))}).getAttribute("aria-label")`),
      /2 active/,
      "the stale crypto retry should preserve local filters.",
    );

    await browser.evaluate(`(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    })()`);
    await browser.evaluate(`(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    })()`);
    await delay(100);
    assert.equal(
      await browser.evaluate("window.__heatMapBrowserTest.refetches.length"),
      refetchCountBeforeCryptoResume + 2,
      "a successful retry should leave the fresh cryptocurrency batch without another automatic request.",
    );
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("heat-map-counted-quotes"))})?.textContent`),
      "1",
      "the local crypto filters should remain applied after both resumes.",
    );

    const refetchCountBeforeFailedCryptoResumeRetry = await browser.evaluate("window.__heatMapBrowserTest.refetches.length");
    await browser.evaluate("window.__heatMapBrowserTest.setRefetchFailures(2)");
    await setResponse(browser, cryptoResponse(Date.now() / 1000 - 6 * 60));
    await delay(50);
    await browser.evaluate(`(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    })()`);
    await delay(50);
    await browser.evaluate(`(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    })()`);
    await waitFor(
      (expression) => browser.evaluate(expression),
      `window.__heatMapBrowserTest.refetches.length === ${refetchCountBeforeFailedCryptoResumeRetry + 1}`,
      "a stale crypto resume should start its first attempt when testing a failed retry.",
    );
    await waitFor(
      (expression) => browser.evaluate(expression),
      `window.__heatMapBrowserTest.refetches.length === ${refetchCountBeforeFailedCryptoResumeRetry + 2}`,
      "a failed stale-crypto resume attempt should make only one retry.",
    );
    await delay(100);
    assert.equal(
      await browser.evaluate("window.__heatMapBrowserTest.refetches.length"),
      refetchCountBeforeFailedCryptoResumeRetry + 2,
      "a failed resume retry must not create a third automatic request.",
    );

    const refetchCountBeforeCryptoBlurRetry = await browser.evaluate("window.__heatMapBrowserTest.refetches.length");
    await browser.evaluate("window.__heatMapBrowserTest.setRefetchFailures(1)");
    await setResponse(browser, cryptoResponse(Date.now() / 1000 - 6 * 60));
    await delay(50);
    await browser.evaluate(`(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    })()`);
    await delay(50);
    await browser.evaluate(`(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    })()`);
    await waitFor(
      (expression) => browser.evaluate(expression),
      `window.__heatMapBrowserTest.refetches.length === ${refetchCountBeforeCryptoBlurRetry + 1}`,
      "a stale crypto resume should start before testing blur cancellation.",
    );
    await delay(50);
    await browser.evaluate("window.__heatMapSetFocused(false)");
    await delay(1_100);
    assert.equal(
      await browser.evaluate("window.__heatMapBrowserTest.refetches.length"),
      refetchCountBeforeCryptoBlurRetry + 1,
      "blurring the heat-map screen should cancel its pending resume retry.",
    );

    await browser.evaluate("window.__heatMapSetFocused(true)");
    await waitFor(
      (expression) => browser.evaluate(expression),
      "window.__heatMapTrackedIntervals.filter((item) => item.delay === 60_000 && !item.cleared).at(-1) !== window.__heatMapTestCryptoInterval",
      "returning to the heat-map screen should reattach the crypto refresh listeners.",
    );
    await browser.evaluate(`window.__heatMapTestCryptoInterval = window.__heatMapTrackedIntervals.filter((item) => item.delay === 60_000 && !item.cleared).at(-1)`);
    const refetchCountBeforeCryptoMapChange = await browser.evaluate("window.__heatMapBrowserTest.refetches.length");
    await browser.evaluate("window.__heatMapBrowserTest.setRefetchFailures(1)");
    await browser.evaluate(`(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    })()`);
    await delay(50);
    await browser.evaluate(`(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    })()`);
    await waitFor(
      (expression) => browser.evaluate(expression),
      `window.__heatMapBrowserTest.refetches.length === ${refetchCountBeforeCryptoMapChange + 1}`,
      "the focused stale crypto map should start another resume attempt.",
    );
    await delay(50);
    await clickTestID(browser, "heat-map-category-picker");
    await clickTestID(browser, "heat-map-category-etfs");
    await waitForRequest(
      browser,
      `(request) => request.category === "etfs" && request.period === "1w"`,
      "the newly selected ETF map",
    );
    await delay(1_100);
    assert.equal(
      await browser.evaluate("window.__heatMapBrowserTest.refetches.length"),
      refetchCountBeforeCryptoMapChange + 1,
      "changing the selected map should cancel the pending crypto resume retry.",
    );

    await setResponse(browser, makeResponse("etfs", "1w", "IVV"));
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector(${JSON.stringify(selector("heat-map-open-detail-IVV"))})`,
      "The ETF map should render a tile before opening its detail card.",
    );
    await clickTestID(browser, "heat-map-open-detail-IVV");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-detail-title"))})?.textContent === "IVV"`,
      "Tapping an ETF tile should open its detail card.",
    );
    await assertWatchlistAddIsUnique(browser, "IVV");
    await clickTestID(browser, "heat-map-detail-close");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!document.querySelector(${JSON.stringify(selector("heat-map-detail-modal"))})`,
      "The ETF detail card should close before testing commodities.",
    );

    await clickTestID(browser, "heat-map-category-picker");
    await clickTestID(browser, "heat-map-category-commodities");
    await waitForRequest(
      browser,
      `(request) => request.category === "commodities" && request.period === "1w"`,
      "the commodity map",
    );
    await setResponse(browser, makeResponse("commodities", "1w", "GC=F"));
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector(${JSON.stringify(selector("heat-map-open-detail-GC=F"))})`,
      "The commodity map should render a tile before opening its detail card.",
    );
    await clickTestID(browser, "heat-map-open-detail-GC=F");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-detail-title"))})?.textContent === "GC=F"`,
      "Tapping a commodity tile should open its detail card.",
    );
    await assertWatchlistAddIsUnique(browser, "GC=F");
    await clickTestID(browser, "heat-map-detail-analyze-commodity");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `window.__heatMapRoutePushes?.includes("/analysis/GC%3DF") && !document.querySelector(${JSON.stringify(selector("heat-map-detail-modal"))})`,
      "The commodity detail action should close the modal and navigate to Gold analysis.",
    );
    await browser.evaluate("window.__heatMapSetFocused(false)");
    await browser.evaluate("window.__heatMapSetFocused(true)");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-detail-title"))})?.textContent === "GC=F"`,
      "Returning from AI analysis should restore the Gold detail card.",
    );
    await clickTestID(browser, "heat-map-detail-open-chart");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `window.__heatMapRoutePushes?.some((route) => typeof route === "object" && route.pathname === "/heat-map-chart" && route.params?.symbol === "GC=F") && !document.querySelector(${JSON.stringify(selector("heat-map-detail-modal"))})`,
      "The chart action should dismiss the Gold detail card and navigate to its chart.",
    );
    await browser.evaluate("window.__heatMapSetFocused(false)");
    await browser.evaluate("window.__heatMapSetFocused(true)");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-detail-title"))})?.textContent === "GC=F"`,
      "Returning from the full chart should restore the Gold detail card.",
    );
    await clickTestID(browser, "heat-map-detail-close");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!document.querySelector(${JSON.stringify(selector("heat-map-detail-modal"))})`,
      "The restored Gold detail card should close normally.",
    );
    await clickTestID(browser, "heat-map-unavailable-hex-CL=F");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.querySelector(${JSON.stringify(selector("heat-map-detail-title"))})?.textContent === "Crude Oil"`,
      "Tapping an unavailable commodity should open its detail card.",
    );
    assert.equal(
      await browser.evaluate(`!document.querySelector(${JSON.stringify(selector("heat-map-detail-price"))})`),
      true,
      "An unavailable commodity should not show a stale current price.",
    );
    await assertWatchlistAddIsUnique(browser, "CL=F");

    const watchlistBeforeReorder = await browser.evaluate("window.__heatMapWatchlistSymbols");
    assert.ok(watchlistBeforeReorder.length >= 2, "The restart check needs multiple watchlist entries.");
    const expectedWatchlistOrder = [...watchlistBeforeReorder].reverse();
    assert.notDeepEqual(
      expectedWatchlistOrder,
      watchlistBeforeReorder,
      "The test should change the order before reopening the app.",
    );
    await browser.evaluate(
      `window.__heatMapReorderWatchlist(${JSON.stringify(expectedWatchlistOrder)})`,
    );
    await waitFor(
      (expression) => browser.evaluate(expression),
      `JSON.stringify(window.__heatMapWatchlistSymbols) === ${JSON.stringify(JSON.stringify(expectedWatchlistOrder))}`,
      "the reordered watchlist before reopening the app",
    );

    await browser.send("Page.reload", { ignoreCache: true });
    await waitFor(
      (expression) => browser.evaluate(expression),
      `JSON.stringify(window.__heatMapWatchlistSymbols) === ${JSON.stringify(JSON.stringify(expectedWatchlistOrder))}`,
      "Reopening the app should restore all watchlist entries in their saved order.",
    );
    const restoredWatchlist = await browser.evaluate("window.__heatMapWatchlistSymbols");
    assert.deepEqual(
      restoredWatchlist,
      expectedWatchlistOrder,
      "Reopening the app should preserve the exact order of multiple watchlist entries.",
    );
    assert.equal(
      restoredWatchlist.filter((symbol) => symbol === "IVV").length,
      1,
      "The ETF should remain in the watchlist exactly once after reopening the app.",
    );
    assert.equal(
      restoredWatchlist.filter((symbol) => symbol === "GC=F").length,
      1,
      "The commodity should remain in the watchlist exactly once after reopening the app.",
    );
    assert.equal(
      restoredWatchlist.filter((symbol) => symbol === "CL=F").length,
      1,
      "The unavailable commodity should remain in the watchlist exactly once after reopening the app.",
    );
    assert.equal(
      new Set(restoredWatchlist).size,
      restoredWatchlist.length,
      "Reopening the app should not restore duplicate watchlist symbols.",
    );
  } finally {
    browser?.close();
    chrome.kill("SIGTERM");
    await new Promise((resolveExit) => {
      if (chrome.exitCode !== null) resolveExit();
      else {
        const timer = setTimeout(resolveExit, 1500);
        chrome.once("exit", () => {
          clearTimeout(timer);
          resolveExit();
        });
      }
    });
    await new Promise((resolveClose) => server.close(resolveClose));
    await rm(profileDir, { recursive: true, force: true });
  }
});