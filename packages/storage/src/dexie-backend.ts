import { Dexie, type Table } from "dexie";
import { COLLECTIONS, serial, type Backend, type BackendScope, type Collection, type RawEntry } from "./backend.js";
import { DEXIE_VERSION } from "./schema.js";

/**
 * The IndexedDB backend. The only file in the project that imports Dexie (CLAUDE.md).
 *
 * Every collection is a table with out-of-line string keys, so records are stored exactly as the
 * storage layer hands them over. The Dexie version tracks DEXIE_VERSION (schema.ts), not
 * SCHEMA_VERSION: adding a new object store bumps this and needs no `.upgrade()` (an empty new store
 * needs no data migration); a change to an *existing* store's record shape adds a
 * `version(n).upgrade()` here together with the matching export migration (MIGRATION.md §5).
 *
 * A transaction reads through to IndexedDB, buffers its writes in memory, and commits them all in one
 * IndexedDB transaction when `fn` returns; if `fn` throws, nothing is written. Buffering avoids Dexie's
 * ambient-transaction rules, under which a plain `await` inside a transaction can commit it early
 * (DECISIONS D-029). Transactions in this tab run one at a time; another tab writing between a
 * transaction's reads and its commit is not isolated against.
 */
class BldDatabase extends Dexie {
  constructor(name: string) {
    super(name);
    this.version(DEXIE_VERSION).stores(Object.fromEntries(COLLECTIONS.map((c) => [c, ""])));
  }

  tableFor(collection: Collection): Table<unknown, string> {
    return this.table(collection);
  }
}

const DELETED = Symbol("deleted");

interface Pending {
  cleared: boolean;
  /** Every stored entry, once getAll has read them (empty after a clear). */
  loaded: Map<string, unknown> | undefined;
  /** Writes and deletes made in this transaction. */
  writes: Map<string, unknown>;
}

export function dexieBackend(name = "bldokja"): Backend & { close(): void; deleteDatabase(): Promise<void> } {
  const db = new BldDatabase(name);
  const queue = serial();

  async function readAll(collection: Collection): Promise<RawEntry[]> {
    const table = db.tableFor(collection);
    const [keys, values] = await db.transaction("r", table, () => Promise.all([table.toCollection().primaryKeys(), table.toArray()]));
    return keys.map((key, i) => ({ key, value: values[i] }));
  }

  return {
    transaction: (fn) =>
      queue(async () => {
        const pending = new Map<Collection, Pending>(COLLECTIONS.map((c) => [c, { cleared: false, loaded: undefined, writes: new Map() }]));
        const of = (c: Collection) => {
          const p = pending.get(c);
          if (p === undefined) throw new Error(`unknown collection ${c}`);
          return p;
        };
        const scope: BackendScope = {
          async getAll(c) {
            const p = of(c);
            p.loaded ??= new Map((p.cleared ? [] : await readAll(c)).map((e) => [e.key, e.value]));
            const merged = new Map([...p.loaded, ...p.writes]);
            return [...merged]
              .filter(([, v]) => v !== DELETED)
              .map(([key, value]) => ({ key, value: structuredClone(value) }))
              .sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));
          },
          async get(c, key) {
            const p = of(c);
            if (p.writes.has(key)) {
              const v = p.writes.get(key);
              return v === DELETED ? undefined : structuredClone(v);
            }
            if (p.loaded !== undefined) return structuredClone(p.loaded.get(key));
            return p.cleared ? undefined : db.tableFor(c).get(key);
          },
          put(c, key, value) {
            of(c).writes.set(key, structuredClone(value));
            return Promise.resolve();
          },
          delete(c, key) {
            of(c).writes.set(key, DELETED);
            return Promise.resolve();
          },
          clear(c) {
            const p = of(c);
            p.writes.clear();
            p.cleared = true;
            p.loaded = new Map();
            return Promise.resolve();
          },
        };
        const result = await fn(scope);
        const dirty = COLLECTIONS.filter((c) => of(c).cleared || of(c).writes.size > 0);
        if (dirty.length > 0) {
          await db.transaction("rw", dirty.map((c) => db.tableFor(c)), async () => {
            for (const c of dirty) {
              const p = of(c);
              const table = db.tableFor(c);
              if (p.cleared) await table.clear();
              const puts = [...p.writes].filter(([, v]) => v !== DELETED);
              const deletes = [...p.writes].filter(([, v]) => v === DELETED).map(([k]) => k);
              if (puts.length > 0) await table.bulkPut(puts.map(([, v]) => v), puts.map(([k]) => k));
              if (deletes.length > 0) await table.bulkDelete(deletes);
            }
          });
        }
        return result;
      }),
    close: () => {
      db.close();
    },
    deleteDatabase: () => db.delete(),
  };
}
