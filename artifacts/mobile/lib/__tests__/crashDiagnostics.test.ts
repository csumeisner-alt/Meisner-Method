import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendDiagnosticEvent,
  CRASH_DIAGNOSTICS_LIMIT,
  CRASH_DIAGNOSTICS_STORAGE_KEY,
  findUnfinishedInteraction,
  makeDiagnosticEvent,
  parseDiagnosticEvents,
  readDiagnosticEvents,
  routeTemplateFromSegments,
} from '../crashDiagnostics.ts';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value); },
  };
}

test('diagnostic routes use route templates and omit dynamic route values', () => {
  assert.equal(
    routeTemplateFromSegments(['(tabs)', 'analysis', '[symbol]']),
    '/analysis/[param]',
  );
  assert.equal(routeTemplateFromSegments([]), '/');
  assert.equal(routeTemplateFromSegments(['profile', 'private name']), '/[route]/[route]');
});

test('diagnostic events use an allow-list, excluding messages and arbitrary fields', async () => {
  const storage = memoryStorage({
    'financial-cache': JSON.stringify({ balance: 12345, holdings: ['SECRET'] }),
  });
  const event = makeDiagnosticEvent(
    { appVersion: '1.0.2', platform: 'android', route: '/analysis/[param]' },
    'render_error',
    {
      errorType: 'PersonalAccountName',
      componentStack: '\n    in PortfolioScreen (at PortfolioScreen.tsx:2)\n    in View',
      timestamp: '2026-01-01T00:00:00.000Z',
    },
  );
  await appendDiagnosticEvent(storage, event);

  const saved = storage.values.get(CRASH_DIAGNOSTICS_STORAGE_KEY)!;
  assert.equal(saved.includes('balance'), false);
  assert.equal(saved.includes('holdings'), false);
  assert.equal(saved.includes('PersonalAccountName'), false);
  assert.equal(saved.includes('PortfolioScreen.tsx'), false);
  assert.deepEqual(JSON.parse(saved), [{
    timestamp: '2026-01-01T00:00:00.000Z',
    appVersion: '1.0.2',
    platform: 'android',
    route: '/analysis/[param]',
    kind: 'render_error',
    errorType: 'Error',
    components: ['PortfolioScreen', 'View'],
  }]);
  assert.equal(storage.values.get('financial-cache'), JSON.stringify({ balance: 12345, holdings: ['SECRET'] }));
});

test('diagnostic retention is bounded and malformed records are discarded', async () => {
  const storage = memoryStorage();
  for (let index = 0; index < CRASH_DIAGNOSTICS_LIMIT + 3; index += 1) {
    await appendDiagnosticEvent(
      storage,
      makeDiagnosticEvent(
        { appVersion: '1.0.2', platform: 'android', route: '/' },
        'fatal_js_error',
        { errorType: 'TypeError', timestamp: `2026-01-01T00:00:${String(index).padStart(2, '0')}.000Z` },
      ),
    );
  }
  const events = await readDiagnosticEvents(storage);
  assert.equal(events.length, CRASH_DIAGNOSTICS_LIMIT);
  assert.equal(events[0].timestamp, '2026-01-01T00:00:03.000Z');
  assert.deepEqual(parseDiagnosticEvents('[{"kind":"fatal_js_error","accountName":"secret"}]'), []);
});

test('export parsing replaces unsafe stored route and version fields', () => {
  const events = parseDiagnosticEvents(JSON.stringify([{
    timestamp: '2026-01-01T00:00:00.000Z',
    appVersion: 'account-98765',
    platform: 'android',
    route: '/paper/account-private',
    kind: 'fatal_js_error',
    errorType: 'TypeError',
  }]));
  assert.equal(events[0].appVersion, 'unknown');
  assert.equal(events[0].route, '/unknown');
});

test('unfinished gestures can be reported as interrupted after the next launch', () => {
  const event = makeDiagnosticEvent(
    { appVersion: '1.0.2', platform: 'android', route: '/paper' },
    'interaction_lifecycle',
    { interaction: { type: 'main_tab_swipe', stage: 'started' } },
  );
  assert.equal(findUnfinishedInteraction([event]), event);

  const completed = makeDiagnosticEvent(
    { appVersion: '1.0.2', platform: 'android', route: '/paper' },
    'interaction_lifecycle',
    { interaction: { type: 'main_tab_swipe', stage: 'cancelled' } },
  );
  assert.equal(findUnfinishedInteraction([event, completed]), null);
});

test('swipe diagnostics distinguish accepted, rejected, cancelled, and completed navigation', () => {
  const context = { appVersion: '1.0.2', platform: 'android', route: '/paper' };
  const swipeEvent = (
    stage: 'started' | 'cancelled' | 'navigation_requested' | 'navigation_accepted'
      | 'navigation_rejected' | 'completed' | 'interrupted',
  ) => makeDiagnosticEvent(context, 'interaction_lifecycle', {
    interaction: { type: 'main_tab_swipe', stage },
    timestamp: '2026-01-01T00:00:00.000Z',
  });
  const transitionEvent = (stage: 'started' | 'completed' | 'cancelled') =>
    makeDiagnosticEvent(context, 'interaction_lifecycle', {
      interaction: { type: 'navigation_transition', stage },
      timestamp: '2026-01-01T00:00:00.000Z',
    });

  assert.equal(findUnfinishedInteraction([swipeEvent('started')])?.interaction?.stage, 'started');
  assert.equal(
    findUnfinishedInteraction([swipeEvent('started'), swipeEvent('navigation_accepted')])
      ?.interaction?.stage,
    'navigation_accepted',
  );
  assert.equal(findUnfinishedInteraction([swipeEvent('started'), swipeEvent('navigation_rejected')]), null);
  assert.equal(findUnfinishedInteraction([swipeEvent('started'), swipeEvent('cancelled')]), null);
  assert.equal(
    findUnfinishedInteraction([swipeEvent('started'), swipeEvent('navigation_requested')]),
    null,
    'legacy requests are ambiguous because they were logged before the navigation guard',
  );
  assert.equal(findUnfinishedInteraction([transitionEvent('started')]), null);
  assert.equal(
    findUnfinishedInteraction([
      swipeEvent('navigation_accepted'),
      transitionEvent('started'),
      transitionEvent('completed'),
      transitionEvent('completed'),
    ])?.interaction?.stage,
    'navigation_accepted',
    'duplicate outer-stack events neither complete nor interrupt a tab swipe',
  );
  assert.equal(
    findUnfinishedInteraction([
      swipeEvent('navigation_accepted'),
      swipeEvent('completed'),
      transitionEvent('started'),
      transitionEvent('completed'),
    ]),
    null,
  );
  assert.equal(findUnfinishedInteraction([swipeEvent('interrupted')]), null);
});
