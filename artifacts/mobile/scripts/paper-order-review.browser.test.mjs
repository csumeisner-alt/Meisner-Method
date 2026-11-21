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
const fixtureDir = join(scriptDir, "paper-order-review-browser");
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
    ["@expo/vector-icons", join(fixtureDir, "mocks/vector-icons.tsx")],
    ["@/components/KeyboardAwareScrollViewCompat", join(fixtureDir, "mocks/keyboard-scroll.tsx")],
    ["react-native-safe-area-context", join(fixtureDir, "mocks/safe-area-context.tsx")],
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
      name: "paper-order-review-browser-test-aliases",
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
          if (reply.result.exceptionDetails) {
            throw new Error(JSON.stringify({
              text: reply.result.exceptionDetails.text,
              description: reply.result.exceptionDetails.exception?.description,
              expression,
            }));
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
    if (await browser.evaluate(expression)) return;
    await delay(40);
  }
  throw new Error(message);
}

async function click(browser, testID) {
  const found = await browser.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector(testID))});
    if (!element) return false;
    element.click();
    return true;
  })()`);
  assert.equal(found, true, `Expected ${testID} to exist before clicking. ${await browser.evaluate("document.body?.innerText ?? 'no document body'")}`);
  await delay(80);
}

async function applyTextScale(browser, scale) {
  const scaledCount = await browser.evaluate(`(() => {
    const scale = ${scale};
    const textElements = [...document.querySelectorAll("body *")].filter((element) =>
      [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim()),
    );
    for (const element of textElements) {
      const currentSize = Number.parseFloat(getComputedStyle(element).fontSize);
      if (!Number.isFinite(currentSize) || currentSize <= 0) continue;
      const baseSize = Number.parseFloat(element.dataset.paperOrderBaseFontSize) || currentSize;
      element.dataset.paperOrderBaseFontSize = String(baseSize);
      element.style.setProperty("font-size", \`\${baseSize * scale}px\`, "important");
    }
    for (const input of document.querySelectorAll("input, textarea")) {
      const currentSize = Number.parseFloat(getComputedStyle(input).fontSize);
      if (!Number.isFinite(currentSize) || currentSize <= 0) continue;
      const baseSize = Number.parseFloat(input.dataset.paperOrderBaseFontSize) || currentSize;
      input.dataset.paperOrderBaseFontSize = String(baseSize);
      input.style.setProperty("font-size", \`\${baseSize * scale}px\`, "important");
    }
    document.documentElement.dataset.paperOrderTextScale = String(scale);
    return textElements.length;
  })()`);
  assert.ok(scaledCount > 0, "the accessibility text-scale simulation should affect rendered text");
}

async function tapCenter(browser, testID) {
  const result = await browser.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector(testID))});
    if (!element) return { found: false };
    element.scrollIntoView({ block: "center", inline: "center" });
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      found: true,
      width: rect.width,
      height: rect.height,
      inViewport: rect.left >= -1 && rect.right <= window.innerWidth + 1
        && rect.top >= -1 && rect.bottom <= window.innerHeight + 1,
      centerHitsTarget: !!hit && (element === hit || element.contains(hit)),
      focused: element.matches("input, textarea"),
    };
  })()`);
  assert.ok(result?.found, `${testID} should render.`);
  assert.ok(result.inViewport, `${testID} should be scrollable into view at its center.`);
  assert.ok(result.width >= 44 && result.height >= 44,
    `${testID} should retain a usable touch target: ${JSON.stringify(result)}`);
  assert.ok(result.centerHitsTarget, `${testID} should not be covered at its center.`);
  await browser.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector(testID))});
    if (element.matches("input, textarea")) element.focus();
    else element.click();
  })()`);
  if (result.focused) {
    assert.equal(await browser.evaluate("document.activeElement?.getAttribute('data-testid')"),
      testID, `${testID} should accept focus.`);
  }
  await delay(80);
}

