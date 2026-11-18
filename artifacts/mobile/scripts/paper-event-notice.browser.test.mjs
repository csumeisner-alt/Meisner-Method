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
const fixtureDir = join(scriptDir, "paper-event-notice-browser");
const require = createRequire(import.meta.url);
const reactNativeWebEntry = require.resolve("react-native-web", { paths: [mobileDir] });
const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
const selector = (testID) => `[data-testid=${JSON.stringify(testID)}]`;
const noticeStorageKey = (accountId, eventId) =>
  `@stocksense/paper_event_live_notice_dismissal_v1:${encodeURIComponent(accountId)}:${encodeURIComponent(eventId)}`;

function browserExecutable() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  if (existsSync("/repl/tools/bin/chromium")) return "/repl/tools/bin/chromium";
  return "chromium";
}

async function buildFixture() {
  const aliases = new Map([
    ["@expo/vector-icons", join(fixtureDir, "mocks/vector-icons.tsx")],
    ["@react-native-async-storage/async-storage", join(fixtureDir, "mocks/async-storage.ts")],
    ["@/hooks/useColors", join(fixtureDir, "mocks/use-colors.ts")],
    ["@/hooks/useReduceMotion", join(fixtureDir, "mocks/use-reduce-motion.ts")],
  ]);
  const result = await build({
    entryPoints: [join(fixtureDir, "entry.tsx")],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2022",
    jsx: "automatic",
    define: { global: "globalThis" },
    mainFields: ["browser", "module", "main"],
    conditions: ["browser"],
    plugins: [{
      name: "paper-event-notice-browser-test-aliases",
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
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = waiting.get(message.id);
      if (!pending) return;
      waiting.delete(message.id);
      if (message.error) pending.rejectMessage(new Error(message.error.message));
      else pending.resolveMessage(message);
    });
    socket.addEventListener("error", rejectConnection);
  });
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

async function waitFor(browser, expression, message, timeout = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await browser.evaluate(expression)) return;
    await delay(40);
  }
  throw new Error(`${message}\n${await browser.evaluate("document.body?.innerText ?? ''")}`);
}

async function clickTestID(browser, testID) {
  const clicked = await browser.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector(testID))});
    if (!element) return false;
    element.click();
    return true;
  })()`);
  assert.equal(clicked, true, `Expected ${testID} to be rendered and clickable.`);
}

test("One-Stock and Event Arena notice dismissal survives reload and stays account/event scoped", async () => {
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
      <style>html,body,#root{width:100%;height:100%;margin:0;padding:0;overflow:auto}</style>
      </head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`);
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });

  const profileDir = await mkdtemp(join(tmpdir(), "paper-event-notice-"));
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
    await browser.send("Emulation.setDeviceMetricsOverride", {
      width: 402,
      height: 874,
      deviceScaleFactor: 1,
      mobile: true,
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Paper notice test server did not open a TCP port.");
    const url = `http://127.0.0.1:${address.port}/`;
    await browser.send("Page.navigate", { url });
    await waitFor(browser,
      `!!document.querySelector(${JSON.stringify(selector("dismiss-paper-event-live-banner"))})`,
      "The One-Stock notice and accessible close button did not appear.");
    assert.equal(await browser.evaluate(
      `document.body.innerText.includes("THE ONE-STOCK CHALLENGE IS LIVE")`),
    true, "The One-Stock reminder should be shown before dismissal.");

    const closeButton = await browser.evaluate(`(() => {
      const button = document.querySelector('[aria-label="Dismiss Event Arena live notice"]');
      return button ? { role: button.getAttribute("role"), label: button.getAttribute("aria-label") } : null;
    })()`);
    assert.deepEqual(closeButton, { role: "button", label: "Dismiss Event Arena live notice" });
    const clickedAccessibleClose = await browser.evaluate(`(() => {
      const button = document.querySelector('[aria-label="Dismiss Event Arena live notice"]');
      if (!button) return false;
      button.click();
      return true;
    })()`);
    assert.equal(clickedAccessibleClose, true, "The accessible close button should be clickable.");
    await waitFor(browser,
      `localStorage.getItem(${JSON.stringify(`__async_storage__:${noticeStorageKey("paper-event:account-a", "2026-11-16")}`)}) === "dismissed"`,
      "Pressing the close button did not persist the dismissal.");
    await waitFor(browser,
      `!document.querySelector(${JSON.stringify(selector("paper-event-live-banner"))})`,
      "The notice did not close after its accessible close button was pressed.");

    await browser.send("Page.reload", { ignoreCache: true });
    await waitFor(browser,
      `!!document.querySelector(${JSON.stringify(selector("paper-event-notice-fixture-ready"))})`,
      "The notice fixture did not restart.");
    const keyAfterRestart = noticeStorageKey("paper-event:account-a", "2026-11-16");
    await waitFor(browser,
      `window.__paperEventNoticeStorageReads?.includes(${JSON.stringify(keyAfterRestart)})`,
      "The restarted app did not reload the saved dismissal for the same account and event.");
    assert.equal(await browser.evaluate(
      `!!document.querySelector(${JSON.stringify(selector("paper-event-live-banner"))})`),
    false, "The dismissed notice should remain hidden after a full page reload.");

    await clickTestID(browser, "select-event-2");
    await waitFor(browser,
      `!!document.querySelector(${JSON.stringify(selector("paper-event-live-banner"))})`,
      "Changing the event should show its separate notice.");
    await clickTestID(browser, "select-account-b");
    await waitFor(browser,
      `window.__paperEventNoticeStorageReads?.includes(${JSON.stringify(noticeStorageKey("paper-event:account-b", "2026-11-23"))})`,
      "Switching accounts should load the selected account's dismissal state.");
    assert.ok(await browser.evaluate(
      `!!document.querySelector(${JSON.stringify(selector("paper-event-live-banner"))})`),
      "The new account and event should show their own notice.");

    await clickTestID(browser, "select-account-a");
    await clickTestID(browser, "select-event-1");
    await waitFor(browser,
      `window.__paperEventNoticeStorageReads?.filter(key => key === ${JSON.stringify(keyAfterRestart)}).length >= 2`,
      "Returning to the original account and event should reload its dismissal.");
    assert.equal(await browser.evaluate(
      `!!document.querySelector(${JSON.stringify(selector("paper-event-live-banner"))})`),
    false, "The original account and event should still have its notice dismissed.");

    await clickTestID(browser, "select-account-b");
    await waitFor(browser,
      `!!document.querySelector(${JSON.stringify(selector("paper-event-live-banner"))})`,
      "Switching to a different account for the original event should show its notice.");
  } finally {
    browser?.close();
    chrome.kill("SIGTERM");
    await new Promise((resolveExit) => {
      if (chrome.exitCode !== null) resolveExit();
      else chrome.once("exit", resolveExit);
    });
    await new Promise((resolveClose) => server.close(resolveClose));
    await rm(profileDir, { recursive: true, force: true });
  }
});
