import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "esbuild";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const mobileDir = resolve(scriptDir, "..");
const fixtureDir = join(scriptDir, "analyze-header-browser");
const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
const selector = (id) => `[data-testid="${id}"]`;

function browserExecutable() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  if (existsSync("/repl/tools/bin/chromium")) return "/repl/tools/bin/chromium";
  return "chromium";
}

async function buildHeaderBundle() {
  const aliases = new Map([
    ["react-native", join(fixtureDir, "mocks/react-native.tsx")],
    ["react-native-reanimated", join(fixtureDir, "mocks/reanimated.ts")],
    ["expo-linear-gradient", join(fixtureDir, "mocks/linear-gradient.tsx")],
    ["@/components/MMLogo", join(fixtureDir, "mocks/mm-logo.tsx")],
  ]);
  const result = await build({
    entryPoints: [join(fixtureDir, "entry.tsx")],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2022",
    jsx: "automatic",
    loader: { ".jpg": "dataurl", ".png": "dataurl" },
    mainFields: ["browser", "module", "main"],
    conditions: ["browser"],
    plugins: [{
      name: "analyze-header-browser-test-aliases",
      setup(buildApi) {
        buildApi.onResolve({ filter: /^react-native$/ }, () => ({ path: aliases.get("react-native") }));
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
      const pending = waiting.get(message.id);
      if (message.id === undefined || !pending) return;
      waiting.delete(message.id);
      if (message.error) pending.rejectMessage(new Error(message.error.message));
      else pending.resolveMessage(message);
    });
  });
}

async function waitFor(browser, expression, message) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await browser.evaluate(expression)) return;
    await delay(50);
  }
  throw new Error(message);
}

