import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { build } from "esbuild";
import { requestBrewConfirmation } from "../lib/brewConfirmation.ts";
import {
  BREW_ECONOMY_SNAPSHOT_KEY,
  createBrewEconomySnapshot,
} from "../lib/brewTokenPersistence.ts";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const mobileDir = resolve(scriptDir, "..");
const bankSource = readFileSync(
  resolve(scriptDir, "../components/BrewTokenBank.tsx"),
  "utf8",
);
const require = createRequire(import.meta.url);
const reactNativeWebEntry = require.resolve("react-native-web", { paths: [mobileDir] });
const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

test("tapping each unlocked bottle opens its preview and plays the animation without buying or redeeming", () => {
  assert.match(
    bankSource,
    /const openBottleInspection = \(kind: BottleBurstKind, unlocked: boolean\) => \{\s*setBottlePreview\(kind\);\s*if \(unlocked\) triggerBottleBurst\(kind, 'preview'\);\s*\};/,
  );

  for (const [kind, unlockedState] of [
    ["quickRevive", "quickReviveUnlocked"],
    ["daiquiri", "daiquiriUnlocked"],
    ["staminUp", "staminUpUnlocked"],
    ["smartPro", "smartProUnlocked"],
  ]) {
    assert.match(
      bankSource,
      new RegExp(`onPress=\\{\\(\\) => openBottleInspection\\('${kind}', ${unlockedState}\\)\\}`),
    );
  }

  const inspectionHandler = bankSource.match(
    /const openBottleInspection = \(kind: BottleBurstKind, unlocked: boolean\) => \{[\s\S]*?\n  \};/,
  )?.[0];
  assert.ok(inspectionHandler);
  assert.doesNotMatch(inspectionHandler, /onBuy|onRedeem/);
});

test("SmartPro redemption plays one random supplied clip only after success", async () => {
  const clips = bankSource.match(/const SMARTPRO_VOICE_CLIPS:[\s\S]*?\n\];/)?.[0];
  assert.ok(clips);
  const clipPaths = [...clips.matchAll(/smartpro-voice\/(smartpro-0[1-7]\.m4a)/g)]
    .map((match) => match[1]);
  assert.equal(clipPaths.length, 7);
  assert.equal(new Set(clipPaths).size, 7);
  for (const clipPath of clipPaths) {
    assert.ok(existsSync(resolve(mobileDir, "assets/smartpro-voice", clipPath)));
  }

  const handler = bankSource.match(
    /const handleRedeemSmartPro = async \(\) => \{[\s\S]*?\n  \};/,
  )?.[0];
  assert.ok(handler);
  assert.match(handler, /if \(!redeemed\.ok\)[\s\S]*?return;/);
  assert.match(handler, /triggerBottleBurst\('smartPro', 'vault'\);[\s\S]*?void playSmartProVoice\(\);/);
  assert.match(bankSource, /SMARTPRO_VOICE_CLIPS\[Math\.floor\(Math\.random\(\) \* SMARTPRO_VOICE_CLIPS\.length\)\]/);
});

test("web confirmation invokes a Brew Bank purchase only after confirmation", () => {
  let economy = { tokens: 40, recipes: 0, keys: 0 };
  let prompt = "";

  requestBrewConfirmation(
    "web",
    "UNLOCK QUICK REVIVE?",
    "Spend 40 Brew Tokens to unlock this recipe?",
    () => {
      economy = { tokens: economy.tokens - 40, recipes: economy.recipes + 1, keys: economy.keys };
    },
    (message) => {
      prompt = message;
      return true;
    },
    () => assert.fail("Web confirmation must not use the native alert"),
  );

  assert.equal(prompt, "UNLOCK QUICK REVIVE?\n\nSpend 40 Brew Tokens to unlock this recipe?");
  assert.deepEqual(economy, { tokens: 0, recipes: 1, keys: 0 });
});

