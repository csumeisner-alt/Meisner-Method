import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  getHeatMapCryptoLogoCode,
  HEAT_MAP_CRYPTO_LOGO_CODES,
} from "../heatMapCryptoLogo.ts";

const testDir = dirname(fileURLToPath(import.meta.url));
const supportedInstrumentCatalog = JSON.parse(readFileSync(
  resolve(testDir, "../heatmap-instruments/catalog.json"),
  "utf8",
));
const screenSource = readFileSync(resolve(testDir, "../../app/heat-map.tsx"), "utf8");
const logoComponentSource = readFileSync(
  resolve(testDir, "../../components/HeatMapCryptoLogo.tsx"),
  "utf8",
);

test("every supported cryptocurrency resolves to a locally bundled logo", () => {
  const symbols = supportedInstrumentCatalog.cryptocurrency.map(
    (instrument: { symbol: string }) => instrument.symbol,
  );
  assert.equal(symbols.length, HEAT_MAP_CRYPTO_LOGO_CODES.length);

  for (const symbol of symbols) {
    const code = getHeatMapCryptoLogoCode(symbol);
    assert.ok(code, `${symbol} should have a logo mapping`);
    assert.ok(
      existsSync(resolve(testDir, `../../assets/crypto-logos/${code.toLowerCase()}.png`)),
      `${symbol} should resolve to a bundled PNG`,
    );
  }
});

test("cryptocurrency tiles in either category view or a custom map render mapped logos", () => {
  assert.match(
    screenSource,
    /quote\.assetType === 'cryptocurrency'\s*\?\s*getHeatMapCryptoLogoCode\(quote\.symbol\)\s*:\s*null/,
  );
  assert.match(screenSource, /<HeatMapCryptoLogo[\s\S]*?code=\{cryptoLogoCode\}/);
  assert.match(screenSource, /testID=\{`heat-map-crypto-symbol-\$\{quote\.symbol\}`\}/);
  assert.match(logoComponentSource, /Image[\s\S]*?source=\{CRYPTO_LOGO_ASSETS\[code\]\}/);
  assert.doesNotMatch(logoComponentSource, /SvgUri|fetch\(/);
});

test("unsupported or non-USD symbols use the safe no-logo fallback", () => {
  assert.equal(getHeatMapCryptoLogoCode("NEW-USD"), null);
  assert.equal(getHeatMapCryptoLogoCode("BTC-EUR"), null);
  assert.equal(getHeatMapCryptoLogoCode(""), null);
});
