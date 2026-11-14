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

test("the paper screen keeps quote-change and account-position guards in the live submit path", async () => {
  const screen = await readFile(join(mobileDir, "app/paper.tsx"), "utf8");
  const orderEntry = await readFile(join(mobileDir, "components/ProfessionalOrderEntry.tsx"), "utf8");
  assert.match(screen, /getMarketOrderQuoteError\(currentQuote, args\.quotePrice\)/);
  assert.match(screen, /const accountPositions = currentPositions\.filter\(\(position\) => position\.accountId === accountId\)/);
  assert.match(orderEntry, /accountId: account\.id/);
});
