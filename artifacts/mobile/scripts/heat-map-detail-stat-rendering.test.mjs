import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const modalPath = fileURLToPath(new URL('../components/HeatMapDetailModal.tsx', import.meta.url));
const modalSource = readFileSync(modalPath, 'utf8');
const commodityDriversPath = fileURLToPath(new URL('../components/CommodityPriceDrivers.tsx', import.meta.url));
const commodityDriversSource = readFileSync(commodityDriversPath, 'utf8');
const analysisPath = fileURLToPath(new URL('../app/analysis/[symbol].tsx', import.meta.url));
const analysisSource = readFileSync(analysisPath, 'utf8');
const chartPath = fileURLToPath(new URL('../app/heat-map-chart.tsx', import.meta.url));
const chartSource = readFileSync(chartPath, 'utf8');

test('market detail modal builds and renders the selected asset-specific statistic rows', () => {
  assert.match(
    modalSource,
    /getHeatMapDetailStatRows\(\s*quote\?\.assetType \?\? 'commodity',\s*stats,/,
  );
  assert.match(modalSource, /displayedStats\.map\(\(item\) => \(/);
  assert.match(modalSource, /\{item\.label\}/);
  assert.match(modalSource, /\{item\.value\}/);
  assert.match(modalSource, /\{item\.detail\}/);
  assert.match(modalSource, /<EtfAdditionalDetails/);
  assert.match(modalSource, /profile\.topHoldings\.map/);
  assert.match(modalSource, /regime\.periods\[/);
  assert.match(modalSource, /Historical only—not a forecast/);
});

test('commodity detail modal renders instrument-specific up and down price drivers', () => {
  assert.match(modalSource, /const isCommodity = quote\?\.assetType === 'commodity' \|\| unavailableCommodity !== null/);
  assert.match(modalSource, /getCommodityContractSpec\(symbol\)/);
  assert.match(modalSource, /getCommodityContractNotional\(quote\.symbol,\s*quote\.price\)/);
  assert.match(modalSource, /heat-map-commodity-contract-spec/);
  assert.match(modalSource, /heat-map-commodity-quote-unit/);
  assert.match(modalSource, /heat-map-commodity-contract-size/);
  assert.match(modalSource, /heat-map-commodity-contract-notional/);
  assert.match(modalSource, /EST\. FULL-CONTRACT NOTIONAL/);
  assert.match(modalSource, /not the margin or cash required to trade/);
  assert.match(modalSource, /<CommodityPriceDrivers symbol=\{symbol \?\? ''\}/);
  assert.match(modalSource, /Commodity snapshot/);
  assert.match(commodityDriversSource, /Can push prices higher/);
  assert.match(commodityDriversSource, /Can push prices lower/);
  assert.match(commodityDriversSource, /not predictions/);
  assert.match(commodityDriversSource, /loadCommodityPriceDrivers\(symbol,\s*controller\.signal\)/);
  assert.match(commodityDriversSource, /DRIVER_REQUEST_TIMEOUT_MS/);
  assert.match(commodityDriversSource, /heat-map-commodity-driver-retry/);
  assert.match(modalSource, /<CommodityPriceDrivers symbol=\{symbol \?\? ''\} visible=\{visible\}/);
});

test('commodity quote views hide unavailable or stale prices and label continuous history and quote units', () => {
  assert.match(modalSource, /shouldShowHeatMapQuotePrice\(quote\.assetType,\s*quoteUnavailable\)/);
  assert.match(modalSource, /No fresh commodity quote is available/);
  assert.match(analysisSource, /isDisplayableHeatMapQuote\(\{[\s\S]*assetType: 'commodity'/);
  assert.match(analysisSource, /Quote unavailable or stale/);
  assert.match(analysisSource, /formatCommodityQuotePrice\(symbol,\s*analysis\.currentPrice\)/);
  assert.match(chartSource, /Continuous-futures history, not one tradable contract/);
  assert.match(chartSource, /formatCommodityQuotePrice\(symbol,\s*candles\[/);
  assert.match(chartSource, /Last bar .*formatHeatMapQuoteAge/);
  assert.match(analysisSource, /Article contents are not independently verified and are not used by the commodity score or AI commentary/);
});

test('crypto detail keeps daily provider supply history distinct from its current supply share', () => {
  assert.match(modalSource, /const isCrypto = quote\?\.assetType === 'cryptocurrency'/);
  assert.match(modalSource, /\{isCrypto && \(\s*<CryptoSupplyHistory/s);
  assert.match(modalSource, /useGetCryptoSupplyHistory\(symbol,\s*rangeDays,\s*\{\s*query:\s*\{[^}]*enabled:\s*visible/s);
  assert.match(modalSource, /HEAT_MAP_CRYPTO_SUPPLY_RANGES\.map/);
  assert.match(modalSource, /heat-map-crypto-supply-range-\$\{days\}/);
  assert.match(modalSource, /Past month.*Past 3 months.*Past year/s);
  assert.match(modalSource, /This daily on-chain metric can differ from the live circulating-supply figure above; it is not the maximum-supply share/);
  assert.match(modalSource, /heat-map-crypto-supply-unavailable/);
  assert.match(modalSource, /heat-map-crypto-supply-chart/);
});