test("cancelling a web confirmation leaves the Brew Bank economy unchanged", () => {
  const economy = { tokens: 5, recipes: 0, keys: 0 };
  let purchaseCalls = 0;

  requestBrewConfirmation(
    "web",
    "BUY CENTRAL BANK KEY?",
    "Spend 5 Brew Tokens for one weekday access key?",
    () => {
      purchaseCalls += 1;
      economy.tokens -= 5;
      economy.keys += 1;
    },
    () => false,
    () => assert.fail("Web confirmation must not use the native alert"),
  );

  assert.equal(purchaseCalls, 0);
  assert.deepEqual(economy, { tokens: 5, recipes: 0, keys: 0 });
});

test("native confirmation still defers the purchase until its confirm action runs", () => {
  let nativeAction;
  let purchaseCalls = 0;

  requestBrewConfirmation(
    "native",
    "BUY CENTRAL BANK KEY?",
    "Spend 5 Brew Tokens for one weekday access key?",
    () => {
      purchaseCalls += 1;
    },
    () => assert.fail("Native confirmation must not use the browser prompt"),
    (title, message, onConfirm) => {
      assert.equal(title, "BUY CENTRAL BANK KEY?");
      assert.equal(message, "Spend 5 Brew Tokens for one weekday access key?");
      nativeAction = onConfirm;
    },
  );

  assert.equal(purchaseCalls, 0);
  nativeAction();
  assert.equal(purchaseCalls, 1);
});

