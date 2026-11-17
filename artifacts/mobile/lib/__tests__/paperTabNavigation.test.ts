import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getPaperTabNavigationAction } from '../paperTabNavigation.ts';

test('Paper Trading stays mounted while leaving and is reused when returning', () => {
  assert.equal(getPaperTabNavigationAction('/paper', '/event-arena'), 'push');
  assert.equal(getPaperTabNavigationAction('/event-arena', '/paper'), 'navigate');
  assert.equal(getPaperTabNavigationAction('/paper', '/paper'), 'none');
});

test('other app tabs retain their existing replace behavior', () => {
  assert.equal(getPaperTabNavigationAction('/', '/picks'), 'replace');
  assert.equal(getPaperTabNavigationAction('/portfolio', '/event-arena'), 'replace');
});
