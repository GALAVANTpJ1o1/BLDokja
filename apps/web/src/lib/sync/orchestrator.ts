import { currentAccountId } from "@/lib/storage-client";
import { pullNewEvents, pushOutboxEvents } from "./events";
import { reconcileLetterPairs, type LetterPairConflict } from "./pairs";
import { syncSettings } from "./settings";

/**
 * One of the plan's own required sync states (v2 §F): "Saved locally / Syncing / Synced /
 * Offline; changes queued / Sign-in required to resume sync / Sync failed; retry available /
 * Upload blocked by a limit". `image-upload-blocked` isn't reachable yet -- there is no image
 * upload path wired up (that needs Storage integration, not built in this pass) -- kept here so the
 * type already has a place for it once that exists, rather than adding a breaking union member later.
 */
export type SyncStatus = "sign-in-required" | "offline" | "syncing" | "synced" | "failed" | "image-upload-blocked";

export interface SyncCycleResult {
  readonly status: SyncStatus;
  readonly eventsPushed: number;
  readonly eventsPulled: number;
  readonly pairsPushed: number;
  readonly pairsPulled: number;
  readonly pairConflicts: readonly LetterPairConflict[];
  readonly settingsSynced: boolean;
}

const IDLE_RESULT: Omit<SyncCycleResult, "status"> = { eventsPushed: 0, eventsPulled: 0, pairsPushed: 0, pairsPulled: 0, pairConflicts: [], settingsSynced: false };

/**
 * Runs one full sync pass: events (outbox push and pull), letter pairs (full reconciliation),
 * settings (merge). All four run concurrently -- there's no ordering dependency between them, and
 * push/pull for events are each independently id-/cursor-idempotent, so it doesn't matter whether
 * this device's own just-pushed event is also seen by the concurrent pull or only picked up next
 * cycle; either way nothing is lost or duplicated. Each piece already fails independently and
 * reports its own `failed` flag rather than throwing, so one piece erroring never stops the others
 * from running -- the plan's own "explicit partial-failure handling" requirement (v2 §F).
 */
export async function runSyncCycle(): Promise<SyncCycleResult> {
  if (currentAccountId() === undefined) return { status: "sign-in-required", ...IDLE_RESULT };
  if (typeof navigator !== "undefined" && !navigator.onLine) return { status: "offline", ...IDLE_RESULT };

  const [eventsPush, eventsPull, pairs, settings] = await Promise.all([pushOutboxEvents(), pullNewEvents(), reconcileLetterPairs(), syncSettings()]);

  const failed = eventsPush.failed || eventsPull.failed || pairs.failed || settings.failed;
  return {
    status: failed ? "failed" : "synced",
    eventsPushed: eventsPush.pushed,
    eventsPulled: eventsPull.pulled,
    pairsPushed: pairs.pushed,
    pairsPulled: pairs.pulled,
    pairConflicts: pairs.conflicts,
    settingsSynced: settings.synced,
  };
}
