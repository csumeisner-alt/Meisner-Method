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
    ["@/components/AmericanSteelBackground", join(fixtureDir, "mocks/american-steel-background.tsx")],
    ["@/components/BottomTabBar", join(fixtureDir, "mocks/bottom-tab-bar.tsx")],
    ["@/hooks/useColors", join(fixtureDir, "mocks/use-colors.ts")],
  ]);

  const result = await build({
    entryPoints: [join(fixtureDir, "entry.tsx")],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2022",
    jsx: "automatic",
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
      quote("OTHER_CAP", { marketCapUsd: 1_000_000_000, riskBand: "Moderate" }),
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

test("heat-map drawer interaction, late responses, and narrow-phone layout render correctly", async () => {
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
      </head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`);
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
      const nextOpenText = await browser.evaluate(
        `document.querySelector(${JSON.stringify(selector(`heat-map-next-open-${currentSymbol}`))})?.textContent`,
      );
      assert.match(nextOpenText, /Next open: Nov 29\s*9:30 AM EST/);
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
        }
      } else {
        await setResponse(browser, makeResponse("custom", "1d", ""));
      }
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
      const tile = session?.parentElement;
      if (!session || !tile) return null;
      return {
        width: tile.getBoundingClientRect().width,
        sessionFontSize: Number.parseFloat(getComputedStyle(session).fontSize),
      };
    })()`);
    assert.ok(tileVisuals, "A fixture quote should render its session label inside a hexagon.");
    assert.ok(tileVisuals.width > 98, "The rendered hexagon should be larger than the previous 98px narrow-phone size.");
    assert.ok(tileVisuals.sessionFontSize > 7, "The session label should be larger than the previous 7px size.");
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
    await browser.send("Page.reload", { ignoreCache: true });
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector(${JSON.stringify(selector("heat-map-category-picker"))})`,
      "The heat-map screen should reopen before selecting the custom map.",
    );

    await clickTestID(browser, "heat-map-category-picker");
    await clickTestID(browser, "heat-map-category-custom");
    await waitForRequest(
      browser,
      `(request) => request.category === "custom" && JSON.stringify(request.symbols) === '["AAPL","MSFT","MISSING"]'`,
      "the saved custom tickers",
    );
    await setResponse(browser, makeCustomResponse("1d", [quote("AAPL"), quote("MSFT")], ["MISSING"]));
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector(${JSON.stringify(selector("heat-map-session-AAPL"))}) && !!document.querySelector(${JSON.stringify(selector("heat-map-session-MSFT"))})`,
      "Both available custom tickers should appear as heat-map hexagons.",
    );

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
    assert.ok(
      await browser.evaluate(`!!document.querySelector(${JSON.stringify(selector("heat-map-remove-unavailable-MISSING"))})`),
      "An unavailable ticker with no hexagon should still have a removal fallback in edit mode.",
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
    await clickTestID(browser, "heat-map-custom-undo");
    await waitFor(
      (expression) => browser.evaluate(expression),
      `localStorage.getItem(${JSON.stringify(customSymbolsStorageKey)}) === ${JSON.stringify(JSON.stringify(["AAPL", "MSFT", "MISSING"]))}`,
      "Undoing an unavailable ticker removal should preserve all other saved tickers.",
    );
    await waitForRequest(
      browser,
      `(request) => request.category === "custom" && JSON.stringify(request.symbols) === '["AAPL","MSFT","MISSING"]'`,
      "restoring the unavailable ticker",
    );
    await setResponse(browser, makeCustomResponse("1d", [quote("AAPL"), quote("MSFT")], ["MISSING"]));

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
      `(request) => request.category === "custom" && JSON.stringify(request.symbols) === '["AAPL","MSFT","MISSING"]'`,
      "the restored custom map after reopening",
    );
    await setResponse(browser, makeCustomResponse("1d", [quote("AAPL"), quote("MSFT")], ["MISSING"]));
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector(${JSON.stringify(selector("heat-map-session-AAPL"))}) && !!document.querySelector(${JSON.stringify(selector("heat-map-session-MSFT"))})`,
      "The restored ticker and the other saved ticker should render after reopening the map.",
    );
    await clickTestID(browser, "heat-map-custom-edit");
    assert.equal(
      await browser.evaluate(`localStorage.getItem(${JSON.stringify(customSymbolsStorageKey)})`),
      JSON.stringify(["AAPL", "MSFT", "MISSING"]),
      "The restored custom map should preserve its full saved ticker list after reopening.",
    );
    assert.equal(
      await browser.evaluate(`!!document.querySelector(${JSON.stringify(selector("heat-map-remove-unavailable-MISSING"))})`),
      true,
      "The unavailable ticker should remain saved and available for editing after reopening.",
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