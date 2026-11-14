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
const fixtureDir = join(scriptDir, "paper-account-swipe-browser");
const require = createRequire(import.meta.url);
const reactNativeWebEntry = require.resolve("react-native-web", { paths: [mobileDir] });
const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
const selector = (testID) => `[data-testid=${JSON.stringify(testID)}]`;
let nextTouchId = 1;

function browserExecutable() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  if (existsSync("/repl/tools/bin/chromium")) return "/repl/tools/bin/chromium";
  return "chromium";
}

async function buildFixture() {
  const aliases = new Map([
    ["expo-haptics", join(fixtureDir, "mocks/expo-haptics.ts")],
    ["expo-router", join(fixtureDir, "mocks/expo-router.ts")],
    ["react-native-safe-area-context", join(fixtureDir, "mocks/safe-area-context.tsx")],
    ["@expo/vector-icons", join(fixtureDir, "mocks/vector-icons.tsx")],
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
      name: "paper-account-browser-test-aliases",
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
  throw new Error(message);
}

async function touchPath(browser, testID, moves) {
  const point = await browser.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector(testID))});
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  assert.ok(point, `Expected ${testID} to be visible for touch input.`);
  const touchId = nextTouchId++;
  await browser.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ id: touchId, x: point.x, y: point.y, radiusX: 4, radiusY: 4, force: 1 }],
  });
  if (moves.length > 0) {
    await delay(35);
    for (const { dx, dy } of moves) {
      await browser.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{
          id: touchId,
          x: point.x + dx,
          y: point.y + dy,
          radiusX: 4,
          radiusY: 4,
          force: 1,
        }],
      });
      await delay(25);
    }
    await delay(35);
  }
  await browser.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await delay(50);
}

async function touch(browser, testID, dx = 0, dy = 0) {
  return touchPath(browser, testID, dx !== 0 || dy !== 0
    ? [0.35, 0.7, 1].map((fraction) => ({ dx: dx * fraction, dy: dy * fraction }))
    : []);
}

test("paper account swipes and screen controls work at a phone-sized touch viewport", async () => {
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
      </head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`);
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });

  const profileDir = await mkdtemp(join(tmpdir(), "paper-account-browser-"));
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
    await waitFor(browser, `!!document.querySelector(${JSON.stringify(selector("paper-account-hero"))})`,
      "The account swipe interaction fixture did not render.");

    const currentAccount = () => browser.evaluate(
      `document.querySelector(${JSON.stringify(selector("paper-current-account"))})?.textContent`,
    );
    const hapticCount = () => browser.evaluate("window.__paperHapticCount ?? 0");
    assert.equal(await currentAccount(), "tiger");
    assert.equal(await hapticCount(), 0);

    await touch(browser, "paper-account-switch");
    assert.equal(await currentAccount(), "tiger", "Opening the selector must not change the active account.");
    assert.equal(await hapticCount(), 0, "Opening the selector must not trigger a haptic.");
    await touch(browser, "select-paper-account-borg");
    assert.equal(await currentAccount(), "borg", "Selecting an account from the list must change the active account.");
    assert.equal(await hapticCount(), 0, "Selecting from the list must not trigger swipe feedback.");

    await touch(browser, "paper-current-account", -150, 0);
    assert.equal(await hapticCount(), 1, "A left swipe that changes accounts triggers one haptic.");
    assert.equal(await currentAccount(), "fireball", "One left swipe should advance exactly one account.");
    await touch(browser, "paper-current-account", -150, 0);
    assert.equal(await currentAccount(), "fireball", "A left swipe at the last account should stop at the boundary.");
    assert.equal(await hapticCount(), 1, "A boundary swipe must remain silent.");
    await touch(browser, "paper-current-account", -150, 0);
    assert.equal(await currentAccount(), "fireball", "A left swipe at the last account should stop at the boundary.");
    assert.equal(await hapticCount(), 1, "Repeated boundary swipes must remain silent.");
    await touch(browser, "paper-current-account", 150, 0);
    assert.equal(await currentAccount(), "borg", "One right swipe should move back one account.");
    assert.equal(await hapticCount(), 2);
    await touch(browser, "paper-current-account", 150, 0);
    assert.equal(await currentAccount(), "tiger", "A second right swipe should return to the first account.");
    assert.equal(await hapticCount(), 3);
    await touch(browser, "paper-current-account", 150, 0);
    assert.equal(await currentAccount(), "tiger", "A right swipe at the first account should stop at the boundary.");
    assert.equal(await hapticCount(), 3, "The opposite boundary swipe must remain silent.");

    await touch(browser, "paper-current-account", 25, 0);
    assert.equal(await currentAccount(), "tiger", "A short horizontal gesture must not switch accounts.");
    assert.equal(await hapticCount(), 3, "A short gesture must remain silent.");
    await touch(browser, "paper-current-account", 8, -120);
    assert.equal(await currentAccount(), "tiger", "Vertical movement over the account summary must not switch accounts.");
    assert.equal(await hapticCount(), 3, "A vertical gesture must remain silent.");
    await touchPath(browser, "paper-current-account", [{ dx: 20, dy: 0 }, { dx: 60, dy: 120 }]);
    assert.equal(await currentAccount(), "tiger", "A gesture that ends vertically must not switch accounts.");
    assert.equal(await hapticCount(), 3, "A gesture ending vertically must remain silent.");

    await touch(browser, "paper-account-switch");
    assert.equal(await currentAccount(), "tiger", "Reopening the selector must leave the active account unchanged.");
    await touch(browser, "select-paper-account-tiger");
    assert.equal(await hapticCount(), 3, "Selecting the already-active account must remain silent.");

    await browser.evaluate("window.__setPaperPlatform('web')");
    await touch(browser, "paper-current-account", -150, 0);
    assert.equal(await currentAccount(), "borg", "Account swipes should still work on platforms without vibration.");
    assert.equal(await hapticCount(), 3, "The platform fallback must keep unsupported vibration silent.");
    await touch(browser, "paper-trading-buy-action");
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("paper-trade-count"))})?.textContent`),
      "1",
      "The Trade action must remain tappable.",
    );
    await touch(browser, "bottom-tab-event-arena");
    assert.equal(
      await browser.evaluate("window.__paperNavigation"),
      "/event-arena",
      "Bottom navigation must remain tappable.",
    );

    await touch(browser, "paper-content", 0, -220);
    assert.equal(
      await browser.evaluate(`document.querySelector(${JSON.stringify(selector("paper-content"))})?.scrollTop > 0`),
      true,
      "Vertical scrolling in the paper content must remain available.",
    );
    assert.equal(await currentAccount(), "borg", "Scrolling the paper content must not change the active account.");
  } finally {
    browser?.close();
    chrome.kill("SIGTERM");
    await new Promise((resolveExit) => {
      if (chrome.exitCode !== null) return resolveExit();
      chrome.once("exit", resolveExit);
    });
    await Promise.all([
      new Promise((resolveClose) => server.close(resolveClose)),
      rm(profileDir, { recursive: true, force: true }),
    ]);
  }
});
