import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const modalPath = fileURLToPath(new URL('../components/HeatMapDetailModal.tsx', import.meta.url));
const modalSource = readFileSync(modalPath, 'utf8');

test('market detail modal builds and renders the selected asset-specific statistic rows', () => {
  assert.match(
    modalSource,
    /getHeatMapDetailStatRows\(\s*quote\.assetType,\s*stats,/,
  );
  assert.match(modalSource, /displayedStats\.map\(\(item\) => \(/);
  assert.match(modalSource, /\{item\.label\}/);
  assert.match(modalSource, /\{item\.value\}/);
});