async function startBrowser(bundle) {
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
      </head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`);
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const profileDir = await mkdtemp(join(tmpdir(), "paper-order-review-"));
  let chromeStderr = "";
  const chrome = spawn(browserExecutable(), [
    "--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--no-first-run",
    "--no-default-browser-check", "--remote-debugging-port=0",
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
    await browser.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `window.__paperOrderBrowserErrors = [];
        window.addEventListener("error", (event) => window.__paperOrderBrowserErrors.push(event.message));
        window.addEventListener("unhandledrejection", (event) => window.__paperOrderBrowserErrors.push(String(event.reason)));`,
    });
    await browser.send("Emulation.setDeviceMetricsOverride", {
      width: 400, height: 720, deviceScaleFactor: 1, mobile: true,
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    await browser.send("Page.navigate", { url: `http://127.0.0.1:${address.port}/` });
    await waitFor(browser, "document.readyState === 'complete' && !!document.body",
      "The browser did not load the order-entry test page.");
    await waitFor(browser, `!!document.querySelector(${JSON.stringify(selector("paper-order-form"))})`,
      `The order-entry regression fixture did not render. ${await browser.evaluate("JSON.stringify({ errors: window.__paperOrderBrowserErrors, body: document.body?.innerText, root: document.querySelector('#root')?.innerHTML })")}`);
    return { browser, cleanup: async () => {
      browser?.close();
      chrome.kill("SIGTERM");
      await new Promise((resolveExit) => {
        if (chrome.exitCode !== null) return resolveExit();
        chrome.once("exit", resolveExit);
      });
      await Promise.all([
        new Promise((resolveClose) => server.close(resolveClose)),
        rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }),
      ]);
    } };
  } catch (error) {
    browser?.close();
    chrome.kill("SIGTERM");
    await new Promise((resolveClose) => server.close(resolveClose));
    await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    throw error;
  }
}

test("order review discloses freshness, blocks invalid quotes, and requires re-review after price changes", async () => {
  const fixture = await startBrowser(await buildFixture());
  const { browser } = fixture;
  try {
    const text = (testID) => browser.evaluate(
      `document.querySelector(${JSON.stringify(selector(testID))})?.textContent ?? ""`,
    );
    const clickAndWait = async (testID, condition, message) => {
      await click(browser, testID);
      await waitFor(browser, condition, message);
    };

    await clickAndWait("paper-order-quick-shares-1",
      `!!document.querySelector(${JSON.stringify(selector("paper-order-review-button"))})`,
      "The buy form should remain visible.");
    await clickAndWait("paper-order-review-button",
      `!!document.querySelector(${JSON.stringify(selector("paper-order-review"))})`,
      `A fresh valid quote should reach explicit review. ${await browser.evaluate(`JSON.stringify({
        errors: window.__paperOrderBrowserErrors,
        button: document.querySelector(${JSON.stringify(selector("paper-order-review-button"))})?.outerHTML,
        shares: document.querySelector(${JSON.stringify(selector("paper-order-shares"))})?.value,
        validation: document.querySelector(${JSON.stringify(selector("paper-order-validation-error"))})?.textContent
      })`)}`);
    assert.match(await text("paper-order-review"), /QUOTE USED FOR ESTIMATE/);
    assert.match(await text("paper-order-review"), /\$100\.00/);

    await click(browser, "quote-change");
    await click(browser, "paper-order-submit");
    await waitFor(browser, `!!document.querySelector(${JSON.stringify(selector("paper-order-result"))})`,
      "A changed quote should return the order to a rejected result.");
    assert.match(await text("paper-order-result"), /quote changed after review/i);
    assert.equal(await browser.evaluate("window.__orderFills.length"), 0,
      "A changed price must not fill using the old review.");

    await click(browser, "paper-order-result-edit");
    await click(browser, "paper-order-review-button");
    await waitFor(browser, `!!document.querySelector(${JSON.stringify(selector("paper-order-review"))})`,
      "The changed price should be reviewable again after editing.");
    assert.match(await text("paper-order-review"), /\$101\.00/);
    await click(browser, "paper-order-submit");
    await waitFor(browser, `window.__orderFills.length === 1`,
      "The order should fill only after the updated price is reviewed.");
    assert.deepEqual(await browser.evaluate(
      "({ side: window.__orderFills[0].side, accountId: window.__orderFills[0].accountId, quotePrice: window.__orderFills[0].quotePrice })",
    ), { side: "buy", accountId: "alpha", quotePrice: 101 });

    await click(browser, "scenario-sell");
    assert.match(await text("paper-order-side-sell"), /4 available/,
      "A sell must use the selected account's four shares, not the other account's larger position.");
    await click(browser, "paper-order-quick-shares-1");
    await click(browser, "paper-order-review-button");
    await waitFor(browser, `!!document.querySelector(${JSON.stringify(selector("paper-order-review"))})`,
      "A sell order should reach review.");
    assert.match(await text("paper-order-review"), /Alpha account/);
    assert.match(await text("paper-order-review"), /SELL/);
    await click(browser, "paper-order-submit");
    await waitFor(browser, `window.__orderFills.length === 2`, "The long sell should submit.");
    assert.deepEqual(await browser.evaluate("({ side: window.__orderFills[1].side, accountId: window.__orderFills[1].accountId })"),
      { side: "sell", accountId: "alpha" });

    await click(browser, "scenario-short");
    await click(browser, "paper-order-quick-shares-1");
    await click(browser, "paper-order-review-button");
    await waitFor(browser, `!!document.querySelector(${JSON.stringify(selector("paper-order-review"))})`,
      "A short sale should reach review.");
    await click(browser, "paper-order-submit");
    await waitFor(browser, `window.__orderFills.length === 3`, "The short sale should submit.");
    assert.deepEqual(await browser.evaluate("({ side: window.__orderFills[2].side, accountId: window.__orderFills[2].accountId })"),
      { side: "short", accountId: "beta" });

    await click(browser, "scenario-cover");
    await click(browser, "paper-order-quick-shares-1");
    await click(browser, "paper-order-review-button");
    await waitFor(browser, `!!document.querySelector(${JSON.stringify(selector("paper-order-review"))})`,
      "A buy-to-cover should reach review.");
    await click(browser, "paper-order-submit");
    await waitFor(browser, `window.__orderFills.length === 4`, "The buy-to-cover should submit.");
    assert.deepEqual(await browser.evaluate("({ side: window.__orderFills[3].side, accountId: window.__orderFills[3].accountId })"),
      { side: "cover", accountId: "beta" });
  } finally {
    await fixture.cleanup();
  }
});

