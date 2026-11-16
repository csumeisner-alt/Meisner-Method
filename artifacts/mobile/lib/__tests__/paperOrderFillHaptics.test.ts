import assert from 'node:assert/strict';
import test from 'node:test';
import { createPaperOrderFillHapticNotifier } from '../paperOrderFillHaptics.ts';

test('native fills trigger one haptic per newly filled order', () => {
  let hapticCount = 0;
  const notifyFill = createPaperOrderFillHapticNotifier('ios', async () => {
    hapticCount += 1;
  });

  const fill = (orderId: string) => notifyFill({ orderId, previousStatus: 'pending', status: 'filled' });
  fill('market-order-1');
  fill('pending-order-2');
  fill('pending-order-2');
  fill('market-order-1');

  assert.equal(hapticCount, 2);
});

test('pending, rejected, cancelled, and already-filled orders stay silent', () => {
  let hapticCount = 0;
  const notifyFill = createPaperOrderFillHapticNotifier('android', async () => {
    hapticCount += 1;
  });

  notifyFill({ orderId: 'still-pending', previousStatus: 'pending', status: 'pending' });
  notifyFill({ orderId: 'rejected', previousStatus: 'pending', status: 'rejected' });
  notifyFill({ orderId: 'cancelled', previousStatus: 'pending', status: 'cancelled' });
  notifyFill({ orderId: 'already-filled', previousStatus: 'filled', status: 'filled' });

  assert.equal(hapticCount, 0);
});

test('browser previews skip haptics', () => {
  let hapticCount = 0;
  const notifyFill = createPaperOrderFillHapticNotifier('web', async () => {
    hapticCount += 1;
  });

  notifyFill({ orderId: 'market-order-1', previousStatus: 'pending', status: 'filled' });

  assert.equal(hapticCount, 0);
});

test('rejected haptic promises and synchronous errors do not escape', () => {
  const notifyRejected = createPaperOrderFillHapticNotifier('android', async () => {
    throw new Error('native haptics unavailable');
  });
  const notifyThrown = createPaperOrderFillHapticNotifier('android', () => {
    throw new Error('native haptics unavailable');
  });

  assert.doesNotThrow(() => notifyRejected({
    orderId: 'pending-order-1',
    previousStatus: 'pending',
    status: 'filled',
  }));
  assert.doesNotThrow(() => notifyThrown({
    orderId: 'pending-order-2',
    previousStatus: 'pending',
    status: 'filled',
  }));
});