test("selected title flags stay inline with the full-size title at narrow widths", async () => {
  const bundle = await buildHeaderBundle();
  const source = await readFile(join(mobileDir, "components/AnalyzeBrandHeader.tsx"), "utf8");
  assert.match(source, /minHeight: titleRowHeight/);
  assert.match(source, /<TitleFlagBadge[\s\S]*?testID="analyze-title-flag"/);
  const titleText = source.match(/<Text[\s\S]*?testID="analyze-brand-title"[\s\S]*?<\/Text>/)?.[0] ?? "";
  assert.ok(titleText, "the Analyze brand title renders");
  assert.doesNotMatch(titleText, /adjustsFontSizeToFit|minimumFontScale/,
    "the title does not shrink to make room for a selected flag");
  let bundleRequested = false;
  const server = createServer((request, response) => {
    if (request.url === "/bundle.js") {
      bundleRequested = true;
      response.writeHead(200, { "content-type": "text/javascript" });
      response.end(bundle);
      return;
    }
    response.writeHead(200, { "content-type": "text/html" });
    response.end(`<!doctype html>
      <html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
      <style>html,body,#root{margin:0;width:100%;min-height:100%;font-family:Arial,sans-serif}</style></head>
      <body><div id="root"></div><script src="/bundle.js"></script></body></html>`);
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));

  const profileDir = await mkdtemp(join(tmpdir(), "analyze-header-browser-"));
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

    for (const width of [320, 390]) {
      await browser.send("Emulation.setDeviceMetricsOverride", {
        width,
        height: 700,
        deviceScaleFactor: 1,
        mobile: true,
      });
      if (!bundleRequested) {
        const address = server.address();
        assert.ok(address && typeof address === "object");
        await browser.send("Page.navigate", { url: `http://127.0.0.1:${address.port}/` });
        await waitFor(browser, `!!document.querySelector(${JSON.stringify(selector("analyze-brand-title-row"))})`,
          "The Analyze brand header did not render.");
      } else {
        await waitFor(browser, `window.innerWidth === ${width}`,
          `The browser did not resize to ${width}px.`);
      }

      for (const flag of ["default", "heritage", "pride"]) {
        for (const fontScale of [1]) {
          await browser.evaluate(`window.__setAnalyzeHeaderFlag(${JSON.stringify(flag)})`);
          await browser.evaluate(`window.__setAnalyzeHeaderFontScale(${fontScale})`);
          await waitFor(browser, `document.querySelector(${JSON.stringify(selector("analyze-title-flag"))})?.getBoundingClientRect().width > 0`,
            `The ${flag} flag did not render at ${width}px and ${fontScale}x text.`);
          await delay(30);
          const geometry = await browser.evaluate(`(() => {
            const bounds = (id) => {
              const node = document.querySelector('[data-testid="' + id + '"]');
              if (!node) return null;
              const rect = node.getBoundingClientRect();
              return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
            };
            const flagNode = document.querySelector(${JSON.stringify(selector("analyze-title-flag"))});
            return {
              viewport: window.innerWidth,
              title: bounds("analyze-brand-title"),
              titleText: document.querySelector('[data-testid="analyze-brand-title"]')?.textContent,
              titleFontSize: getComputedStyle(document.querySelector('[data-testid="analyze-brand-title"]')).fontSize,
              logo: bounds("analyze-brand-logo"),
              titleRow: bounds("analyze-brand-title-row"),
              flag: bounds("analyze-title-flag"),
              tagline: bounds("analyze-brand-tagline"),
              flagName: flagNode?.getAttribute("aria-label")
                ?? flagNode?.querySelector("[aria-label]")?.getAttribute("aria-label")
                ?? flagNode?.textContent,
              taglineText: document.querySelector(${JSON.stringify(selector("analyze-brand-tagline"))})?.textContent,
            };
          })()`);
          const label = `${flag} flag at ${width}px and ${fontScale}x text`;
          assert.equal(geometry.viewport, width, `${label}: viewport width`);
          assert.ok(geometry.title && geometry.logo && geometry.titleRow && geometry.flag && geometry.tagline, `${label}: all header elements render`);
          assert.equal(geometry.titleText, "Meisner Method", `${label}: the title stays complete`);
          assert.equal(geometry.titleFontSize, "21px", `${label}: the title stays at its fixed size`);
          assert.ok(Math.abs(geometry.logo.height - 36) < 0.5, `${label}: the M logo stays 36px tall`);
          assert.ok(Math.abs(geometry.flag.width - 57.6) < 0.5, `${label}: flag width preserves the 8:5 flag ratio`);
          assert.ok(Math.abs(geometry.flag.height - geometry.logo.height) < 0.5,
            `${label}: flag height exactly matches the M logo`);
          assert.ok(Math.abs(geometry.flag.top - geometry.logo.top) < 0.5,
            `${label}: flag top aligns with the M logo and never sits above it`);
          assert.ok(geometry.title.right <= geometry.flag.left + 1, `${label}: flag does not cover the brand title`);
          assert.ok(geometry.titleRow.height >= geometry.flag.height - 1, `${label}: title row is tall enough for the flag`);
          assert.ok(geometry.flag.top >= geometry.titleRow.top - 0.5, `${label}: flag stays within the title row`);
          assert.ok(geometry.flag.bottom <= geometry.titleRow.bottom + 1, `${label}: flag stays within the title row`);
          assert.ok(geometry.titleRow.bottom <= geometry.tagline.top, `${label}: tagline remains below the title and flag`);
          assert.ok(geometry.tagline.height > 0, `${label}: tagline remains visible`);
          assert.equal(geometry.taglineText, "AI-powered market intelligence", `${label}: tagline stays in its original row`);
          if (flag === "heritage") assert.match(geometry.flagName ?? "", /Gadsden premium flag/);
          if (flag === "pride") assert.match(geometry.flagName ?? "", /Pride premium flag/);
        }
      }
    }
  } finally {
    browser?.close();
    chrome.kill("SIGTERM");
    await new Promise((resolveExit) => chrome.once("exit", resolveExit));
    await new Promise((resolveClose) => server.close(resolveClose));
    await rm(profileDir, { recursive: true, force: true });
  }
});