test("Penny stock and ETF reviews explain the $20 limit and reject a threshold quote on mobile", async () => {
  for (const scenario of [
    { button: "scenario-penny-stock", shouldFill: true, label: "verified stock" },
    { button: "scenario-penny-etf", shouldFill: true, label: "verified ETF" },
    { button: "scenario-penny-at-limit", shouldFill: false, label: "quote at $20" },
  ]) {
    const fixture = await startBrowser(await buildFixture());
    const { browser } = fixture;
    try {
      await browser.send("Emulation.setDeviceMetricsOverride", {
        width: 360, height: 720, deviceScaleFactor: 1, mobile: true,
      });
      const text = (testID) => browser.evaluate(
        `document.querySelector(${JSON.stringify(selector(testID))})?.textContent ?? ""`,
      );

      await click(browser, scenario.button);
      await click(browser, "paper-order-quick-shares-1");
      await click(browser, "paper-order-review-button");
      await waitFor(browser, `!!document.querySelector(${JSON.stringify(selector("paper-order-review"))})`,
        `${scenario.label} should reach review at a 360px mobile viewport.`);
      assert.match(await text("paper-order-review"),
        /both the latest execution quote and final fill must stay below \$20\.00/i);

      await click(browser, "paper-order-submit");
      await waitFor(browser, `!!document.querySelector(${JSON.stringify(selector("paper-order-result"))})`,
        `${scenario.label} should show a submission result.`);
      const resultText = await text("paper-order-result");
      if (scenario.shouldFill) {
        assert.match(resultText, /Order filled/i);
        assert.equal(await browser.evaluate("window.__orderFills.length"), 1,
          `${scenario.label} below $20 should fill.`);
      } else {
        assert.match(resultText, /Order rejected/i);
        assert.match(resultText, /both the latest quote and final fill.*below \$20\.00/i);
        assert.equal(await browser.evaluate("window.__orderFills.length"), 0,
          "A buy at the $20 threshold must not fill.");
      }
    } finally {
      await fixture.cleanup();
    }
  }
});

