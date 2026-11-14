import { INITIAL_BALANCE, type PaperAccount, type PaperLot, type PaperOrder, type PaperPosition, type PaperTransaction } from './paperMath.ts';

export type PaperAccountData = {
  accounts: PaperAccount[];
  positions: PaperPosition[];
  transactions: PaperTransaction[];
  orders: PaperOrder[];
  lots: PaperLot[];
};

export function getAdjacentPaperAccountId(
  eligibleAccounts: Pick<PaperAccount, 'id'>[],
  currentId: string,
  direction: -1 | 1,
): string | null {
  if (eligibleAccounts.length === 0) return null;
  const currentIndex = eligibleAccounts.findIndex((account) => account.id === currentId);
  if (currentIndex < 0) return eligibleAccounts[0].id;
  return eligibleAccounts[currentIndex + direction]?.id ?? currentId;
}

export function renamePaperAccount(
  accounts: PaperAccount[],
  accountId: string,
  name: string,
): PaperAccount[] {
  const trimmedName = name.trim();
  if (!trimmedName) return accounts;
  return accounts.map((account) =>
    account.id === accountId ? { ...account, name: trimmedName } : account,
  );
}

export function resetPaperAccountData(
  data: PaperAccountData,
  accountId: string,
  createdAt: string,
): PaperAccountData {
  return {
    accounts: data.accounts.map((account) =>
      account.id === accountId
        ? {
            ...account,
            cash: INITIAL_BALANCE,
            unsettledCash: 0,
            unsettledItems: [],
            createdAt,
          }
        : account,
    ),
    positions: data.positions.filter((position) => position.accountId !== accountId),
    transactions: data.transactions.filter((transaction) => transaction.accountId !== accountId),
    orders: data.orders.filter((order) => order.accountId !== accountId),
    lots: data.lots.filter((lot) => lot.accountId !== accountId),
  };
}
