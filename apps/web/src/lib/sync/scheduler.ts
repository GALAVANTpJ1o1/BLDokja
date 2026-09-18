import { runSyncCycle, type SyncCycleResult } from "./orchestrator";

const LOCK_NAME = "bldokja-sync-cycle";

/**
 * Multi-tab coordination (v2 §F): if two tabs of the same account both fire a sync cycle at once,
 * only one should actually do the work. `navigator.locks` with `ifAvailable: true` is a natural fit
 * -- whichever tab gets the lock runs the cycle; the other tab's `lock` callback argument is `null`
 * and it skips this round entirely rather than doing redundant work (each cycle is still safe to run
 * from multiple tabs, since every underlying operation is idempotent -- this is purely to avoid
 * wasted API calls, not a correctness requirement).
 *
 * Where the Locks API isn't available (an older browser), this just runs directly: a little
 * redundant work across tabs is a safe degradation, not a data-safety problem, given that
 * idempotency.
 */
export async function runSyncCycleCoordinated(): Promise<SyncCycleResult | undefined> {
  if (typeof navigator === "undefined" || !("locks" in navigator)) return runSyncCycle();

  let result: SyncCycleResult | undefined;
  try {
    await navigator.locks.request(LOCK_NAME, { ifAvailable: true }, async (lock) => {
      if (lock === null) return; // Another tab already holds it this round; skip rather than duplicate the work.
      result = await runSyncCycle();
    });
  } catch {
    // The Locks API exists but errored (rare, e.g. a browser policy blocking it): fall back to
    // running directly so a lock failure can never mean "never syncs" on a single-tab session.
    result = await runSyncCycle();
  }
  return result;
}
