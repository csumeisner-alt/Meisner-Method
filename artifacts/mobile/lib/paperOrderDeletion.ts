type ScopedOrder = {
  id: string;
  accountId: string;
  status: string;
};

/**
 * Return an updated list only when the selected order is still pending in the
 * active account. A null result means no deletion should be persisted.
 */
export function removePendingPaperOrder<T extends ScopedOrder>(
  orders: readonly T[],
  selectedOrder: Pick<T, 'id' | 'accountId' | 'status'>,
  activeAccountId: string,
): T[] | null {
  if (selectedOrder.status !== 'pending' || selectedOrder.accountId !== activeAccountId) {
    return null;
  }

  const currentOrder = orders.find(
    (order) => order.id === selectedOrder.id && order.accountId === selectedOrder.accountId,
  );
  if (!currentOrder || currentOrder.status !== 'pending') return null;

  return orders.filter(
    (order) => order.id !== selectedOrder.id || order.accountId !== selectedOrder.accountId,
  );
}
