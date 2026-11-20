import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  getMainTabSwipeCoordinates,
  hasTestId,
  parseUiHierarchy,
} from './android-main-tab-regression.mjs';

const scriptUrl = new URL('./android-main-tab-regression.mjs', import.meta.url);

test('Android UI hierarchy parsing preserves selectors, selected state, and bounds', () => {
  const nodes = parseUiHierarchy(`<hierarchy>
    <node index="0" text="Paper Trading" resource-id="com.meisnermethod.app:id/bottom-tab-paper"
      content-desc="Paper Trading" selected="true" bounds="[20,100][90,170]" />
    <node index="1" text="A &amp; B" content-desc="Quote &quot;A&quot;" bounds="[0,0][1,1]" />
  </hierarchy>`);

  assert.equal(nodes.length, 2);
  assert.equal(nodes[0].selected, 'true');
  assert.equal(nodes[0].bounds, '[20,100][90,170]');
  assert.ok(hasTestId(nodes[0], 'bottom-tab-paper'));
  assert.equal(nodes[1].text, 'A & B');
  assert.equal(nodes[1]['content-desc'], 'Quote "A"');
});

test('Android swipe coordinates move in the requested direction across the screen', () => {
  const left = getMainTabSwipeCoordinates(400, 'left');
  const right = getMainTabSwipeCoordinates(400, 'right');
  assert.ok(left.startX > left.endX);
  assert.ok(right.startX < right.endX);
  assert.equal(left.startX, right.endX);
  assert.equal(left.endX, right.startX);
});

test('Android journey source covers the five tabs, cancelled gestures, details, and app resume', async () => {
  const source = await readFile(fileURLToPath(scriptUrl), 'utf8');
  for (const required of [
    "route: '/picks'",
    "route: '/paper'",
    "route: '/portfolio'",
    "route: '/event-arena'",
    "cancelled short drag",
    "heat-map-detail-modal",
    'KEYCODE_BACK',
    'KEYCODE_HOME',
    'paper-account-buying-power',
    'paper-current-account',
  ]) {
    assert.ok(source.includes(required), `Android regression journey is missing ${required}.`);
  }
});
