import { createStorage, exportData, importData, type ExportV1, type ImportResult } from "@bld/storage";
import { dexieBackend } from "@bld/storage/dexie";
import { nowIso } from "@/lib/ids";
import { currentAccountId, getStorage } from "@/lib/storage-client";
import { runSyncCycle, type SyncCycleResult } from "./orchestrator";

/** The one local database name every guest install has always used (dexie-backend.ts's own default) -- never renamed, per D-057, so this is exactly what a real pre-v2 install's data lives in. */
const GUEST_DB_NAME = "bldokja";

function guestHasAnyData(guestExport: ExportV1): boolean {
  return guestExport.letterPairs.length > 0 || guestExport.events.length > 0 || guestExport.settings !== undefined;
}

/** A read-only check the UI can make before committing to the full migration flow, e.g. to decide whether to show a "we found existing guest data" prompt at all. */
export async function guestDataExists(): Promise<boolean> {
  if (typeof indexedDB === "undefined") return false;
  const guestBackend = dexieBackend(GUEST_DB_NAME);
  const guestExport = await exportData(createStorage(guestBackend), nowIso());
  guestBackend.close();
  return guestHasAnyData(guestExport);
}

/** The guest's data as a portable export, for an explicit backup download before migrating -- the plan's own "offer an export backup" step (v2 §F). */
export async function exportGuestData(): Promise<ExportV1 | undefined> {
  if (typeof indexedDB === "undefined") return undefined;
  const guestBackend = dexieBackend(GUEST_DB_NAME);
  const guestExport = await exportData(createStorage(guestBackend), nowIso());
  guestBackend.close();
  return guestHasAnyData(guestExport) ? guestExport : undefined;
}

export interface MigrationSummary {
  readonly ok: boolean;
  /** False when the guest database was empty (or unavailable, e.g. memoryBackend()-only environments) -- nothing to migrate, not a failure. */
  readonly guestHadData: boolean;
  readonly importResult?: ImportResult;
  readonly syncResult?: SyncCycleResult;
}

/**
 * Copies the guest's local data into the now-signed-in account's own storage, then runs a sync
 * cycle to push it to the cloud (v2 §F: "initial guest-to-account migration").
 *
 * The guest database is only ever read here, never written or cleared -- "preserve the original
 * local dataset until migration is confirmed" is satisfied by construction, not by a separate
 * safeguard, since nothing in this function has a way to touch it. Clearing it is a deliberate,
 * separate action for the caller to offer once the user has seen this summary and confirmed.
 *
 * Idempotent: importData() already merges by id (insert-if-new, conflict on a differing existing
 * record, never a silent overwrite -- exactly "never silently overwrite a populated cloud account"
 * once that merge reaches the sync engine's own conflict detection), and every sync function is
 * independently idempotent. Re-running this after a partial failure -- a dropped connection
 * mid-sync, say -- re-applies the same merge and re-attempts the sync without double-applying or
 * duplicating anything.
 */
export async function migrateGuestData(): Promise<MigrationSummary> {
  const accountId = currentAccountId();
  if (accountId === undefined) return { ok: false, guestHadData: false };
  if (typeof indexedDB === "undefined") return { ok: true, guestHadData: false }; // No persistent guest database could ever have existed here.

  const guestBackend = dexieBackend(GUEST_DB_NAME);
  const guestStorage = createStorage(guestBackend);
  const guestExport = await exportData(guestStorage, nowIso());
  guestBackend.close();

  if (!guestHasAnyData(guestExport)) return { ok: true, guestHadData: false };

  const accountStorage = getStorage();
  const importResult = await importData(accountStorage, guestExport);
  if (!importResult.ok) return { ok: false, guestHadData: true, importResult };

  // Claim every currently-set settings field as this account's starting point. A guest's settings
  // never carry a syncFieldUpdatedAt stamp (schema.ts: "guests never populate this"), so without
  // this, syncSettings() would see nothing to push and the migrated preferences would silently
  // never reach the cloud, even though they're now sitting in local storage.
  const settings = await accountStorage.settings();
  if (settings !== undefined) {
    const at = nowIso();
    const times = { ...settings.syncFieldUpdatedAt };
    for (const key of Object.keys(settings)) {
      if (key === "syncFieldUpdatedAt" || key === "persistentStorage" || times[key] !== undefined) continue;
      times[key] = at;
    }
    await accountStorage.putSettings({ ...settings, syncFieldUpdatedAt: times });
  }

  const syncResult = await runSyncCycle();
  return { ok: syncResult.status !== "failed", guestHadData: true, importResult, syncResult };
}
