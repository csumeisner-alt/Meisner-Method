import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getPaperTabNavigationAction } from '../paperTabNavigation.ts';

test('every distinct main tab is pushed so its stable route can be reused', () => {
  assert.equal(getPaperTabNavigationAction('/paper', '/event-arena'), 'push');
  assert.equal(getPaperTabNavigationAction('/event-arena', '/paper'), 'push');
  assert.equal(getPaperTabNavigationAction('/paper', '/paper'), 'none');
  assert.equal(getPaperTabNavigationAction('/', '/picks'), 'push');
  assert.equal(getPaperTabNavigationAction('/portfolio', '/event-arena'), 'push');
});
