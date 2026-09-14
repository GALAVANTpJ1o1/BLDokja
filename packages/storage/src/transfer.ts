import { formatIssues, type StorageAdapter } from "./storage.js";
import { EXPORT_FORMAT, ExportV1Schema, SCHEMA_VERSION, type AppEvent, type ExportV1, type LetterPair } from "./schema.js";

/**
 * JSON export and import (MIGRATION.md §3.1, §4.4, §5). The export envelope is the one portable
 * format: the app's backups, a restore, and the legacy importer's output all go through `importData`.
 */

/** JSON with object keys sorted at every level, so equal data always serialises to the same bytes. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);

export async function exportData(storage: StorageAdapter, exportedAt: string): Promise<ExportV1> {
  return storage.transaction(async (tx) => {
    const legacyAppSettings = await tx.legacyAppSettings();
    const settings = await tx.settings();
    const envelope: ExportV1 = {
      format: EXPORT_FORMAT,
      schemaVersion: SCHEMA_VERSION,
      exportedAt,
      provenance: await tx.provenance(),
      letterPairs: (await tx.letterPairs()).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
      events: await tx.events(),
      ...(settings === undefined ? {} : { settings }),
      ...(legacyAppSettings === undefined ? {} : { legacy: { appSettings: legacyAppSettings } }),
    };
    return ExportV1Schema.parse(envelope);
  });
}

/**
 * Forward migrations, keyed by the version they migrate from. Each bump adds one entry, a Dexie
 * upgrade, a committed fixture at the previous version, and a round-trip test (MIGRATION.md §5).
 */
export const EXPORT_MIGRATIONS: Readonly<Record<number, (envelope: Record<string, unknown>) => Record<string, unknown>>> = {};

export type ImportDataError =
  | { readonly code: "not-json"; readonly message: string }
  | { readonly code: "not-an-export" }
  | { readonly code: "newer-version"; readonly version: number; readonly supported: number }
  | { readonly code: "unsupported-version"; readonly version: unknown }
  | { readonly code: "invalid"; readonly issues: readonly string[] }
  | { readonly code: "verify-failed"; readonly detail: string };

export interface ImportConflict {
  readonly kind: "letterPair" | "event" | "legacyAppSettings";
  readonly id: string;
  /** What happened: the existing record was kept. */
  readonly resolution: "kept-existing";
}

export interface ImportSummary {
  readonly letterPairs: { readonly inserted: number; readonly unchanged: number };
  readonly events: { readonly inserted: number; readonly unchanged: number };
  readonly conflicts: readonly ImportConflict[];
  /** Records deleted in the app that the file still has; they stay deleted. */
  readonly stayedDeleted: readonly string[];
  readonly provenanceAdded: number;
}

export type ImportResult = { readonly ok: true; readonly summary: ImportSummary; readonly envelope: ExportV1 } | { readonly ok: false; readonly error: ImportDataError };

/** Zod-validate an envelope, running forward migrations first. Nothing is written. */
export function parseExport(input: unknown): { ok: true; envelope: ExportV1 } | { ok: false; error: ImportDataError } {
  let data = input;
  if (typeof input === "string") {
    try {
      data = JSON.parse(input);
    } catch (error) {
      return { ok: false, error: { code: "not-json", message: error instanceof Error ? error.message : String(error) } };
    }
  }
  if (data === null || typeof data !== "object" || Array.isArray(data) || (data as Record<string, unknown>).format !== EXPORT_FORMAT) {
    return { ok: false, error: { code: "not-an-export" } };
  }
  let record = data as Record<string, unknown>;
  const version = record.schemaVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) return { ok: false, error: { code: "unsupported-version", version } };
  if (version > SCHEMA_VERSION) return { ok: false, error: { code: "newer-version", version, supported: SCHEMA_VERSION } };
  for (let v = version; v < SCHEMA_VERSION; v++) {
    const migrate = EXPORT_MIGRATIONS[v];
    if (migrate === undefined) return { ok: false, error: { code: "unsupported-version", version } };
    record = migrate(record);
  }
  const parsed = ExportV1Schema.safeParse(record);
  if (!parsed.success) return { ok: false, error: { code: "invalid", issues: formatIssues(parsed.error) } };
  return { ok: true, envelope: parsed.data };
}