test("entry keeps short collateral conditional and quote/search content compact", async () => {
  const fixture = await startBrowser(await buildFixture());
  const { browser } = fixture;
  try {
    const text = (testID) => browser.evaluate(
      `document.querySelector(${JSON.stringify(selector(testID))})?.textContent ?? ""`,
    );
    const exists = (testID) => browser.evaluate(
      `!!document.querySelector(${JSON.stringify(selector(testID))})`,
    );

    assert.equal(await exists("paper-short-collateral-settings"), false);
    assert.match(await text("paper-order-account-summary"), /EQUITY/);
    assert.match(await text("paper-order-account-summary"), /SETTLED B\.P\./);
    assert.match(await text("paper-order-account-summary"), /CASH/);
    assert.match(await text("paper-order-quote"), /Acme Corp/);
    assert.match(await text("paper-order-quote"), /ACME · LIVE/);
    assert.match(await text("paper-order-quote"), /\$100\.00/);
    assert.match(await text("paper-order-quote"), /0\.00%/);
    assert.doesNotMatch(await text("paper-order-quote"), /freshness unverified|provider quote is current/i);
    assert.equal(await exists("paper-order-search-stock"), true);

    const searchAccess = await browser.evaluate(`(() => {
      const topBar = document.querySelector(${JSON.stringify(selector("paper-order-top-bar"))});
      const search = topBar?.querySelector(${JSON.stringify(selector("paper-order-search-stock"))});
      const activity = topBar?.querySelector(${JSON.stringify(selector("paper-order-activity-mark"))});
      const close = topBar?.querySelector(${JSON.stringify(selector("paper-order-close"))});
      if (!search || !activity || !close || !topBar) return null;
      const searchBox = search.getBoundingClientRect();
      const activityBox = activity.getBoundingClientRect();
      const closeBox = close.getBoundingClientRect();
      const topBarBox = topBar.getBoundingClientRect();
      return {
        label: search.getAttribute("aria-label"),
        role: search.getAttribute("role"),
        appearsBeforeActivity: search.compareDocumentPosition(activity) & Node.DOCUMENT_POSITION_FOLLOWING,
        gap: activityBox.left - searchBox.right,
        closeAppearsAfterActivity: activity.compareDocumentPosition(close) & Node.DOCUMENT_POSITION_FOLLOWING,
        closeIsRightOfActivity: closeBox.left > activityBox.right,
        closeWidth: closeBox.width,
        closeHeight: closeBox.height,
        topBarTop: topBarBox.top,
      };
    })()`);
    assert.equal(searchAccess?.label, "Search ticker or company");
    assert.equal(searchAccess?.role, "button");
    assert.ok(searchAccess?.appearsBeforeActivity);
    assert.ok(searchAccess.gap >= 0 && searchAccess.gap <= 12,
      "search should sit directly beside the activity icon");
    assert.ok(searchAccess?.closeAppearsAfterActivity);
    assert.ok(searchAccess?.closeIsRightOfActivity,
      "close button should be positioned at the right side of the order header");
    assert.ok(searchAccess.closeWidth >= 44 && searchAccess.closeHeight >= 44,
      "close button should have a comfortable touch target");
    assert.ok(searchAccess.topBarTop >= 66,
      "order header should sit below the web status-bar safe area");

    for (const [scenario, hasSearch] of [
      ["scenario-sell", false],
      ["scenario-short", true],
      ["scenario-cover", false],
      ["scenario-buy", true],
    ]) {
      await click(browser, scenario);
      const isShort = scenario === "scenario-short";
      assert.equal(await exists("paper-short-collateral-settings"), isShort,
        `${scenario} should ${isShort ? "show" : "hide"} short collateral controls`);
      assert.equal(await exists("paper-short-collateral-explanation"), isShort);
      assert.equal(await exists("paper-order-search-stock"), hasSearch,
        `${scenario} should ${hasSearch ? "show" : "hide"} ticker search`);
      assert.match(await text("paper-order-account-summary"), /EQUITY/);
      assert.match(await text("paper-order-account-summary"), /SETTLED B\.P\./);
      assert.match(await text("paper-order-account-summary"), /CASH/);
    }

    await click(browser, "quote-stale");
    assert.doesNotMatch(await text("paper-order-quote"), /freshness unverified/i);
    await click(browser, "paper-order-quick-shares-1");
    await click(browser, "paper-order-review-button");
    await waitFor(browser, `!!document.querySelector(${JSON.stringify(selector("paper-order-review"))})`,
      "A stale quote should still be disclosed in review.");
    assert.match(await text("paper-order-review"), /freshness unverified/i);
  } finally {
    await fixture.cleanup();
  }
});

