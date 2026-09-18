import type { z } from "zod";
import type { Backend, BackendScope, Collection } from "./backend.js";
import {
  AppEventSchema,
  LegacySettingSchema,
  LetterPairSchema,
  OutboxEntrySchema,
  ProvenanceSchema,
  SettingsSchema,
  type AppEvent,
  type LegacySetting,
  type LetterPair,
  type OutboxEntry,
  type Provenance,
  type Settings,
} from "./schema.js";

/**
 * The StorageAdapter port (BRIEF §12). Everything the app persists goes through it; an IndexedDB
 * backend and a memory backend implement it today, and a remote one could later without changes
 * elsewhere.
 *
 * Records are validated on the way in (an invalid write throws) and again on the way out. A stored
 * record that no longer parses is moved to quarantine with its validation error, and left out of the
 * result. It is never dropped (CLAUDE.md).
 */
export interface Tombstone {
  readonly collection: "letterPairs";
  readonly id: string;
  readonly deletedAt: string;
}

export interface QuarantineEntry {
  readonly collection: Collection;
  readonly key: string;
  readonly raw: unknown;
  readonly issues: readonly string[];
  readonly quarantinedAt: string;
}

export interface StorageReader {
  letterPairs(): Promise<LetterPair[]>;
  letterPair(id: string): Promise<LetterPair | undefined>;
  /** Events in time order (then id). */
  events(filter?: { readonly type?: AppEvent["type"] }): Promise<AppEvent[]>;
  settings(): Promise<Settings | undefined>;
  provenance(): Promise<Provenance[]>;
  legacyAppSettings(): Promise<LegacySetting[] | undefined>;
  tombstones(): Promise<Tombstone[]>;
  quarantine(): Promise<QuarantineEntry[]>;
  /** Queued sync pushes, oldest first. Empty for a guest, always. */
  outbox(): Promise<OutboxEntry[]>;
}

export interface StorageWriter {
  putLetterPair(pair: LetterPair): Promise<void>;
  /** Deletes a pair. If any of its images came from a legacy import, a tombstone keeps it deleted on re-import. */
  deleteLetterPair(id: string, at: string): Promise<void>;
  /** Appends events. An event whose id already exists is left as it is. */
  appendEvents(events: readonly AppEvent[]): Promise<void>;
  putSettings(settings: Settings): Promise<void>;
  appendProvenance(entry: Provenance): Promise<void>;
  putLegacyAppSettings(rows: readonly LegacySetting[]): Promise<void>;
  /** Queues a sync push; replaces any existing queued entry with the same id (re-queuing a dirty record is idempotent). */
  enqueueOutbox(entry: OutboxEntry): Promise<void>;
  /** Removes a queued entry once it's been pushed successfully. Missing id is a no-op. */
  dequeueOutbox(id: string): Promise<void>;
  /** "Delete all my data": every collection, tombstones and quarantine included. */
  clearAll(): Promise<void>;
}

export type StorageOps = StorageReader & StorageWriter;

export interface StorageAdapter extends StorageOps {
  /** Atomic: if `fn` throws, nothing it wrote is kept. */
  transaction<T>(fn: (tx: StorageOps) => Promise<T>): Promise<T>;
}

export class StorageValidationError extends Error {
  readonly issues: readonly string[];
  constructor(what: string, issues: readonly string[]) {
    super(`invalid ${what}: ${issues.join("; ")}`);
    this.name = "StorageValidationError";
    this.issues = issues;
  }
}

