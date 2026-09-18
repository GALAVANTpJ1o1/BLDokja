import { z } from "zod";
import { currentAccountId } from "@/lib/storage-client";

/**
 * What this device last knew the server's state of one letter pair to be: the rev it last pushed or
 * pulled, and a content hash (not the pair's full data -- some pairs carry a 2.8MB embedded image,
 * and localStorage's whole-origin quota is a few MB total) used to detect "has this pair actually
 * changed locally since we last synced it" without needing to hook every write call site (there are
 * more than one -- use-library.ts and memory-workspace.tsx both call putLetterPair independently,
 * and a hook-based approach would only be as robust as the least-remembered call site).
 */
const PairSyncStateSchema = z.object({ rev: z.number().int().nonnegative(), hash: z.string(), deleted: z.boolean() }).strict();
const TrackingSchema = z.record(z.string(), PairSyncStateSchema);

export type PairSyncState = z.infer<typeof PairSyncStateSchema>;
export type PairTracking = z.infer<typeof TrackingSchema>;

function trackingKey(accountId: string): string {
  return `bld.sync.pairs.${accountId}`;
}

export function getPairTracking(): PairTracking {
  const accountId = currentAccountId();
  if (accountId === undefined) return {};
  try {
    const raw = localStorage.getItem(trackingKey(accountId));
    if (raw === null) return {};
    const parsed = TrackingSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export function setPairTracking(tracking: PairTracking): void {
  const accountId = currentAccountId();
  if (accountId === undefined) return;
  try {
    localStorage.setItem(trackingKey(accountId), JSON.stringify(tracking));
  } catch {
    // Blocked storage: the next reconciliation just re-diffs everything against a fresh remote
    // fetch, which is safe (idempotent) even though it re-checks pairs that hadn't actually changed.
  }
}