test("Brew Bank key and recipe unlock handlers keep their existing purchases behind confirmation", () => {
  const keyHandler = bankSource.match(/const handleBuyKey = async \(confirmed = false\) => \{[\s\S]*?\n  \};/)?.[0];
  assert.ok(keyHandler);
  assert.match(keyHandler, /confirmExpensiveAction\(/);
  assert.match(keyHandler, /runShopAction\(onBuyBankKey\)/);

  for (const handlerName of [
    "handleUnlockQuickRevive",
    "handleUnlockDaiquiri",
    "handleUnlockStaminUp",
    "handleUnlockSmartPro",
    "handleUnlockNeonGucciPhrases",
  ]) {
    const handler = bankSource.match(
      new RegExp(`const ${handlerName} = async \\(confirmed = false\\) => \\{[\\s\\S]*?\\n  \\};`),
    )?.[0];
    assert.ok(handler, `${handlerName} exists`);
    assert.match(handler, /confirmExpensiveAction\(/, `${handlerName} requests confirmation`);
    assert.match(handler, /runShopAction\(onUnlock/, `${handlerName} uses its existing purchase callback`);
  }

  assert.match(bankSource, /Alert\.alert\(nativeTitle, nativeMessage/);
  assert.match(bankSource, /window\.confirm\(confirmationMessage\)/);
});

function browserExecutable() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  if (existsSync("/repl/tools/bin/chromium")) return "/repl/tools/bin/chromium";
  return "chromium";
}

async function buildBrewBankBundle() {
  const stubs = new Map([
    ["@react-native-async-storage/async-storage", `
      const storage = {
        async getItem(key) { return window.localStorage.getItem(key); },
        async setItem(key, value) { window.localStorage.setItem(key, value); },
        async removeItem(key) { window.localStorage.removeItem(key); },
      };
      export default storage;
    `],
    ["@expo/vector-icons", `
      import React from "react";
      import { Text } from "react-native";
      export const Feather = ({ name, ...props }) => React.createElement(Text, props, name);
    `],
    ["expo-constants", `export default { appOwnership: "standalone", statusBarHeight: 0 };`],
    ["expo-haptics", `
      export const ImpactFeedbackStyle = { Medium: "medium" };
      export const NotificationFeedbackType = { Success: "success", Warning: "warning" };
      export const impactAsync = async () => {};
      export const notificationAsync = async () => {};
    `],
    ["expo-speech", `export const speak = () => {}; export const stop = () => {};`],
    ["expo-linear-gradient", `
      import React from "react";
      import { View } from "react-native";
      export const LinearGradient = (props) => React.createElement(View, props);
    `],
    ["expo-audio", `export const createAudioPlayer = (source) => ({ play() { window.__brewAudioPlayedSources.push(source); }, remove() {} }); export const setAudioModeAsync = async () => {};`],
    ["react-native-safe-area-context", `export const useSafeAreaInsets = () => ({ top: 0, right: 0, bottom: 0, left: 0 });`],
    ["react-native-svg", `
      import React from "react";
      import { View } from "react-native";
      export const Svg = (props) => React.createElement(View, props);
      export default Svg;
      export const Circle = View, ClipPath = View, Defs = View, G = View, LinearGradient = View;
      export const Line = View, Path = View, Stop = View, Image = View, Text = View;
    `],
    ["react-native-reanimated", `
      import React from "react";
      import { View } from "react-native";
      const Animated = { View, Text: View };
      export default Animated;
      export const Easing = { cubic: (value) => value, out: (value) => value, in: (value) => value, inOut: (value) => value };
      export const cancelAnimation = () => {};
      export const interpolate = (value, input, output) => output?.[0] ?? value;
      export const useAnimatedStyle = (factory) => factory();
      export const useSharedValue = (value) => ({ value });
      export const withSequence = (...values) => values.at(-1);
      export const withSpring = (value) => value;
      export const withTiming = (value) => value;
    `],
  ]);

  const result = await build({
    entryPoints: [resolve(scriptDir, "brew-bank-browser/entry.tsx")],
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
      name: "brew-bank-browser-test-aliases",
      setup(buildApi) {
        buildApi.onResolve({ filter: /^react-native$/ }, () => ({ path: reactNativeWebEntry }));
        buildApi.onResolve({ filter: /^@\// }, ({ path }) => {
          const sourcePath = resolve(mobileDir, path.slice(2));
          if (existsSync(sourcePath)) return { path: sourcePath };
          const extension = [".tsx", ".ts", ".jsx", ".js"]
            .find((candidate) => existsSync(`${sourcePath}${candidate}`));
          return extension ? { path: `${sourcePath}${extension}` } : { errors: [{ text: `Unable to resolve ${path}.` }] };
        });
        buildApi.onResolve({ filter: /.*/ }, ({ path }) => {
          if (stubs.has(path)) return { path, namespace: "brew-bank-stub" };
          if (/\.(m4a|wav)$/.test(path)) return { path, namespace: "brew-bank-audio" };
          return null;
        });
        buildApi.onLoad({ filter: /.*/, namespace: "brew-bank-stub" }, ({ path }) => ({
          contents: stubs.get(path),
          loader: "tsx",
          resolveDir: mobileDir,
        }));
        buildApi.onLoad({ filter: /.*/, namespace: "brew-bank-audio" }, ({ path }) => ({
          contents: `module.exports = ${JSON.stringify(path)};`,
          loader: "js",
        }));
      },
    }],
  });
  return result.outputFiles[0].text;
}

async function waitForDebuggerPort(profileDir, chrome, stderr) {
  const portFile = resolve(profileDir, "DevToolsActivePort");
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
      close() { socket.close(); },
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
    if (await evaluate(expression)) return;
    await delay(40);
  }
  const diagnostics = await evaluate(`JSON.stringify({
    href: location.href,
    ready: document.readyState,
    html: document.documentElement?.outerHTML?.slice(0, 500),
    body: document.body?.innerText?.slice(0, 1200),
    errors: window.__brewErrors ?? [],
  })`);
  throw new Error(`${message} ${diagnostics ?? ""}`);
}