export function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.length === 0 ? "(root)" : issue.path.join(".")}: ${issue.message}`);
}

function checked<T>(schema: z.ZodType<T>, what: string, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new StorageValidationError(what, formatIssues(parsed.error));
  return parsed.data;
}

const META = { settings: "settings", provenance: "provenance", legacyAppSettings: "legacy.appSettings" } as const;
const byTimeThenId = (a: AppEvent, b: AppEvent) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function scopedOps(scope: BackendScope, now: () => string): StorageOps {
  async function quarantine(collection: Collection, key: string, raw: unknown, issues: readonly string[]): Promise<void> {
    const entry: QuarantineEntry = { collection, key, raw, issues, quarantinedAt: now() };
    await scope.put("quarantine", `${collection}:${key}`, entry);
    await scope.delete(collection, key);
  }

  async function readValid<T>(collection: Collection, key: string, schema: z.ZodType<T>): Promise<T | undefined> {
    const raw = await scope.get(collection, key);
    if (raw === undefined) return undefined;
    const parsed = schema.safeParse(raw);
    if (parsed.success) return parsed.data;
    await quarantine(collection, key, raw, formatIssues(parsed.error));
    return undefined;
  }

  async function readAllValid<T>(collection: Collection, schema: z.ZodType<T>): Promise<T[]> {
    const out: T[] = [];
    for (const { key, value } of await scope.getAll(collection)) {
      const parsed = schema.safeParse(value);
      if (parsed.success) out.push(parsed.data);
      else await quarantine(collection, key, value, formatIssues(parsed.error));
    }
    return out;
  }

  return {
    letterPairs: () => readAllValid("letterPairs", LetterPairSchema),
    letterPair: (id) => readValid("letterPairs", id, LetterPairSchema),
    events: async (filter) => (await readAllValid("events", AppEventSchema)).filter((e) => filter?.type === undefined || e.type === filter.type).sort(byTimeThenId),
    settings: () => readValid("meta", META.settings, SettingsSchema),
    provenance: async () => (await readValid("meta", META.provenance, ProvenanceSchema.array())) ?? [],
    legacyAppSettings: () => readValid("meta", META.legacyAppSettings, LegacySettingSchema.array()),
    tombstones: async () => (await scope.getAll("tombstones")).map((e) => e.value as Tombstone),
    quarantine: async () => (await scope.getAll("quarantine")).map((e) => e.value as QuarantineEntry),
    outbox: async () => (await readAllValid("outbox", OutboxEntrySchema)).sort((a, b) => (a.queuedAt < b.queuedAt ? -1 : a.queuedAt > b.queuedAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),

    async putLetterPair(pair) {
      const valid = checked(LetterPairSchema, "letter pair", pair);
      await scope.put("letterPairs", valid.id, valid);
    },
    async deleteLetterPair(id, at) {
      const existing = await readValid("letterPairs", id, LetterPairSchema);
      if (existing === undefined) return;
      if (existing.images.some((img) => img.legacy !== undefined)) {
        const tombstone: Tombstone = { collection: "letterPairs", id, deletedAt: at };
        await scope.put("tombstones", `letterPairs:${id}`, tombstone);
      }
      await scope.delete("letterPairs", id);
    },
    async appendEvents(events) {
      for (const event of events) {
        const valid = checked(AppEventSchema, "event", event);
        if ((await scope.get("events", valid.id)) === undefined) await scope.put("events", valid.id, valid);
      }
    },
    async putSettings(settings) {
      await scope.put("meta", META.settings, checked(SettingsSchema, "settings", settings));
    },
    async appendProvenance(entry) {
      const valid = checked(ProvenanceSchema, "provenance", entry);
      const existing = (await readValid("meta", META.provenance, ProvenanceSchema.array())) ?? [];
      await scope.put("meta", META.provenance, [...existing, valid]);
    },
    async putLegacyAppSettings(rows) {
      await scope.put("meta", META.legacyAppSettings, checked(LegacySettingSchema.array(), "legacy app settings", rows));
    },
    async enqueueOutbox(entry) {
      const valid = checked(OutboxEntrySchema, "outbox entry", entry);
      await scope.put("outbox", valid.id, valid);
    },
    async dequeueOutbox(id) {
      await scope.delete("outbox", id);
    },
    async clearAll() {
      for (const c of ["letterPairs", "events", "meta", "tombstones", "quarantine", "outbox"] as const) await scope.clear(c);
    },
  };
}

export function createStorage(backend: Backend, options: { readonly now?: () => string } = {}): StorageAdapter {
  const now = options.now ?? (() => new Date().toISOString());
  const transaction = <T>(fn: (tx: StorageOps) => Promise<T>) => backend.transaction((scope) => fn(scopedOps(scope, now)));
  return {
    transaction,
    letterPairs: () => transaction((tx) => tx.letterPairs()),
    letterPair: (id) => transaction((tx) => tx.letterPair(id)),
    events: (filter) => transaction((tx) => tx.events(filter)),
    settings: () => transaction((tx) => tx.settings()),
    provenance: () => transaction((tx) => tx.provenance()),
    legacyAppSettings: () => transaction((tx) => tx.legacyAppSettings()),
    tombstones: () => transaction((tx) => tx.tombstones()),
    quarantine: () => transaction((tx) => tx.quarantine()),
    outbox: () => transaction((tx) => tx.outbox()),
    putLetterPair: (pair) => transaction((tx) => tx.putLetterPair(pair)),
    deleteLetterPair: (id, at) => transaction((tx) => tx.deleteLetterPair(id, at)),
    appendEvents: (events) => transaction((tx) => tx.appendEvents(events)),
    putSettings: (settings) => transaction((tx) => tx.putSettings(settings)),
    appendProvenance: (entry) => transaction((tx) => tx.appendProvenance(entry)),
    putLegacyAppSettings: (rows) => transaction((tx) => tx.putLegacyAppSettings(rows)),
    enqueueOutbox: (entry) => transaction((tx) => tx.enqueueOutbox(entry)),
    dequeueOutbox: (id) => transaction((tx) => tx.dequeueOutbox(id)),
    clearAll: () => transaction((tx) => tx.clearAll()),
  };
}
