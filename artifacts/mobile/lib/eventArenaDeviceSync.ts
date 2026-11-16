import {
  isPaperChallengeAccountId,
  normalizePaperChallengeStore,
  PAPER_CHALLENGE_STORAGE_KEY,
  type PaperChallengeStore,
} from './paperChallenge.ts';
import type {
  PaperAccount,
  PaperAccountSyncSnapshot,
  PaperLot,
  PaperOrder,
  PaperPosition,
  PaperTransaction,
} from './paperMath.ts';

export const EVENT_ARENA_DEVICE_TOKEN_KEY = '@stocksense/event_arena_device_token_v1';
export const EVENT_ARENA_DEVICE_REVISION_KEY = '@stocksense/event_arena_device_revision_v1';
export const EVENT_ARENA_DEVICE_DIRTY_KEY = '@stocksense/event_arena_device_dirty_v1';
export const EVENT_ARENA_SOURCE_INSTALLATION_ID_KEY = '@stocksense/event_arena_source_installation_id_v1';
export const PAPER_CACHE_STORAGE_KEY = '@stocksense/paper_v2';

export type EventArenaDeviceSnapshot = PaperAccountSyncSnapshot & {
  challengeStore: PaperChallengeStore;
};

export type EventArenaDeviceSyncResponse = {
  revision: number;
  snapshot: EventArenaDeviceSnapshot;
};

export type PaperCacheState = {
  accounts: PaperAccount[];
  positions: PaperPosition[];
  transactions: PaperTransaction[];
  orders: PaperOrder[];
  lots: PaperLot[];
  activeId: string;
};

export async function getEventArenaParticipantId(
  storage: { getItem(key: string): Promise<string | null> },
  getLocalInstallationId: () => Promise<string>,
): Promise<string> {
  return await storage.getItem(EVENT_ARENA_SOURCE_INSTALLATION_ID_KEY)
    ?? await getLocalInstallationId();
}

type DeviceSyncStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};
type DeviceSyncSender = (
  snapshot: EventArenaDeviceSnapshot,
  token: string,
  revision: number,
) => Promise<{ revision: number }>;

export function createEventArenaDeviceSyncSender(baseUrl: string): DeviceSyncSender {
  return async (snapshot, token, revision) => {
    const response = await fetch(`${baseUrl}/api/event-arena/device-sync`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-event-arena-device-token': token,
        'x-event-arena-revision': String(revision),
      },
      body: JSON.stringify({ snapshot }),
    });
    if (!response.ok) throw new Error('Could not sync the shared Event Arena account.');
    return await response.json() as { revision: number };
  };
}

let deviceSyncQueue: Promise<void> = Promise.resolve();