test("quote refresh and trade-side hierarchy stay clear on narrow layouts", async () => {
  const fixture = await startBrowser(await buildFixture());
  const { browser } = fixture;
  try {
    const text = (testID) => browser.evaluate(
      `document.querySelector(${JSON.stringify(selector(testID))})?.textContent ?? ""`,
    );
    const quoteHeight = await browser.evaluate(
      `document.querySelector(${JSON.stringify(selector("paper-order-quote"))})?.getBoundingClientRect().height ?? 0`,
    );
    assert.ok(quoteHeight <= 100, `the compact quote card should stay short: ${quoteHeight}px`);
    assert.match(await text("paper-order-quote"), /Acme Corp/);
    assert.match(await text("paper-order-quote"), /ACME · LIVE/);
    assert.match(await text("paper-order-quote"), /\$100\.00/);
    assert.match(await text("paper-order-quote"), /0\.00%/);

    await click(browser, "quote-stale");
    const refreshButton = await browser.evaluate(`(() => {
      const button = document.querySelector(${JSON.stringify(selector("paper-order-refresh-quote"))});
      const box = button?.getBoundingClientRect();
      return {
        label: button?.getAttribute("aria-label"),
        role: button?.getAttribute("role"),
        width: box?.width,
        height: box?.height,
        text: button?.textContent?.trim(),
      };
    })()`);
    assert.equal(refreshButton.label, "Refresh provider quote");
    assert.equal(refreshButton.role, "button");
    assert.ok(refreshButton.width >= 40 && refreshButton.width <= 48);
    assert.ok(refreshButton.height >= 40 && refreshButton.height <= 48);
    assert.equal(refreshButton.text, "", "the quote refresh action should be icon-only");

    await click(browser, "paper-order-refresh-quote");
    const refreshing = await browser.evaluate(`(() => {
      const button = document.querySelector(${JSON.stringify(selector("paper-order-refresh-quote"))});
      return {
        label: button?.getAttribute("aria-label"),
        disabled: button?.getAttribute("aria-disabled"),
        hasSpinner: !!button?.querySelector(${JSON.stringify(selector("paper-order-refresh-spinner"))}),
      };
    })()`);
    assert.equal(refreshing.label, "Refreshing provider quote");
    assert.equal(refreshing.hasSpinner, true, "refreshing should show a visible loading indicator");
    assert.ok(refreshing.disabled === "true" || refreshing.disabled === "");
    await waitFor(browser,
      `document.querySelector(${JSON.stringify(selector("paper-order-refresh-quote"))})?.getAttribute("aria-label") === "Refresh provider quote"`,
      "The quote refresh button should return to its idle state.");
    assert.match(await text("paper-order-quote"), /ACME · STALE/);

    await click(browser, "quote-missing");
    assert.match(await text("paper-order-quote"), /ACME · NO QUOTE/);
    assert.equal(await browser.evaluate(
      `!!document.querySelector(${JSON.stringify(selector("paper-order-refresh-quote"))})`,
    ), true, "an unavailable quote should retain its refresh action");

    for (const width of [320, 360]) {
      await browser.send("Emulation.setDeviceMetricsOverride", {
        width, height: 720, deviceScaleFactor: 1, mobile: true,
      });
      await applyTextScale(browser, 1.3);
      for (const [scenario, expectedLabel, expectedDetail] of [
        ["scenario-buy", "BUY", ""],
        ["scenario-sell", "SELL", "4 available"],
        ["scenario-short", "SHORT SELL", "simulated borrow"],
      ]) {
        await click(browser, scenario);
        const side = scenario === "scenario-buy" ? "buy" : scenario === "scenario-sell" ? "sell" : "short";
        const layout = await browser.evaluate(`(() => {
          const button = document.querySelector(${JSON.stringify(selector(`paper-order-side-${side}`))});
          const main = document.querySelector(${JSON.stringify(selector(`paper-order-side-${side}-main`))});
          const label = document.querySelector(${JSON.stringify(selector(`paper-order-side-${side}-label`))});
          const detail = document.querySelector(${JSON.stringify(selector(`paper-order-side-${side}-detail`))});
          const buttonBox = button?.getBoundingClientRect();
          const mainBox = main?.getBoundingClientRect();
          const labelBox = label?.getBoundingClientRect();
          return {
            label: label?.textContent?.trim(),
            detail: detail?.textContent?.trim() ?? "",
            buttonWrap: getComputedStyle(button).flexWrap,
            buttonDirection: getComputedStyle(button).flexDirection,
            mainDirection: getComputedStyle(main).flexDirection,
            mainAlign: getComputedStyle(main).alignItems,
            mainJustify: getComputedStyle(main).justifyContent,
            centerOffset: Math.abs((mainBox.left + mainBox.width / 2) - (buttonBox.left + buttonBox.width / 2)),
            labelInsideButton: labelBox.left >= buttonBox.left - 1 && labelBox.right <= buttonBox.right + 1,
            quoteHeight: document.querySelector(${JSON.stringify(selector("paper-order-quote"))})?.getBoundingClientRect().height,
          };
        })()`);
        assert.equal(layout.label, expectedLabel);
        assert.equal(layout.detail, expectedDetail);
        assert.equal(layout.buttonWrap, "nowrap");
        assert.equal(layout.buttonDirection, "column");
        assert.equal(layout.mainDirection, "column");
        assert.equal(layout.mainAlign, "center");
        assert.equal(layout.mainJustify, "center");
        assert.ok(layout.centerOffset <= 1, `${side} main choice should be centered: ${JSON.stringify(layout)}`);
        assert.equal(layout.labelInsideButton, true, `${side} label should fit at ${width}px with larger text`);
        assert.ok(layout.quoteHeight <= 120, `the quote card should remain compact at ${width}px with larger text`);
        await applyTextScale(browser, 1.3);
      }
      assert.equal(await browser.evaluate("document.documentElement.scrollWidth"), width,
        `the order form should not overflow at ${width}px with larger text`);
    }
  } finally {
    await fixture.cleanup();
  }
});