/**
 * Stage 2 of any import (MIGRATION.md §4.4), in one transaction:
 * - a record that doesn't exist is inserted;
 * - an identical one is left alone;
 * - a different one keeps the existing version and is reported as a conflict (an edit made in the app wins);
 * - a letter pair deleted in the app stays deleted (its tombstone) and is reported.
 * The store is read back and counted before the transaction commits.
 */
export async function importData(storage: StorageAdapter, input: unknown): Promise<ImportResult> {
  const parsed = parseExport(input);
  if (!parsed.ok) return parsed;
  const { envelope } = parsed;
  try {
    const summary = await storage.transaction(async (tx) => {
      const conflicts: ImportConflict[] = [];
      const stayedDeleted: string[] = [];
      const tombstoned = new Set((await tx.tombstones()).map((t) => t.id));
      const existingPairs = new Map((await tx.letterPairs()).map((p) => [p.id, p]));
      let pairsInserted = 0;
      let pairsUnchanged = 0;
      const expectedPairs = new Map<string, LetterPair>(existingPairs);
      for (const pair of envelope.letterPairs) {
        const existing = existingPairs.get(pair.id);
        if (existing === undefined && tombstoned.has(pair.id)) stayedDeleted.push(pair.id);
        else if (existing === undefined) {
          await tx.putLetterPair(pair);
          expectedPairs.set(pair.id, pair);
          pairsInserted++;
        } else if (same(existing, pair)) pairsUnchanged++;
        else conflicts.push({ kind: "letterPair", id: pair.id, resolution: "kept-existing" });
      }

      const existingEvents = new Map((await tx.events()).map((e) => [e.id, e]));
      const toAppend: AppEvent[] = [];
      let eventsUnchanged = 0;
      for (const event of envelope.events) {
        const existing = existingEvents.get(event.id);
        if (existing === undefined) toAppend.push(event);
        else if (same(existing, event)) eventsUnchanged++;
        else conflicts.push({ kind: "event", id: event.id, resolution: "kept-existing" });
      }
      await tx.appendEvents(toAppend);

      const existingProvenance = await tx.provenance();
      let provenanceAdded = 0;
      for (const entry of envelope.provenance) {
        if (!existingProvenance.some((p) => same(p, entry))) {
          await tx.appendProvenance(entry);
          provenanceAdded++;
        }
      }

      const incomingLegacy = envelope.legacy?.appSettings;
      if (incomingLegacy !== undefined) {
        const existingLegacy = await tx.legacyAppSettings();
        if (existingLegacy === undefined) await tx.putLegacyAppSettings(incomingLegacy);
        else if (!same(existingLegacy, incomingLegacy)) conflicts.push({ kind: "legacyAppSettings", id: "legacy.appSettings", resolution: "kept-existing" });
      }
      if (envelope.settings !== undefined && (await tx.settings()) === undefined) await tx.putSettings(envelope.settings);

      // Read back before committing: every expected record must be there, exactly.
      const stored = await tx.letterPairs();
      if (stored.length !== expectedPairs.size || stored.some((p) => !same(p, expectedPairs.get(p.id)))) {
        throw new VerifyError(`letter pairs read back: ${stored.length}, expected ${expectedPairs.size}`);
      }
      const storedEvents = await tx.events();
      if (storedEvents.length !== existingEvents.size + toAppend.length) {
        throw new VerifyError(`events read back: ${storedEvents.length}, expected ${existingEvents.size + toAppend.length}`);
      }
      return {
        letterPairs: { inserted: pairsInserted, unchanged: pairsUnchanged },
        events: { inserted: toAppend.length, unchanged: eventsUnchanged },
        conflicts,
        stayedDeleted,
        provenanceAdded,
      } satisfies ImportSummary;
    });
    return { ok: true, summary, envelope };
  } catch (error) {
    if (error instanceof VerifyError) return { ok: false, error: { code: "verify-failed", detail: error.message } };
    throw error;
  }
}

class VerifyError extends Error {}
