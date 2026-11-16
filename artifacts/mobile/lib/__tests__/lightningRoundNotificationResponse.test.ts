import assert from 'node:assert/strict';
import test from 'node:test';
import {
  installLightningRoundNotificationResponseHandler,
  type LightningRoundNotificationApi,
  type LightningRoundNotificationResponse,
} from '../lightningRoundNotificationResponse.ts';

const standingsResponse: LightningRoundNotificationResponse = {
  notification: {
    request: {
      identifier: 'lightning-result-notification',
      content: {
        data: {
          type: 'lightning-round-standings',
          eventId: 'lightning-2026-11-20',
        },
      },
    },
  },
};

function createNotificationApi(initialResponse: LightningRoundNotificationResponse | null) {
  let lastResponse = initialResponse;
  let listener: ((response: LightningRoundNotificationResponse) => void) | undefined;
  let clearCount = 0;

  const api: LightningRoundNotificationApi = {
    addNotificationResponseReceivedListener: (nextListener) => {
      listener = nextListener;
      return { remove: () => { listener = undefined; } };
    },
    getLastNotificationResponseAsync: async () => lastResponse,
    clearLastNotificationResponseAsync: async () => {
      clearCount += 1;
      lastResponse = null;
    },
  };

  return {
    api,
    emit: (response: LightningRoundNotificationResponse) => listener?.(response),
    get clearCount() { return clearCount; },
    get lastResponse() { return lastResponse; },
  };
}

const flushAsyncWork = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

test('cold-start notification opens Past Lightning Rounds and clears the saved response', async () => {
  const notifications = createNotificationApi(standingsResponse);
  const openedEventIds: Array<string | undefined> = [];
  installLightningRoundNotificationResponseHandler(notifications.api, (eventId) => {
    openedEventIds.push(eventId);
  });

  await flushAsyncWork();

  assert.deepEqual(openedEventIds, ['lightning-2026-11-20']);
  assert.equal(notifications.clearCount, 1);
  assert.equal(notifications.lastResponse, null);
});

test('a notification tap while the app is open opens the same saved-results view', async () => {
  const notifications = createNotificationApi(null);
  const openedEventIds: Array<string | undefined> = [];
  installLightningRoundNotificationResponseHandler(notifications.api, (eventId) => {
    openedEventIds.push(eventId);
  });

  notifications.emit(standingsResponse);
  await flushAsyncWork();

  assert.deepEqual(openedEventIds, ['lightning-2026-11-20']);
  assert.equal(notifications.clearCount, 1);
});

test('a handled response does not reopen Past Lightning Rounds on a later launch', async () => {
  const notifications = createNotificationApi(standingsResponse);
  const openedEventIds: Array<string | undefined> = [];
  installLightningRoundNotificationResponseHandler(notifications.api, (eventId) => {
    openedEventIds.push(eventId);
  });
  await flushAsyncWork();

  installLightningRoundNotificationResponseHandler(notifications.api, (eventId) => {
    openedEventIds.push(eventId);
  });
  await flushAsyncWork();

  assert.deepEqual(openedEventIds, ['lightning-2026-11-20']);
  assert.equal(notifications.clearCount, 1);
});