test("editing a pending order keeps its saved details and review identity", async () => {
  const fixture = await startBrowser(await buildFixture());
  const { browser } = fixture;
  try {
    await click(browser, "scenario-edit-order");
    const initial = await browser.evaluate(`(() => ({
      shares: document.querySelector(${JSON.stringify(selector("paper-order-shares"))})?.value,
      limit: document.querySelector(${JSON.stringify(selector("paper-order-limit-price"))})?.value,
      search: !!document.querySelector(${JSON.stringify(selector("paper-order-search-stock"))}),
      buyDisabled: document.querySelector(${JSON.stringify(selector("paper-order-side-buy"))})?.getAttribute("aria-disabled"),
      sellDisabled: document.querySelector(${JSON.stringify(selector("paper-order-side-sell"))})?.getAttribute("aria-disabled"),
    }))()`);
    assert.equal(initial.shares, "2");
    assert.equal(initial.limit, "95");
    assert.equal(initial.search, false, "ticker search is for new orders, not edits");
    assert.equal(initial.buyDisabled, "true");
    assert.equal(initial.sellDisabled, "true");

    await click(browser, "paper-order-type-stop");
    assert.equal(await browser.evaluate(
      `document.querySelector(${JSON.stringify(selector("paper-order-stop-price"))})?.value`,
    ), "100.00");
    await click(browser, "paper-order-review-button");
    await waitFor(browser, `!!document.querySelector(${JSON.stringify(selector("paper-order-review"))})`,
      "The edited order should still reach review.");
    assert.match(await browser.evaluate(
      `document.querySelector(${JSON.stringify(selector("paper-order-review"))})?.textContent ?? ""`,
    ), /Stop/);
    await click(browser, "paper-order-submit");
    await waitFor(browser, "window.__orderFills.length === 1", "The reviewed edit should submit.");
    assert.deepEqual(await browser.evaluate(
      "(({ orderId, side, orderType, shares, stopPrice }) => ({ orderId, side, orderType, shares, stopPrice }))(window.__orderFills[0])",
    ), {
      orderId: "editable-order",
      side: "buy",
      orderType: "stop",
      shares: 2,
      stopPrice: 100,
    });
  } finally {
    await fixture.cleanup();
  }
});

test("order-entry cards, metrics, side controls, and inputs fit narrow phone widths", async () => {
  const fixture = await startBrowser(await buildFixture());
  const { browser } = fixture;
  try {
    for (const width of [320, 360]) {
      await browser.send("Emulation.setDeviceMetricsOverride", {
        width, height: 720, deviceScaleFactor: 1, mobile: true,
      });
      await delay(100);
      const layout = await browser.evaluate(`(() => {
        const ids = [
          "paper-order-top-bar",
          "paper-order-account-summary",
          "paper-order-account-metrics",
          "paper-order-quote",
          "paper-order-side-buy",
          "paper-order-side-sell",
          "paper-order-side-short",
          "paper-order-shares",
          "paper-order-review-button",
        ];
        const boxes = Object.fromEntries(ids.map((id) => {
          const element = [...document.querySelectorAll("[data-testid]")]
            .find((node) => node.getAttribute("data-testid") === id);
          if (!element) return [id, null];
          const rect = element.getBoundingClientRect();
          return [id, { left: rect.left, right: rect.right, width: rect.width }];
        }));
        const form = document.querySelector(${JSON.stringify(selector("paper-order-form"))});
        const typeScroller = document.querySelector(${JSON.stringify(selector("paper-order-type-scroller"))});
        return {
          viewport: window.innerWidth,
          pageWidth: document.documentElement.scrollWidth,
          boxes,
          typeScroller: typeScroller ? {
            clientWidth: typeScroller.clientWidth,
            scrollWidth: typeScroller.scrollWidth,
          } : null,
          form: form ? { clientWidth: form.clientWidth, scrollWidth: form.scrollWidth } : null,
        };
      })()`);
      assert.equal(layout.pageWidth, width, `page should not overflow at ${width}px`);
      for (const [id, box] of Object.entries(layout.boxes)) {
        assert.ok(box, `${id} should render at ${width}px`);
        assert.ok(box.left >= -1 && box.right <= width + 1,
          `${id} should stay within the ${width}px viewport: ${JSON.stringify(box)}`);
      }
      assert.ok(layout.typeScroller, "order-type chips should retain their horizontal scroller");
      assert.ok(layout.typeScroller.scrollWidth >= layout.typeScroller.clientWidth);
      assert.ok(layout.form.scrollWidth <= layout.form.clientWidth + 1,
        `form should not overflow horizontally at ${width}px`);
    }
  } finally {
    await fixture.cleanup();
  }
});

