/**
 * A raw key-value backend, one per storage technology. It knows nothing about records or schemas:
 * `createStorage` (storage.ts) adds validation, quarantine and tombstones once for every backend.
 * The IndexedDB backend (dexie-backend.ts) is the only file that imports Dexie.
 *
 * All access goes through `transaction`, which hands `fn` an explicit scope. Nothing depends on an
 * ambient "current transaction", so a nested call can't silently escape its transaction.
 */
export const COLLECTIONS = ["letterPairs", "events", "meta", "tombstones", "quarantine", "outbox"] as const;
export type Collection = (typeof COLLECTIONS)[number];

export interface RawEntry {
  readonly key: string;
  readonly value: unknown;
}

export interface BackendScope {
  /** Every entry, in key order. */
  getAll(collection: Collection): Promise<RawEntry[]>;
  get(collection: Collection, key: string): Promise<unknown>;
  put(collection: Collection, key: string, value: unknown): Promise<void>;
  delete(collection: Collection, key: string): Promise<void>;
  clear(collection: Collection): Promise<void>;
}

export interface Backend {
  /**
   * Runs `fn` atomically against a scope: if it throws, nothing it wrote is kept. Transactions run one
   * at a time, in the order they were started.
   */
  transaction<T>(fn: (scope: BackendScope) => Promise<T>): Promise<T>;
}

const byKey = (a: RawEntry, b: RawEntry) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/** Serialises async work: each call starts after the previous one settles. */
export function serial(): <T>(work: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(work: () => Promise<T>) => {
    const next = tail.then(work);
    tail = next.catch(() => undefined);
    return next;
  };
}

/** An in-memory backend, for tests and for environments without IndexedDB. Values are deep-copied in and out. */
export function memoryBackend(initial: Partial<Record<Collection, Record<string, unknown>>> = {}): Backend {
  let data = new Map<Collection, Map<string, unknown>>(COLLECTIONS.map((c) => [c, new Map(Object.entries(initial[c] ?? {}).map(([k, v]) => [k, structuredClone(v)]))]));
  const queue = serial();

  return {
    transaction: (fn) =>
      queue(async () => {
        const working = new Map([...data].map(([c, t]) => [c, new Map(t)]));
        const table = (c: Collection) => {
          const t = working.get(c);
          if (t === undefined) throw new Error(`unknown collection ${c}`);
          return t;
        };
        const scope: BackendScope = {
          getAll: (c) => Promise.resolve([...table(c)].map(([key, value]) => ({ key, value: structuredClone(value) })).sort(byKey)),
          get: (c, key) => Promise.resolve(structuredClone(table(c).get(key))),
          put: (c, key, value) => {
            table(c).set(key, structuredClone(value));
            return Promise.resolve();
          },
          delete: (c, key) => {
            table(c).delete(key);
            return Promise.resolve();
          },
          clear: (c) => {
            table(c).clear();
            return Promise.resolve();
          },
        };
        const result = await fn(scope);
        data = working;
        return result;
      }),
  };
}