test("Brew Bank browser purchases update and persist the rendered economy only after confirmation", async () => {
  const bundle = await buildBrewBankBundle();
  const initialSnapshot = createBrewEconomySnapshot({
    quotesViewed: 100,
    isUnlocked: true,
    brewTokens: 100,
    bankKeys: 0,
    bankAccessExpiresAt: null,
    quickReviveUnlocked: false,
    quickReviveBottles: 0,
    quickReviveArmed: false,
    daiquiriUnlocked: false,
    daiquiriBottles: 0,
    daiquiriArmed: false,
    staminUpUnlocked: false,
    staminUpBottles: 0,
    staminUpArmed: false,
    smartProUnlocked: true,
    smartProBottles: 1,
    smartProSaleExpiresAt: null,
    darkBrewTokens: 0,
    claimedQuoteViewIds: [],
  });
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>
    <div id="root"></div>
    <script>
      localStorage.setItem(${JSON.stringify(BREW_ECONOMY_SNAPSHOT_KEY)}, ${JSON.stringify(JSON.stringify(initialSnapshot))});
      window.__brewAudioPlayedSources = [];
      window.__brewErrors = [];
      window.addEventListener("error", (event) => window.__brewErrors.push(String(event.error ?? event.message)));
      window.addEventListener("unhandledrejection", (event) => window.__brewErrors.push(String(event.reason)));
      window.__brewConfirmationResponses = [false, true, false, true];
      window.__brewConfirmationMessages = [];
      window.confirm = (message) => {
        window.__brewConfirmationMessages.push(message);
        return window.__brewConfirmationResponses.shift() ?? false;
      };
    </script>
    <script src="/bundle.js"></script>
  </body></html>`;
  const server = createServer((request, response) => {
    if (request.url === "/bundle.js") {
      response.writeHead(200, { "content-type": "text/javascript" });
      response.end(bundle);
      return;
    }
    response.writeHead(200, { "content-type": "text/html" });
    response.end(html);
  });
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });

  const profileDir = await mkdtemp(resolve(tmpdir(), "brew-bank-browser-"));
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
    const address = server.address();
    assert.ok(address && typeof address === "object");
    await browser.send("Page.navigate", { url: `http://127.0.0.1:${address.port}/` });
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector('[data-testid="brew-bank-open"]')`,
      "The Brew Bank browser fixture did not mount.",
    );
    await browser.evaluate(`document.querySelector('[data-testid="brew-bank-open"]').click()`);
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector('[data-testid="brew-bank-shop-toggle"]') || document.body.innerText.includes('BREW TOKEN RESERVE')`,
      "The Brew Bank did not open.",
    );
    await browser.evaluate(`document.querySelector('[aria-label="Open Central Bank shop and inventory"]').click()`);
    await waitFor(
      (expression) => browser.evaluate(expression),
      `!!document.querySelector('[aria-label="Unlock Quick Revive for 40 Brew Tokens"]')`,
      "The recipe shop did not render.",
    );

    const readEconomy = () => browser.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(BREW_ECONOMY_SNAPSHOT_KEY)}))`);
    const initialRenderedBalance = await browser.evaluate(`document.body.innerText.includes('100')`);
    assert.equal(initialRenderedBalance, true, "The rendered Brew Bank should show its persisted starting balance.");

    await browser.evaluate(`document.querySelector('[aria-label="Unlock Quick Revive for 40 Brew Tokens"]').click()`);
    let confirmations = await browser.evaluate(`window.__brewConfirmationMessages.slice()`);
    assert.match(confirmations[0], /UNLOCK QUICK REVIVE\?/);
    assert.deepEqual(await readEconomy(), initialSnapshot, "Cancelling the recipe unlock must not change persisted economy.");
    assert.equal(await browser.evaluate(`document.body.innerText.includes('100') && document.body.innerText.includes('LOCKED')`), true,
      "Cancelling the recipe unlock must leave the displayed balance and inventory unchanged.");

    await browser.evaluate(`document.querySelector('[aria-label="Unlock Quick Revive for 40 Brew Tokens"]').click()`);
    await waitFor(
      (expression) => browser.evaluate(expression),
      `JSON.parse(localStorage.getItem(${JSON.stringify(BREW_ECONOMY_SNAPSHOT_KEY)}))?.quickReviveUnlocked === true`,
      "Confirming the recipe unlock did not persist its inventory state.",
    );
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.body.innerText.includes('QUICK REVIVE UNLOCKED')`,
      "The recipe unlock result message did not appear.",
    );
    assert.equal(await browser.evaluate(`document.body.innerText.includes('60')`), true,
      "Confirming the recipe unlock should update the displayed token balance.");
    assert.equal(
      await browser.evaluate(`!!document.querySelector('[aria-label="Buy one Quick Revive bottle for 2 Brew Tokens"]')`),
      true,
      "Confirming the recipe unlock should replace the locked state with its inventory purchase control.",
    );
    let snapshot = await readEconomy();
    assert.equal(snapshot.brewTokens, 60);
    assert.equal(snapshot.quickReviveUnlocked, true);

    await waitFor(
      (expression) => browser.evaluate(expression),
      `(() => {
        const button = document.querySelector('[aria-label="Buy a bank access key for 5 Brew Tokens"]');
        return button && !button.disabled && button.getAttribute('aria-disabled') !== 'true';
      })()`,
      "The Bank key purchase did not become available after the recipe unlock.",
    );
    await browser.evaluate(`document.querySelector('[aria-label="Buy a bank access key for 5 Brew Tokens"]').click()`);
    confirmations = await browser.evaluate(`window.__brewConfirmationMessages.slice()`);
    assert.match(confirmations.at(-1), /BUY CENTRAL BANK KEY\?/);
    snapshot = await readEconomy();
    assert.equal(snapshot.brewTokens, 60, "Cancelling the key purchase must preserve the persisted balance.");
    assert.equal(snapshot.bankKeys, 0, "Cancelling the key purchase must preserve the inventory.");
    assert.equal(await browser.evaluate(`document.body.innerText.includes('60') && document.body.innerText.includes('0 KEYS')`), true,
      "Cancelling the key purchase must leave the displayed balance and inventory unchanged.");

    await browser.evaluate(`document.querySelector('[aria-label="Buy a bank access key for 5 Brew Tokens"]').click()`);
    await waitFor(
      (expression) => browser.evaluate(expression),
      `JSON.parse(localStorage.getItem(${JSON.stringify(BREW_ECONOMY_SNAPSHOT_KEY)}))?.bankKeys === 1`,
      "Confirming the key purchase did not persist its inventory state.",
    );
    await waitFor(
      (expression) => browser.evaluate(expression),
      `document.body.innerText.includes('KEY ADDED TO INVENTORY')`,
      "The bank key purchase result message did not appear.",
    );
    assert.equal(await browser.evaluate(`document.body.innerText.includes('55')`), true,
      "Confirming the key purchase should update the displayed token balance.");
    assert.equal(await browser.evaluate(`document.body.innerText.includes('1 KEY')`), true,
      "Confirming the key purchase should update the displayed key inventory.");
    snapshot = await readEconomy();
    assert.equal(snapshot.brewTokens, 55);
    assert.equal(snapshot.bankKeys, 1);

    await waitFor(
      (expression) => browser.evaluate(expression),
      `(() => {
        const button = document.querySelector('[aria-label^="Redeem a SmartPro Soda"]');
        return button && !button.disabled;
      })()`,
      "The stocked SmartPro bottle did not become available for redemption.",
    );
    await browser.evaluate(`document.querySelector('[aria-label^="Redeem a SmartPro Soda"]').click()`);
    await waitFor(
      (expression) => browser.evaluate(expression),
      `JSON.parse(localStorage.getItem(${JSON.stringify(BREW_ECONOMY_SNAPSHOT_KEY)}))?.smartProBottles === 0`,
      "Redeeming SmartPro did not consume exactly one bottle.",
    );
    await waitFor(
      (expression) => browser.evaluate(expression),
      `window.__brewAudioPlayedSources.length === 1`,
      "A successful SmartPro redemption did not play a bundled audio clip.",
    );
    const playedSources = await browser.evaluate(`window.__brewAudioPlayedSources.slice()`);
    assert.equal(playedSources.length, 1);
    assert.match(playedSources[0], /smartpro-voice\/smartpro-0[1-7]\.m4a$/);
  } finally {
    browser?.close();
    chrome.kill("SIGTERM");
    await new Promise((resolveExit) => {
      if (chrome.exitCode !== null) return resolveExit();
      const forceKill = setTimeout(() => chrome.kill("SIGKILL"), 1000);
      chrome.once("exit", () => {
        clearTimeout(forceKill);
        resolveExit();
      });
    });
    await new Promise((resolveClose) => server.close(resolveClose));
    await rm(profileDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
