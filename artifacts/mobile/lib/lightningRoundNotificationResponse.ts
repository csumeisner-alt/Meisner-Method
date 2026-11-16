export type LightningRoundNotificationResponse = {
  notification: {
    request: {
      identifier: string;
      content: {
        data: unknown;
      };
    };
  };
};

export type LightningRoundNotificationApi = {
  addNotificationResponseReceivedListener: (
    listener: (response: LightningRoundNotificationResponse) => void,
  ) => { remove: () => void };
  getLastNotificationResponseAsync: () => Promise<LightningRoundNotificationResponse | null>;
  clearLastNotificationResponseAsync: () => Promise<void>;
};

export function installLightningRoundNotificationResponseHandler(
  notifications: LightningRoundNotificationApi,
  openPastRounds: (eventId?: string) => void,
): () => void {
  let active = true;
  const handledResponses = new Set<string>();

  const handleResponse = (response: LightningRoundNotificationResponse) => {
    const request = response.notification.request;
    const data = request.content.data;
    if (
      !active
      || !data
      || typeof data !== 'object'
      || (data as { type?: unknown }).type !== 'lightning-round-standings'
      || handledResponses.has(request.identifier)
    ) {
      return;
    }

    handledResponses.add(request.identifier);
    const eventId = (data as { eventId?: unknown }).eventId;
    openPastRounds(typeof eventId === 'string' ? eventId : undefined);
    void notifications.clearLastNotificationResponseAsync().catch(() => {});
  };

  const subscription = notifications.addNotificationResponseReceivedListener(handleResponse);
  void notifications.getLastNotificationResponseAsync()
    .then((response) => {
      if (response) handleResponse(response);
    })
    .catch(() => {});

  return () => {
    active = false;
    subscription.remove();
  };
}
