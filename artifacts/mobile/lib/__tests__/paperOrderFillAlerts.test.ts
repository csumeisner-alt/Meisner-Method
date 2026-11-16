import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createPaperOrderFillAlertNotifier } from '../paperOrderFillAlerts.ts';

const screenSource = readFileSync('app/paper.tsx', 'utf8');

const transition = (overrides: Partial<Parameters<ReturnType<typeof createPaperOrderFillAlertNotifier>>[0]> = {}) => ({
  orderId: 'order-1',
  symbol: 'AAPL',
  shares: 2,
  previousStatus: 'pending',
  status: 'filled',
  isEventAccount: false,
  isLightningRoundOrder: false,
  ...overrides,
});

test('a newly filled standard order queues one concise alert', () => {
  const alerts: Array<{ orderId: string; message: string }> = [];
  const notify = createPaperOrderFillAlertNotifier((alert) => alerts.push(alert));

  notify(transition());
  notify(transition());

  assert.deepEqual(alerts, [{
    orderId: 'order-1',
    message: 'Order filled: 2 shares of AAPL.',
  }]);
});

test('single-share fills use singular wording', () => {
  const alerts: Array<{ orderId: string; message: string }> = [];
  createPaperOrderFillAlertNotifier((alert) => alerts.push(alert))(
    transition({ shares: 1 }),
  );

  assert.equal(alerts[0]?.message, 'Order filled: 1 share of AAPL.');
});

test('pending, rejected, cancelled, Event Arena, and Lightning Round orders stay silent', () => {
  const alerts: Array<{ orderId: string; message: string }> = [];
  const notify = createPaperOrderFillAlertNotifier((alert) => alerts.push(alert));

  notify(transition({ orderId: 'still-pending', status: 'pending' }));
  notify(transition({ orderId: 'rejected', status: 'rejected' }));
  notify(transition({ orderId: 'cancelled', status: 'cancelled' }));
  notify(transition({ orderId: 'event', isEventAccount: true }));
  notify(transition({ orderId: 'lightning', isLightningRoundOrder: true }));

  assert.equal(alerts.length, 0);
});

test('the screen announces and displays fill alerts from the successful fill path', () => {
  assert.match(screenSource, /paperOrderFillAlertNotifierRef\.current\?\.\(\{/);
  assert.match(screenSource, /testID="paper-order-fill-alert"[\s\S]*?accessibilityRole="alert"[\s\S]*?accessibilityLiveRegion="polite"/);
});