test("order entry stays readable and tappable at 1.3x text on narrow phones", async () => {
  const fixture = await startBrowser(await buildFixture());
  const { browser } = fixture;
  try {
    const text = (testID) => browser.evaluate(
      `document.querySelector(${JSON.stringify(selector(testID))})?.textContent ?? ""`,
    );
    for (const width of [320, 360]) {
      await browser.send("Emulation.setDeviceMetricsOverride", {
        width, height: 720, deviceScaleFactor: 1, mobile: true,
      });
      await applyTextScale(browser, 1.3);
      await delay(100);

      const initialLayout = await browser.evaluate(`(() => {
        const ids = [
          "paper-order-top-bar",
          "paper-order-account-summary",
          "paper-order-account-metrics",
          "paper-order-quote",
          "paper-order-side-buy",
          "paper-order-side-sell",
          "paper-order-side-short",
          "paper-order-shares",
          "paper-order-review-button",
        ];
        const boxes = Object.fromEntries(ids.map((id) => {
          const element = document.querySelector(\`[data-testid="\${id}"]\`);
          if (!element) return [id, null];
          const rect = element.getBoundingClientRect();
          return [id, { left: rect.left, right: rect.right, width: rect.width, height: rect.height }];
        }));
        const typeScroller = document.querySelector(${JSON.stringify(selector("paper-order-type-scroller"))});
        return {
          viewport: window.innerWidth,
          pageWidth: document.documentElement.scrollWidth,
          boxes,
          typeScroller: typeScroller ? {
            clientWidth: typeScroller.clientWidth,
            scrollWidth: typeScroller.scrollWidth,
            overflowX: getComputedStyle(typeScroller).overflowX,
          } : null,
          textScale: document.documentElement.dataset.paperOrderTextScale,
        };
      })()`);
      assert.equal(initialLayout.textScale, "1.3");
      assert.equal(initialLayout.pageWidth, width, `page should not overflow at ${width}px with larger text`);
      for (const [id, box] of Object.entries(initialLayout.boxes)) {
        assert.ok(box, `${id} should render at ${width}px with larger text`);
        assert.ok(box.left >= -1 && box.right <= width + 1,
          `${id} should stay within the ${width}px viewport: ${JSON.stringify(box)}`);
      }

      for (const detailID of [
        "paper-order-account-summary",
        "paper-order-account-metrics",
        "paper-order-quote",
      ]) {
        const inViewport = await browser.evaluate(`(() => {
          const element = document.querySelector(${JSON.stringify(selector(detailID))});
          element.scrollIntoView({ block: "center" });
          const rect = element.getBoundingClientRect();
          return rect.left >= -1 && rect.right <= window.innerWidth + 1
            && rect.top >= -1 && rect.bottom <= window.innerHeight + 1;
        })()`);
        assert.equal(inViewport, true, `${detailID} should remain reachable at ${width}px.`);
      }
      assert.match(await text("paper-order-account-metrics"), /EQUITY.*SETTLED B\.P\..*CASH/s);
      assert.match(await text("paper-order-quote"), /ACME · LIVE/);
      assert.match(await text("paper-order-quote"), /\$100\.00/);

      for (const side of ["buy", "sell", "short"]) {
        await tapCenter(browser, `paper-order-side-${side}`);
        await applyTextScale(browser, 1.3);
      }
      await tapCenter(browser, "paper-order-side-buy");
      await applyTextScale(browser, 1.3);
      await click(browser, "scenario-cover");
      await applyTextScale(browser, 1.3);
      await tapCenter(browser, "paper-order-side-cover");
      await applyTextScale(browser, 1.3);
      await click(browser, "scenario-buy");
      await applyTextScale(browser, 1.3);
      await tapCenter(browser, "paper-order-side-buy");
      await applyTextScale(browser, 1.3);
      await tapCenter(browser, "paper-order-shares");
      await applyTextScale(browser, 1.3);

      const scroller = await browser.evaluate(`(() => {
        const element = document.querySelector(${JSON.stringify(selector("paper-order-type-scroller"))});
        return {
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          overflowX: getComputedStyle(element).overflowX,
        };
      })()`);
      assert.ok(scroller.scrollWidth > scroller.clientWidth,
        "order-type choices should remain in their intentionally scrollable row");
      assert.ok(["auto", "scroll"].includes(scroller.overflowX),
        `order-type choices should retain horizontal scrolling: ${JSON.stringify(scroller)}`);
      for (const [orderType, inputs] of [
        ["limit", ["paper-order-limit-price"]],
        ["stop", ["paper-order-stop-price"]],
        ["stop_limit", ["paper-order-limit-price", "paper-order-stop-price"]],
        ["trailing_stop", ["paper-order-trail-amount"]],
      ]) {
        await tapCenter(browser, `paper-order-type-${orderType}`);
        await applyTextScale(browser, 1.3);
        for (const input of inputs) {
          await tapCenter(browser, input);
          await applyTextScale(browser, 1.3);
        }
      }
      await tapCenter(browser, "paper-order-type-market");
      await applyTextScale(browser, 1.3);

      await click(browser, "paper-order-quick-shares-1");
      await applyTextScale(browser, 1.3);
      await tapCenter(browser, "paper-order-review-button");
      await waitFor(browser, `!!document.querySelector(${JSON.stringify(selector("paper-order-review"))})`,
        `Review should open at ${width}px with larger text.`);
      await applyTextScale(browser, 1.3);
      await tapCenter(browser, "paper-order-submit");
      await waitFor(browser, `!!document.querySelector(${JSON.stringify(selector("paper-order-result"))})`,
        `The reviewed order should submit at ${width}px with larger text.`);
      await applyTextScale(browser, 1.3);
      assert.match(await text("paper-order-result"), /Order filled/i);
      await tapCenter(browser, "paper-order-result-close");
      await applyTextScale(browser, 1.3);
      if (width !== 360) {
        await click(browser, "scenario-sell");
        await click(browser, "scenario-buy");
        await applyTextScale(browser, 1.3);
      }
    }
  } finally {
    await fixture.cleanup();
  }
});

