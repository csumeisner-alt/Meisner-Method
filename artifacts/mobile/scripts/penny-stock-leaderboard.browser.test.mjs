import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "esbuild";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const mobileDir = resolve(scriptDir, "..");
const fixtureDir = join(scriptDir, "penny-stock-leaderboard-browser");
const require = createRequire(import.meta.url);
const reactNativeWebEntry = require.resolve("react-native-web", { paths: [mobileDir] });
const selector = (testID) => `[data-testid=${JSON.stringify(testID)}]`;
const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));

function browserExecutable() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  if (existsSync("/repl/tools/bin/chromium")) return "/repl/tools/bin/chromium";
  return "chromium";
}

async function buildFixture() {
  const aliases = new Map([
    ["@expo/vector-icons", join(fixtureDir, "mocks/vector-icons.tsx")],
    ["@react-native-async-storage/async-storage", join(fixtureDir, "mocks/async-storage.ts")],
    ["@workspace/api-client-react", join(fixtureDir, "mocks/api-client-react.ts")],
    ["react-native-keyboard-controller", join(fixtureDir, "mocks/keyboard-controller.tsx")],
    ["react-native-safe-area-context", join(fixtureDir, "mocks/safe-area-context.ts")],
    ["react-native-view-shot", join(fixtureDir, "mocks/view-shot.tsx")],
    ["expo-linear-gradient", join(fixtureDir, "mocks/linear-gradient.tsx")],
    ["@/hooks/useColors", join(fixtureDir, "mocks/use-colors.ts")],
    ["@/hooks/useReduceMotion", join(fixtureDir, "mocks/use-reduce-motion.ts")],
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
    define: { "process.env.EXPO_PUBLIC_DOMAIN": JSON.stringify("fixture.invalid") },
    loader: { ".jpg": "dataurl", ".png": "dataurl" },
    mainFields: ["browser", "module", "main"],
    resolveExtensions: [".web.tsx", ".web.ts", ".web.jsx", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    conditions: ["browser"],
    plugins: [{
      name: "penny-stock-leaderboard-browser-fixture",
      setup(buildApi) {
        buildApi.onResolve({ filter: /^react-native$/ }, () => ({ path: reactNativeWebEntry }));
        buildApi.onResolve({ filter: /^@\// }, ({ path }) => {
          const alias = aliases.get(path);
          if (alias) return { path: alias };
          const sourcePath = resolve(mobileDir, path.slice(2));
          if (existsSync(sourcePath)) return { path: sourcePath };
          const extension = [".web.tsx", ".web.ts", ".tsx", ".ts", ".jsx", ".js"]
            .find((candidate) => existsSync(`${sourcePath}${candidate}`));
          return extension
            ? { path: `${sourcePath}${extension}` }
            : { errors: [{ text: `Unable to resolve ${path}.` }] };
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
          if (reply.result.exceptionDetails) {
            throw new Error(reply.result.exceptionDetails.exception?.description ?? reply.result.exceptionDetails.text);
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
      if (!pending) return;
      waiting.delete(message.id);
      if (message.error) pending.rejectMessage(new Error(message.error.message));
      else pending.resolveMessage(message);
    });
  });
}

async function startBrowser(bundle) {
  const interBold = await readFile(require.resolve("@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf", { paths: [mobileDir] }));
  const server = createServer((request, response) => {
    if (request.url === "/inter-bold.ttf") {
      response.writeHead(200, { "content-type": "font/ttf" });
      response.end(interBold);
      return;
    }
    if (request.url === "/bundle.js") {
      response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      response.end(bundle);
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(`<!doctype html><html><head>
      <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
      <style>
        @font-face{font-family:Inter_700Bold;src:url('/inter-bold.ttf') format('truetype');font-weight:700;font-display:block}
        html,body,#root{width:100%;height:100%;margin:0;padding:0;overflow:hidden}
      </style>
      </head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`);
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const profileDir = await mkdtemp(join(tmpdir(), "penny-stock-leaderboard-"));
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
    const portFile = join(profileDir, "DevToolsActivePort");
    let debugPort;
    for (let attempt = 0; attempt < 150; attempt += 1) {
      try {
        [debugPort] = (await readFile(portFile, "utf8")).trim().split("\n");
        break;
      } catch {
        if (chrome.exitCode !== null) throw new Error(`Chromium exited before opening its debugging port.\n${chromeStderr}`);
        await wait(40);
      }
    }
    assert.ok(debugPort, `Chromium did not open a debugging port.\n${chromeStderr}`);
    const targets = await fetch(`http://127.0.0.1:${debugPort}/json`).then((result) => result.json());
    const page = targets.find((target) => target.type === "page");
    assert.ok(page?.webSocketDebuggerUrl, "Chromium must expose a page target.");
    browser = await connectDebugger(page.webSocketDebuggerUrl);
    await browser.send("Page.enable");
    await browser.send("Runtime.enable");
    await browser.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `window.__fixtureErrors = [];
        window.addEventListener("error", (event) => window.__fixtureErrors.push(event.message));
        window.addEventListener("unhandledrejection", (event) => window.__fixtureErrors.push(String(event.reason)));`,
    });
    await browser.send("Emulation.setDeviceMetricsOverride", {
      width: 320, height: 760, deviceScaleFactor: 1, mobile: true,
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    await browser.send("Page.navigate", { url: `http://127.0.0.1:${address.port}/` });
    const started = Date.now();
    while (Date.now() - started < 8000) {
      const ready = await browser.evaluate(
        `!!document.querySelector(${JSON.stringify(selector("paper-event-penny-stock-hero"))})`,
      );
      if (ready) break;
      await wait(40);
    }
    const rendered = await browser.evaluate(
      `!!document.querySelector(${JSON.stringify(selector("paper-event-penny-stock-hero"))})`,
    );
    assert.equal(rendered, true,
      `The real Penny Stock leaderboard should render from fixture data. ${await browser.evaluate("JSON.stringify({errors:window.__fixtureErrors,body:document.body?.innerText,root:document.querySelector('#root')?.innerHTML?.slice(0,2000)})")}`);
    await browser.evaluate("document.fonts.ready.then(() => true)");
    return {
      browser,
      cleanup: async () => {
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
      },
    };
  } catch (error) {
    browser?.close();
    chrome.kill("SIGTERM");
    await new Promise((resolveClose) => server.close(resolveClose));
    await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    throw error;
  }
}

test("Penny Stock leaderboard artwork, countdown, and podium fit narrow and standard phones", async () => {
  const fixture = await startBrowser(await buildFixture());
  const { browser } = fixture;
  try {
    for (const width of [320, 375, 390]) {
      await browser.send("Emulation.setDeviceMetricsOverride", {
        width, height: 760, deviceScaleFactor: 1, mobile: true,
      });
      await wait(100);
      const layout = await browser.evaluate(`(() => {
        const get = (id) => document.querySelector(${JSON.stringify("[data-testid=")} + JSON.stringify(id) + ${JSON.stringify("]")});
        const box = (element) => {
          if (!element) return null;
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
        };
        const title = get("paper-event-championship-identity");
        const hero = get("paper-event-penny-stock-hero");
        const banner = get("paper-event-penny-stock-rule-banner");
        const artwork = get("paper-event-penny-stock-art");
        const countdown = get("paper-event-leaderboard-countdown");
        const podium = get("paper-event-leaderboard-podium");
        const card = get("event-arena-leaderboard-artwork-fixture-penny-stock-mayhem");
        const image = artwork?.querySelector("img");
        const imageLayer = artwork?.querySelector("div[style*='background-image']");
          const imageBox = box(artwork);
          const hasFloatingMark = !!hero?.querySelector("img[src*='mm-mark-foreground']");
        const labels = [...(podium?.querySelectorAll("[data-testid^='paper-event-podium-']") ?? [])];
        const textFits = (element) => {
          if (!element) return false;
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && rect.left >= -1 && rect.right <= window.innerWidth + 1;
        };
        return {
          viewport: window.innerWidth,
          titleText: title?.textContent?.trim(),
          bannerText: banner?.textContent?.replace(/\\s+/g, " ").trim(),
          imageLabel: image?.getAttribute("aria-label") || artwork?.getAttribute("aria-label"),
          imageLoaded: !!image && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0,
          imageBoxRatio: imageBox?.width && imageBox?.height ? imageBox.width / imageBox.height : null,
          hasFloatingMark,
          imageFit: imageLayer ? getComputedStyle(imageLayer).backgroundSize : null,
          eventName: get("paper-event-penny-stock-hero")?.getAttribute("aria-label"),
          countdownText: countdown?.textContent?.replace(/\\s+/g, " ").trim(),
          podiumHeading: podium?.textContent?.includes("The podium") ?? false,
          podiumNames: labels.map((item) => item.textContent?.replace(/\\s+/g, " ").trim()),
          bounds: {
            hero: box(hero), title: box(title), banner: box(banner), artwork: box(artwork),
            countdown: box(countdown), podium: box(podium), card: box(card),
          },
          textFits: [title, banner, countdown, podium, ...labels].map(textFits),
          titleGlyphsFit: [...(title?.querySelectorAll("svg text") ?? [])].every(textFits),
          bannerGlyphsFit: [...(banner?.querySelectorAll("svg text") ?? [])].every(textFits),
          scrollWidth: document.documentElement.scrollWidth,
        };
      })()`);
      assert.equal(layout.viewport, width);
      assert.equal(layout.titleText, "PENNY STOCK");
      assert.match(layout.bannerText, /STOCKS\s*&\s*ETFs UNDER\s*\$20/);
      assert.equal(layout.imageLabel, "Charging bull with copper pennies in a green championship arena");
      assert.equal(layout.imageLoaded, true, `The Penny Stock artwork must load at ${width}px.`);
      assert.ok(Math.abs(layout.imageBoxRatio - 1) < 0.05, "The full square artwork should remain visible without cropping.");
      assert.equal(layout.hasFloatingMark, false, "The Penny Stock title should not have a floating Meisner mark above it.");
      assert.equal(layout.imageFit, "contain", "The bull and pennies must retain their full artwork bounds.");
      assert.equal(layout.titleGlyphsFit, true, "The visible title lettering must fit, not just its wrapper.");
      assert.equal(layout.bannerGlyphsFit, true, "The visible rule wording and $20 must not clip.");
      assert.match(layout.countdownText, /TIME REMAINING/);
      assert.equal(layout.podiumHeading, true);
      assert.equal(layout.podiumNames.length, 3, "All three fixture competitors must appear on the podium.");
      assert.deepEqual(layout.textFits, [true, true, true, true, true, true, true],
        `Hero labels and all podium cards must fit at ${width}px: ${JSON.stringify(layout)}`);
      assert.equal(layout.scrollWidth, width, `The page must not scroll sideways at ${width}px.`);
      for (const part of ["title", "banner", "artwork", "countdown", "podium"]) {
        assert.ok(layout.bounds[part].width > 0 && layout.bounds[part].height > 0,
          `${part} must render with visible dimensions at ${width}px.`);
        assert.ok(layout.bounds[part].left >= layout.bounds.card.left - 1
          && layout.bounds[part].right <= layout.bounds.card.right + 1,
        `${part} must stay inside the Penny Stock artwork card at ${width}px.`);
      }
      assert.ok(layout.bounds.title.bottom <= layout.bounds.banner.top + 1);
      assert.ok(layout.bounds.banner.bottom <= layout.bounds.artwork.top + 1);
      assert.ok(layout.bounds.artwork.bottom <= layout.bounds.countdown.top + 1);
      assert.ok(layout.bounds.countdown.bottom <= layout.bounds.podium.top + 1);
      if (process.env.PENNY_SCREENSHOT_DIR) {
        const capture = await browser.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
        await writeFile(join(process.env.PENNY_SCREENSHOT_DIR, `penny-mobile-${width}.png`), Buffer.from(capture.result.data, "base64"));
      }
    }
    const errors = await browser.evaluate("window.__fixtureErrors");
    assert.deepEqual(errors, [], "The visual fixture must render without browser errors.");
  } finally {
    await fixture.cleanup();
  }
});
