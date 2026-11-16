export type PaperOrderFillAlert = {
  orderId: string;
  message: string;
};

export type PaperOrderFillAlertTransition = {
  orderId: string;
  symbol: string;
  shares: number;
  previousStatus: string;
  status: string;
  isEventAccount: boolean;
  isLightningRoundOrder: boolean;
};

export function createPaperOrderFillAlertNotifier(
  onAlert: (alert: PaperOrderFillAlert) => void,
): (transition: PaperOrderFillAlertTransition) => void {
  const notifiedOrderIds = new Set<string>();

  return (transition) => {
    if (
      transition.previousStatus !== 'pending'
      || transition.status !== 'filled'
      || transition.isEventAccount
      || transition.isLightningRoundOrder
      || notifiedOrderIds.has(transition.orderId)
    ) return;

    notifiedOrderIds.add(transition.orderId);
    const shareLabel = transition.shares === 1 ? 'share' : 'shares';
    onAlert({
      orderId: transition.orderId,
      message: `Order filled: ${transition.shares} ${shareLabel} of ${transition.symbol}.`,
    });
  };
}