test("stale quotes are reviewable with disclosure, but missing and invalid prices are blocked", async () => {
  const fixture = await startBrowser(await buildFixture());
  const { browser } = fixture;
  try {
    const text = (testID) => browser.evaluate(
      `document.querySelector(${JSON.stringify(selector(testID))})?.textContent ?? ""`,
    );
    await click(browser, "quote-stale");
    await click(browser, "paper-order-quick-shares-1");
    await click(browser, "paper-order-review-button");
    await waitFor(browser, `!!document.querySelector(${JSON.stringify(selector("paper-order-review"))})`,
      `A stale but valid quote should reach explicit review. ${await browser.evaluate(`JSON.stringify({
        errors: window.__paperOrderBrowserErrors,
        button: document.querySelector(${JSON.stringify(selector("paper-order-review-button"))})?.outerHTML,
        shares: document.querySelector(${JSON.stringify(selector("paper-order-shares"))})?.value,
        validation: document.querySelector(${JSON.stringify(selector("paper-order-validation-error"))})?.textContent
      })`)}`);
    assert.match(await text("paper-order-review"), /STALE · LAST AVAILABLE PRICE/);
    assert.match(await text("paper-order-review"), /freshness unverified/i);

    await click(browser, "paper-order-review-back");
    for (const mode of ["quote-missing", "quote-invalid"]) {
      await click(browser, mode);
      const disabled = await browser.evaluate(`(() => {
        const button = document.querySelector(${JSON.stringify(selector("paper-order-review-button"))});
        return button?.getAttribute("aria-disabled") === "true" || button?.hasAttribute("disabled");
      })()`);
      assert.equal(disabled, true, `${mode} must disable review.`);
      await click(browser, "paper-order-review-button");
      assert.equal(
        await browser.evaluate(`!!document.querySelector(${JSON.stringify(selector("paper-order-review"))})`),
        false,
        `${mode} must not open review.`,
      );
      assert.equal(await browser.evaluate("window.__orderFills.length"), 0,
        `${mode} must not submit or fill.`);
    }
  } finally {
    await fixture.cleanup();
  }
});

test("closed-market market orders remain pending at open after the stale quote changes", async () => {
  const fixture = await startBrowser(await buildFixture());
  const { browser } = fixture;
  try {
    const text = (testID) => browser.evaluate(
      `document.querySelector(${JSON.stringify(selector(testID))})?.textContent ?? ""`,
    );
    await click(browser, "quote-closed");
    await click(browser, "paper-order-quick-shares-1");
    await click(browser, "paper-order-review-button");
    await waitFor(browser, `!!document.querySelector(${JSON.stringify(selector("paper-order-review"))})`,
      "A closed-market market order should reach review.");
    assert.match(await text("paper-order-market-open-note"), /pending until a fresh regular-session quote arrives after the next open/i);

    await click(browser, "quote-closed-move");
    await click(browser, "paper-order-submit");
    await waitFor(browser, `!!document.querySelector(${JSON.stringify(selector("paper-order-result"))})`,
      "A closed-market market order should be accepted into the pending queue.");
    const result = await text("paper-order-result");
    assert.match(result, /Pending market open/i);
    assert.match(result, /next regular market open/i);
    assert.equal(await browser.evaluate("window.__orderAttempts.length"), 1);
    assert.equal(await browser.evaluate("window.__orderFills.length"), 0,
      "A queued market order must not fill against the closed-market quote.");
  } finally {
    await fixture.cleanup();
  }
});

test("the paper screen keeps quote-change and account-position guards in the live submit path", async () => {
  const screen = await readFile(join(mobileDir, "app/(tabs)/paper.tsx"), "utf8");
  const orderEntry = await readFile(join(mobileDir, "components/ProfessionalOrderEntry.tsx"), "utf8");
  assert.match(screen, /getMarketOrderQuoteError\(currentQuote, args\.quotePrice, marketClosed\)/);
  assert.match(screen, /if \(getOrderQuoteState\(currentQuote\) !== 'fresh' && !marketClosed\)/);
  assert.match(screen, /canEvaluatePendingOrderQuote\(order, q\)/);
  assert.match(screen, /const accountPositions = currentPositions\.filter\(\(position\) => position\.accountId === accountId\)/);
  assert.match(orderEntry, /accountId: account\.id/);
});
