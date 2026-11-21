import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { getMainTabNavigationPlan, MAIN_TAB_ROUTES } from '../lib/mainTabNavigation.ts';

// Resolve the router used by Expo itself, not a hand-written array simulation
// or a separately installed version of React Navigation.
const require = createRequire(import.meta.url);
const expoRequire = createRequire(require.resolve('expo-router/package.json'));
const nativeRequire = createRequire(expoRequire.resolve('@react-navigation/native/package.json'));
const { TabRouter, StackRouter, CommonActions, StackActions } = await import(
  nativeRequire.resolve('@react-navigation/routers')
);
const { tabRouterOverride } = expoRequire('./build/layouts/TabRouter.js');
const routeNames = ['index', 'picks', 'paper', 'portfolio', 'event-arena'];
const options = { routeNames, routeParamList: {}, routeGetIdList: {} };
const createTabs = () => {
  const original = TabRouter({ initialRouteName: 'index', backBehavior: 'history' });
  return { ...original, ...tabRouterOverride(original) };
};
const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('500 real tab selections keep route keys, order, and saved route parameters', () => {
  const router = createTabs();
  let state = router.getInitialState(options);
  const savedPaperState = { selectedAccount: 'retained-account', selectedSection: 'positions' };
  state.routes[2] = { ...state.routes[2], params: savedPaperState };
  const originalKeys = state.routes.map((route) => route.key);
  let currentPath = '/';
  for (let index = 0; index < 500; index += 1) {
    const nextPath = MAIN_TAB_ROUTES[(index + 1) % MAIN_TAB_ROUTES.length];
    const plan = getMainTabNavigationPlan(currentPath, nextPath);
    assert.equal(plan.action, 'navigate');
    const name = nextPath === '/' ? 'index' : nextPath.slice(1);
    // Expo's public router.navigate dispatches NAVIGATE to its normal Tabs.
    state = router.getStateForAction(
      state, CommonActions.navigate(name, plan.href.params, { merge: true }), options,
    );
    assert.ok(state);
    assert.equal(state.routes[state.index].name, name);
    assert.deepEqual(state.routes.map((route) => route.key), originalKeys);
    assert.deepEqual(state.routes.map((route) => route.name), routeNames);
    assert.equal(state.routes[2].params.selectedAccount, savedPaperState.selectedAccount);
    assert.equal(state.routes[2].params.selectedSection, savedPaperState.selectedSection);
    assert.ok(state.history.length <= routeNames.length);
    currentPath = nextPath;
  }
});

test('a repeated tab selection and Android back never reorder tab routes', () => {
  const router = createTabs();
  let state = router.getInitialState(options);
  const originalKeys = state.routes.map((route) => route.key);
  for (const name of ['paper', 'event-arena', 'event-arena']) {
    state = router.getStateForAction(state, CommonActions.navigate(name), options);
    assert.deepEqual(state.routes.map((route) => route.key), originalKeys);
  }
  state = router.getStateForAction(state, CommonActions.goBack(), options);
  assert.equal(state.routes[state.index].name, 'paper');
  state = router.getStateForAction(state, CommonActions.goBack(), options);
  assert.equal(state.routes[state.index].name, 'index');
  assert.deepEqual(state.routes.map((route) => route.key), originalKeys);
  assert.equal(router.getStateForAction(state, CommonActions.goBack(), options), null);
});

test('opening and dismissing details retains the same tab container and selected screen', () => {
  const tabRouter = createTabs();
  let tabs = tabRouter.getInitialState(options);
  tabs = tabRouter.getStateForAction(tabs, CommonActions.navigate('paper'), options);
  const stackRouter = StackRouter({ initialRouteName: '(tabs)' });
  const stackOptions = {
    routeNames: ['(tabs)', 'heat-map', 'analysis/[symbol]', 'picks/[symbol]', 'lightning-round'],
    routeParamList: {},
    routeGetIdList: {},
  };
  let root = stackRouter.getInitialState(stackOptions);
  root.routes[0] = { ...root.routes[0], state: tabs };
  const containerKey = root.routes[0].key;
  for (const detail of stackOptions.routeNames.slice(1)) {
    root = stackRouter.getStateForAction(root, StackActions.push(detail), stackOptions);
    assert.equal(root.routes.length, 2);
    assert.equal(root.routes[1].name, detail);
    root = stackRouter.getStateForAction(root, CommonActions.goBack(), stackOptions);
    assert.equal(root.routes.length, 1);
    assert.equal(root.routes[0].key, containerKey);
    assert.equal(root.routes[0].state, tabs);
    assert.equal(root.routes[0].state.routes[tabs.index].name, 'paper');
  }
  root = stackRouter.getStateForAction(root, StackActions.push('lightning-round'), stackOptions);
  root = stackRouter.getStateForAction(
    root,
    StackActions.popTo('(tabs)', {
      screen: 'paper', params: { challengeAccountId: 'requested-account' },
    }),
    stackOptions,
  );
  assert.equal(root.routes.length, 1);
  assert.equal(root.routes[0].key, containerKey);
  assert.equal(root.routes[0].state, tabs);
  assert.equal(root.routes[0].params.params.challengeAccountId, 'requested-account');
});

test('production layouts use real tabs and never singular native stack tab routes', () => {
  const root = source('../app/_layout.tsx');
  const tabs = source('../app/(tabs)/_layout.tsx');
  const bar = source('../components/BottomTabBar.tsx');
  assert.match(root, /<Stack\.Screen name="\(tabs\)"/);
  assert.doesNotMatch(root, /dangerouslySingular|MainTabSwipeBoundary/);
  for (const name of routeNames) {
    assert.match(tabs, new RegExp(`<Tabs.Screen name="${name}"`));
    assert.doesNotMatch(root, new RegExp(`<Stack.Screen name="${name}"`));
  }
  assert.match(tabs, /detachInactiveScreens=\{false\}/);
  assert.match(tabs, /freezeOnBlur: false/);
  assert.match(tabs, /tabBar=\{\(\) => null\}/);
  assert.doesNotMatch(tabs, /MainTabSwipeBoundary|PanResponder/);
  assert.match(tabs, /sceneStyleInterpolator/);
  assert.match(tabs, /outputRange: \[-width, 0, width\]/);
  assert.match(tabs, /duration: 300/);
  assert.match(bar, /router\.navigate\(plan\.href\)/);
  assert.doesNotMatch(bar, /router\.(push|replace)\(/);
  assert.match(bar, /claimMainTabNavigation\(/);
});

test('detail-to-tab links dismiss the detail stack and keep account parameters', () => {
  const lightning = source('../components/LightningRoundScreen.tsx');
  assert.doesNotMatch(lightning, /router\.(push|replace)\(\s*\{\s*pathname: '\/(?:paper|event-arena)'/);
  assert.match(lightning, /router\.dismissTo\(\{\s*pathname: '\/paper',\s*params: \{ challengeAccountId:/);
  const eventArena = source('../components/EventArenaScreen.tsx');
  assert.doesNotMatch(eventArena, /router\.(push|replace)\(\s*(?:'\/paper'|\{\s*pathname: '\/paper')/);
});
