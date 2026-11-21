import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAIN_TAB_ROUTES,
  getCurrentMainTabPath,
  getMainTabNavigationPlan,
} from '../mainTabNavigation.ts';

test('main tabs keep the established Analyze to Event Arena order', () => {
  assert.deepEqual(MAIN_TAB_ROUTES, ['/', '/picks', '/paper', '/portfolio', '/event-arena']);
  assert.equal(getCurrentMainTabPath('/'), '/');
  assert.equal(getCurrentMainTabPath('/picks/AAPL'), '/picks');
  assert.equal(getCurrentMainTabPath('/paper'), '/paper');
  assert.equal(getCurrentMainTabPath('/portfolio'), '/portfolio');
  assert.equal(getCurrentMainTabPath('/event-arena'), '/event-arena');
});

test('bottom tab taps preserve Paper and route direction', () => {
  assert.deepEqual(getMainTabNavigationPlan('/paper', '/event-arena'), {
    action: 'navigate',
    href: { pathname: '/event-arena', params: { transition: 'right' } },
  });
  assert.deepEqual(getMainTabNavigationPlan('/event-arena', '/paper'), {
    action: 'navigate',
    href: { pathname: '/paper', params: { transition: 'left' } },
  });
  assert.deepEqual(getMainTabNavigationPlan('/portfolio', '/event-arena'), {
    action: 'navigate',
    href: { pathname: '/event-arena', params: { transition: 'right' } },
  });
  assert.deepEqual(getMainTabNavigationPlan('/', '/picks'), {
    action: 'navigate',
    href: { pathname: '/picks', params: { transition: 'right' } },
  });
  assert.deepEqual(getMainTabNavigationPlan('/picks', '/'), {
    action: 'navigate',
    href: { pathname: '/', params: { transition: 'left' } },
  });
  assert.equal(getMainTabNavigationPlan('/paper', '/paper'), null);
});

test('all distinct tab pairs select tabs rather than pushing or replacing', () => {
  for (const current of MAIN_TAB_ROUTES) {
    for (const target of MAIN_TAB_ROUTES) {
      const plan = getMainTabNavigationPlan(current, target);
      if (current === target) {
        assert.equal(plan, null);
      } else {
        assert.equal(plan?.action, 'navigate');
        assert.equal(plan?.href.pathname, target);
      }
    }
  }
});
