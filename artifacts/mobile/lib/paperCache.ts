import {
  INITIAL_BALANCE,
  type PaperAccount,
  type PaperLot,
  type PaperOrder,
  type PaperPosition,
  type PaperTransaction,
} from './paperMath.ts';

export const PAPER_CACHE_KEY = '@stocksense/paper_v2';

export interface StoredPaperCache {
  accounts: PaperAccount[];
  positions: PaperPosition[];
  transactions: PaperTransaction[];
  orders: PaperOrder[];
  lots: PaperLot[];
  activeId: string;
}

export interface PaperCacheStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
}

export function createDefaultPaperCache(): StoredPaperCache {
  const now = new Date().toISOString();
  const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
  const accounts: PaperAccount[] = [
    { id: uid(), name: 'Strategy 1', cash: INITIAL_BALANCE, createdAt: now },
    { id: uid(), name: 'Strategy 2', cash: INITIAL_BALANCE, createdAt: now },
    { id: uid(), name: 'Strategy 3', cash: INITIAL_BALANCE, createdAt: now },
  ];

  return {
    accounts,
    positions: [],
    transactions: [],
    orders: [],
    lots: [],
    activeId: accounts[0].id,
  };
}

export function parsePaperCache(raw: string | null): StoredPaperCache | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const value = parsed as Partial<StoredPaperCache>;
    if (
      !Array.isArray(value.accounts)
      || !Array.isArray(value.positions)
      || !Array.isArray(value.transactions)
    ) return null;

    return {
      accounts: value.accounts,
      positions: value.positions,
      transactions: value.transactions,
      orders: Array.isArray(value.orders) ? value.orders : [],
      lots: Array.isArray(value.lots) ? value.lots : [],
      activeId: typeof value.activeId === 'string'
        ? value.activeId
        : value.accounts[0]?.id ?? '',
    };
  } catch {
    return null;
  }
}

const cacheInitializationPromises = new WeakMap<object, Promise<StoredPaperCache | null>>();

/**
 * Create the three original paper accounts if this is a first launch. Concurrent
 * startup and Paper-screen reads share one initialization write.
 */
export function loadOrCreatePaperCache(
  storage: PaperCacheStorage,
): Promise<StoredPaperCache | null> {
  const key = storage as object;
  const existingPromise = cacheInitializationPromises.get(key);
  if (existingPromise) return existingPromise;

  const initialization = (async () => {
    let raw: string | null;
    try {
      raw = await storage.getItem(PAPER_CACHE_KEY);
    } catch {
      return null;
    }

    if (raw !== null) return parsePaperCache(raw);

    const initial = createDefaultPaperCache();
    try {
      await storage.setItem(PAPER_CACHE_KEY, JSON.stringify(initial));
      return initial;
    } catch {
      return null;
    }
  })().finally(() => {
    cacheInitializationPromises.delete(key);
  });

  cacheInitializationPromises.set(key, initialization);
  return initialization;
}
