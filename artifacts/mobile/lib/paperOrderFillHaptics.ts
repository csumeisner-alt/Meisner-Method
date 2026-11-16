export type PaperOrderFillTransition = {
  orderId: string;
  previousStatus: string;
  status: string;
};

export function createPaperOrderFillHapticNotifier(
  platform: string,
  impactAsync: () => Promise<unknown>,
): (transition: PaperOrderFillTransition) => void {
  const notifiedOrderIds = new Set<string>();

  return ({ orderId, previousStatus, status }) => {
    if (
      platform === 'web'
      || previousStatus !== 'pending'
      || status !== 'filled'
      || notifiedOrderIds.has(orderId)
    ) return;
    notifiedOrderIds.add(orderId);

    try {
      void impactAsync().catch(() => {});
    } catch {
      // Haptic feedback is optional and must never interrupt a confirmed fill.
    }
  };
}
