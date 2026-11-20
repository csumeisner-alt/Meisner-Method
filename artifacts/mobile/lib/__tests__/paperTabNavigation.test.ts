import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getPaperTabNavigationAction } from '../paperTabNavigation.ts';

test('every distinct main tab is selected without pushing a native stack screen', () => {
  assert.equal(getPaperTabNavigationAction('/paper', '/event-arena'), 'navigate');
  assert.equal(getPaperTabNavigationAction('/event-arena', '/paper'), 'navigate');
  assert.equal(getPaperTabNavigationAction('/paper', '/paper'), 'none');
  assert.equal(getPaperTabNavigationAction('/', '/picks'), 'navigate');
  assert.equal(getPaperTabNavigationAction('/portfolio', '/event-arena'), 'navigate');
});