export async function syncEventArenaDeviceSnapshot(
  storage: DeviceSyncStorage,
  cache: PaperCacheState,
  challengeStore: PaperChallengeStore,
  send: DeviceSyncSender,
): Promise<number | null> {
  const operation = deviceSyncQueue.catch(() => {}).then(async () => {
    const token = await storage.getItem(EVENT_ARENA_DEVICE_TOKEN_KEY);
    const sourceInstallationId = await storage.getItem(EVENT_ARENA_SOURCE_INSTALLATION_ID_KEY);
    const accounts = cache.accounts.filter((account) => isPaperChallengeAccountId(account.id));
    if (!token || !sourceInstallationId || accounts.length === 0) return null;

    const parsedRevision = Number(await storage.getItem(EVENT_ARENA_DEVICE_REVISION_KEY));
    const revision = Number.isInteger(parsedRevision) && parsedRevision >= 0 ? parsedRevision : 0;
    const snapshot = buildEventArenaDeviceSnapshot(cache, challengeStore, sourceInstallationId);
    await storage.setItem(EVENT_ARENA_DEVICE_DIRTY_KEY, 'true');
    const response = await send(snapshot, token, revision);
    if (!Number.isInteger(response.revision) || response.revision !== revision + 1) {
      throw new Error('The Event Arena sync revision could not be verified.');
    }
    await Promise.all([
      storage.setItem(EVENT_ARENA_DEVICE_REVISION_KEY, String(response.revision)),
      storage.setItem(EVENT_ARENA_DEVICE_DIRTY_KEY, 'false'),
    ]);
    return response.revision;
  });
  deviceSyncQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

export async function syncStoredEventArenaDeviceSnapshot(
  storage: DeviceSyncStorage,
  send: DeviceSyncSender,
): Promise<number | null> {
  const rawCache = await storage.getItem(PAPER_CACHE_STORAGE_KEY);
  if (!rawCache) return null;
  const cacheData = JSON.parse(rawCache) as Partial<PaperCacheState>;
  const rawChallenge = await storage.getItem(PAPER_CHALLENGE_STORAGE_KEY);
  let challengeStore: PaperChallengeStore = { enrollment: null, lightningEnrollment: null, history: [] };
  if (rawChallenge) {
    const parsedChallenge = JSON.parse(rawChallenge) as Partial<PaperChallengeStore>;
    challengeStore = normalizePaperChallengeStore({
      enrollment: parsedChallenge.enrollment ?? null,
      lightningEnrollment: parsedChallenge.lightningEnrollment ?? null,
      history: Array.isArray(parsedChallenge.history) ? parsedChallenge.history : [],
    });
  }
  return syncEventArenaDeviceSnapshot(storage, {
    accounts: Array.isArray(cacheData.accounts) ? cacheData.accounts : [],
    positions: Array.isArray(cacheData.positions) ? cacheData.positions : [],
    transactions: Array.isArray(cacheData.transactions) ? cacheData.transactions : [],
    orders: Array.isArray(cacheData.orders) ? cacheData.orders : [],
    lots: Array.isArray(cacheData.lots) ? cacheData.lots : [],
    activeId: typeof cacheData.activeId === 'string' ? cacheData.activeId : '',
  }, challengeStore, send);
}

export function buildEventArenaDeviceSnapshot(
  cache: PaperCacheState,
  challengeStore: PaperChallengeStore,
  sourceInstallationId: string,
): EventArenaDeviceSnapshot {
  const accounts = cache.accounts.filter((account) => isPaperChallengeAccountId(account.id));
  const accountIds = new Set(accounts.map((account) => account.id));
  return {
    sourceInstallationId,
    accounts,
    positions: cache.positions.filter((item) => accountIds.has(item.accountId)),
    transactions: cache.transactions.filter((item) => accountIds.has(item.accountId)),
    orders: cache.orders.filter((item) => accountIds.has(item.accountId)),
    lots: cache.lots.filter((item) => accountIds.has(item.accountId)),
    challengeStore: normalizePaperChallengeStore(challengeStore),
  };
}

function mergeById<T extends { id: string; accountId: string }>(
  local: T[],
  remote: T[],
  eventAccountIds: Set<string>,
): T[] {
  const merged = new Map<string, T>();
  for (const item of local) {
    if (!isPaperChallengeAccountId(item.accountId) || !eventAccountIds.has(item.accountId)) {
      merged.set(item.id, item);
    }
  }
  for (const item of remote) merged.set(item.id, item);
  return [...merged.values()];
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function assertNoImportConflict(
  local: PaperCacheState,
  localChallengeStore: PaperChallengeStore,
  remote: EventArenaDeviceSnapshot,
) {
  const localEventAccounts = local.accounts.filter((account) => isPaperChallengeAccountId(account.id));
  const remoteAccounts = new Map(remote.accounts.map((account) => [account.id, account]));
  const sharedAccountIds = new Set(localEventAccounts
    .filter((account) => remoteAccounts.has(account.id))
    .map((account) => account.id));
  if (sharedAccountIds.size === 0) return;

  const accountState = (accounts: PaperAccount[]) => accounts
    .filter((account) => sharedAccountIds.has(account.id))
    .map((account) => ({
      id: account.id,
      name: account.name,
      cash: account.cash,
      shortCollateral: account.shortCollateral ?? 0,
      shortCollateralRatio: account.shortCollateralRatio ?? 1.5,
      createdAt: account.createdAt,
      unsettledItems: account.unsettledItems ?? [],
      lastDividendCredit: account.lastDividendCredit ?? null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const sliceState = (items: Array<{ id: string; accountId: string }>, fields: string[]) => items
    .filter((item) => sharedAccountIds.has(item.accountId))
    .map((item) => Object.fromEntries(fields.map((field) => [field, (item as any)[field] ?? null])))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const accountsMatch = stableSerialize(accountState(localEventAccounts))
    === stableSerialize(accountState(remote.accounts));
  const comparableSlices = [
    {
      local: local.positions,
      remote: remote.positions,
      fields: ['id', 'accountId', 'symbol', 'shares', 'avgCost', 'positionType', 'collateralPerShare', 'openedAt'],
    },
    {
      local: local.transactions,
      remote: remote.transactions,
      fields: ['id', 'accountId', 'symbol', 'action', 'shares', 'price', 'total', 'date', 'realizedPnL', 'fee', 'cashDelta', 'shortCollateralDelta', 'lightningRoundEventId'],
    },
    {
      local: local.orders,
      remote: remote.orders,
      fields: ['id', 'accountId', 'symbol', 'orderType', 'side', 'intent', 'shares', 'limitPrice', 'stopPrice', 'trailPct', 'trailAbs', 'trailRef', 'status', 'filledPrice', 'filledAt', 'placedAt', 'lightningRoundEventId'],
    },
    {
      local: local.lots,
      remote: remote.lots,
      fields: ['id', 'accountId', 'symbol', 'shares', 'cost', 'purchasedAt'],
    },
  ];
  const slicesMatch = comparableSlices.every(({ local: localItems, remote: remoteItems, fields }) =>
    stableSerialize(sliceState(localItems, fields)) === stableSerialize(sliceState(remoteItems, fields)),
  );
  const localEnrollments = [localChallengeStore.enrollment, localChallengeStore.lightningEnrollment];
  const remoteEnrollments = [remote.challengeStore.enrollment, remote.challengeStore.lightningEnrollment];
  const enrollmentsMatch = localEnrollments.every((enrollment, index) =>
    !enrollment || !remoteEnrollments[index] || stableSerialize(enrollment) === stableSerialize(remoteEnrollments[index]),
  );
  if (!accountsMatch || !slicesMatch || !enrollmentsMatch) {
    throw new Error('This device already has different Event Arena activity. Its local data was left unchanged.');
  }
}

function mergeChallengeStores(
  local: PaperChallengeStore,
  remote: PaperChallengeStore,
): PaperChallengeStore {
  const historyByEventId = new Map(local.history.map((event) => [event.eventId, event]));
  for (const event of remote.history) historyByEventId.set(event.eventId, event);
  const history = [...historyByEventId.values()];
  const remoteHistoryIds = new Set(history.map((event) => event.eventId));
  type Enrollment = NonNullable<PaperChallengeStore['enrollment']>;
  const mergeEnrollment = (
    localEntry: Enrollment | null | undefined,
    remoteEntry: Enrollment | null | undefined,
  ): Enrollment | null => {
    if (remoteEntry) return remoteEntry;
    if (localEntry && !remoteHistoryIds.has(localEntry.eventId)) return localEntry;
    return null;
  };

  return normalizePaperChallengeStore({
    enrollment: mergeEnrollment(local.enrollment, remote.enrollment),
    lightningEnrollment: mergeEnrollment(local.lightningEnrollment, remote.lightningEnrollment ?? null),
    history,
  });
}

/** Merge only Event Arena state; ordinary paper accounts remain device-local. */
export function mergeEventArenaDeviceSnapshot(
  local: PaperCacheState,
  localChallengeStore: PaperChallengeStore,
  remote: EventArenaDeviceSnapshot,
  options: { protectConflicts?: boolean } = {},
): { cache: PaperCacheState; challengeStore: PaperChallengeStore } {
  if (options.protectConflicts) {
    assertNoImportConflict(local, localChallengeStore, remote);
  }
  const accountsById = new Map(local.accounts.map((account) => [account.id, account]));
  for (const account of remote.accounts) accountsById.set(account.id, account);
  const accounts = [...accountsById.values()];
  const eventAccountIds = new Set(remote.accounts.map((account) => account.id));

  return {
    cache: {
      ...local,
      accounts,
      positions: mergeById(local.positions, remote.positions, eventAccountIds),
      transactions: mergeById(local.transactions, remote.transactions, eventAccountIds),
      orders: mergeById(local.orders, remote.orders, eventAccountIds),
      lots: mergeById(local.lots, remote.lots, eventAccountIds),
    },
    challengeStore: mergeChallengeStores(localChallengeStore, remote.challengeStore),
  };
}
