import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const modalPath = fileURLToPath(new URL('../components/HeatMapDetailModal.tsx', import.meta.url));
const modalSource = readFileSync(modalPath, 'utf8');
const commodityDriversPath = fileURLToPath(new URL('../components/CommodityPriceDrivers.tsx', import.meta.url));
const commodityDriversSource = readFileSync(commodityDriversPath, 'utf8');

test('market detail modal builds and renders the selected asset-specific statistic rows', () => {
  assert.match(
    modalSource,
    /getHeatMapDetailStatRows\(\s*quote\.assetType,\s*stats,/,
  );
  assert.match(modalSource, /displayedStats\.map\(\(item\) => \(/);
  assert.match(modalSource, /\{item\.label\}/);
  assert.match(modalSource, /\{item\.value\}/);
  assert.match(modalSource, /<EtfAdditionalDetails/);
  assert.match(modalSource, /profile\.topHoldings\.map/);
  assert.match(modalSource, /regime\.periods\[/);
  assert.match(modalSource, /Historical only—not a forecast/);
});

test('commodity detail modal renders instrument-specific up and down price drivers', () => {
  assert.match(modalSource, /const isCommodity = quote\.assetType === 'commodity'/);
  assert.match(modalSource, /<CommodityPriceDrivers symbol=\{quote\.symbol\}/);
  assert.match(modalSource, /Commodity snapshot/);
  assert.match(commodityDriversSource, /Can push prices higher/);
  assert.match(commodityDriversSource, /Can push prices lower/);
  assert.match(commodityDriversSource, /not predictions/);
});
