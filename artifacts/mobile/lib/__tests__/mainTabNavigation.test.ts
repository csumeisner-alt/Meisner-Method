import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAIN_TAB_ROUTES,
  getCommittedMainTabSwipeDirection,
  getCurrentMainTabPath,
  getMainTabNavigationPlan,
  getMainTabSwipeIntent,
  getMainTabSwipeTarget,
} from '../mainTabNavigation.ts';

test('main tabs keep the established Analyze to Event Arena order', () => {
  assert.deepEqual(MAIN_TAB_ROUTES, ['/', '/picks', '/paper', '/portfolio', '/event-arena']);
  assert.equal(getCurrentMainTabPath('/'), '/');
  assert.equal(getCurrentMainTabPath('/picks/AAPL'), '/picks');
  assert.equal(getCurrentMainTabPath('/paper'), '/paper');
  assert.equal(getCurrentMainTabPath('/portfolio'), '/portfolio');
  assert.equal(getCurrentMainTabPath('/event-arena'), '/event-arena');
});

test('left and right swipes move exactly one tab and stop at both ends', () => {
  assert.equal(getMainTabSwipeTarget('/', 'left'), '/picks');
  assert.equal(getMainTabSwipeTarget('/picks', 'left'), '/paper');
  assert.equal(getMainTabSwipeTarget('/paper', 'left'), '/portfolio');
  assert.equal(getMainTabSwipeTarget('/portfolio', 'left'), '/event-arena');
  assert.equal(getMainTabSwipeTarget('/event-arena', 'left'), null);
  assert.equal(getMainTabSwipeTarget('/event-arena', 'right'), '/portfolio');
  assert.equal(getMainTabSwipeTarget('/portfolio', 'right'), '/paper');
  assert.equal(getMainTabSwipeTarget('/paper', 'right'), '/picks');
  assert.equal(getMainTabSwipeTarget('/picks', 'right'), '/');
  assert.equal(getMainTabSwipeTarget('/', 'right'), null);
  assert.equal(getMainTabSwipeTarget('/heat-map', 'left'), null);
});

test('gesture direction requires horizontal intent, distance, and a dead zone', () => {
  assert.equal(getMainTabSwipeIntent(10, 0), null);
  assert.equal(getMainTabSwipeIntent(-22, 30), null);
  assert.equal(getMainTabSwipeIntent(-25, 10), 'left');
  assert.equal(getMainTabSwipeIntent(25, 10), 'right');
  assert.equal(getCommittedMainTabSwipeDirection(-35, 2, -0.2), null);
  assert.equal(getCommittedMainTabSwipeDirection(-42, 4, -0.5), 'left');
  assert.equal(getCommittedMainTabSwipeDirection(70, 8, 0.1), 'right');
});

test('bottom taps and swipes retain each main tab and preserve direction', () => {
  assert.deepEqual(getMainTabNavigationPlan('/paper', '/event-arena'), {
    action: 'push',
    href: { pathname: '/event-arena', params: { transition: 'right' } },
  });
  assert.deepEqual(getMainTabNavigationPlan('/event-arena', '/paper'), {
    action: 'push',
    href: { pathname: '/paper', params: { transition: 'left' } },
  });
  assert.deepEqual(getMainTabNavigationPlan('/portfolio', '/event-arena'), {
    action: 'push',
    href: { pathname: '/event-arena', params: { transition: 'right' } },
  });
  assert.deepEqual(getMainTabNavigationPlan('/', '/picks'), {
    action: 'push',
    href: { pathname: '/picks', params: { transition: 'right' } },
  });
  assert.deepEqual(getMainTabNavigationPlan('/picks', '/'), {
    action: 'push',
    href: { pathname: '/', params: { transition: 'left' } },
  });
  assert.equal(getMainTabNavigationPlan('/paper', '/paper'), null);
});

test('repeated switching across all five tabs keeps one route instance per tab', () => {
  const stack: string[] = ['/'];
  let current = '/';
  const sequence = ['/picks', '/paper', '/portfolio', '/event-arena', '/', '/paper', '/event-arena', '/picks', '/portfolio'];

  for (const target of sequence) {
    const plan = getMainTabNavigationPlan(current, target as (typeof MAIN_TAB_ROUTES)[number]);
    assert.equal(plan?.action, 'push');
    const existingIndex = stack.indexOf(target);
    if (existingIndex >= 0) stack.splice(existingIndex, 1);
    stack.push(target);
    current = target;
  }

  assert.deepEqual(new Set(stack), new Set(MAIN_TAB_ROUTES));
  assert.equal(stack.length, MAIN_TAB_ROUTES.length);
  assert.equal(current, '/portfolio');
});
