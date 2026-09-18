import { canonicalJson, LetterPairSchema, type LetterPair } from "@bld/storage";
import { currentAccountId, getStorage } from "@/lib/storage-client";
import { getSupabase } from "@/lib/supabase-client";
import { sha256Hex } from "@/lib/hash";
import { getPairTracking, setPairTracking, type PairSyncState, type PairTracking } from "./pairs-tracking";

interface RemoteRow {
  readonly id: string;
  readonly rev: number;
  readonly data: unknown;
  readonly deleted_at: string | null;
}

interface UpsertResult {
  readonly data: readonly { rev: number }[] | null;
  readonly error: { message: string } | null;
}

/** The slice of the Supabase client this module calls -- see events.ts's EventsSyncClient for why this is narrower than the real SupabaseClient type. */
export interface PairsSyncClient {
  from(table: "sync_letter_pairs"): {
    select(columns: string): PromiseLike<{ data: readonly RemoteRow[] | null; error: { message: string } | null }>;
    insert(row: { id: string; user_id: string; data: unknown }): { select(columns: string): PromiseLike<UpsertResult> };
    update(patch: { data?: unknown; deleted_at?: string }): {
      eq(column: string, value: string): {
        eq(column: string, value: number): { select(columns: string): PromiseLike<UpsertResult> };
      };
    };
  };
}

export interface LetterPairConflict {
  readonly id: string;
  readonly local: LetterPair;
  readonly remote: LetterPair;
  /** The server's rev for `remote` at detection time -- resolveLetterPairConflict() needs this as the expected rev for its own optimistic-concurrency update. */
  readonly remoteRev: number;
}

export interface ReconcileLetterPairsResult {
  readonly pushed: number;
  readonly pulled: number;
  readonly failed: boolean;
  /** Both sides changed since the last sync. Neither is overwritten; the local copy stays active until the user resolves it -- there is no UI for that yet (see docs/DECISIONS.md). */
  readonly conflicts: readonly LetterPairConflict[];
}

/**
 * A full reconciliation, not an outbox drain: letter pairs are a small, bounded set (at most the
 * 576-cell grid), so comparing every local pair's content hash against what was last known synced is
 * cheap, and -- unlike events, which are unbounded and append-only -- it means no write call site
 * ever needs to remember to flag a pair dirty. One remote fetch covers both directions.
 */
export async function reconcileLetterPairs(client: PairsSyncClient = getSupabase()): Promise<ReconcileLetterPairsResult> {
  const accountId = currentAccountId();
  if (accountId === undefined) return { pushed: 0, pulled: 0, failed: false, conflicts: [] };

  const storage = getStorage();
  const localPairs = await storage.letterPairs();
  const localById = new Map(localPairs.map((p) => [p.id, p]));
  const localHashes = new Map<string, string>();
  for (const pair of localPairs) localHashes.set(pair.id, await sha256Hex(canonicalJson(pair)));

  const tracking = getPairTracking();
  const nextTracking: Record<string, PairSyncState> = { ...tracking };
  const conflictIds = new Set<string>();
  const conflicts: LetterPairConflict[] = [];

  const { data: remoteRows, error: fetchError } = await client.from("sync_letter_pairs").select("id, rev, data, deleted_at");
  if (fetchError) return { pushed: 0, pulled: 0, failed: true, conflicts: [] };
  const remoteById = new Map((remoteRows ?? []).map((r) => [r.id, r]));

  let pulled = 0;
  let pushed = 0;
  let failed = false;

  // Pull: apply remote versions this device doesn't have yet.
  for (const row of remoteById.values()) {
    const tracked = tracking[row.id];
    if (tracked !== undefined && tracked.rev >= row.rev) continue;

    const local = localById.get(row.id);
    const localHash = local === undefined ? undefined : localHashes.get(row.id);
    const locallyChanged = tracked === undefined ? local !== undefined : localHash !== tracked.hash;

    if (row.deleted_at !== null) {
      if (local !== undefined && locallyChanged) {
        conflicts.push({ id: row.id, local, remote: row.data as LetterPair, remoteRev: row.rev });
        conflictIds.add(row.id);
      } else if (local !== undefined) {
        await storage.deleteLetterPair(row.id, row.deleted_at);
      }
      nextTracking[row.id] = { rev: row.rev, hash: "", deleted: true };
      pulled++;
      continue;
    }

    if (locallyChanged && local !== undefined) {
      conflicts.push({ id: row.id, local, remote: row.data as LetterPair, remoteRev: row.rev });
      conflictIds.add(row.id);
      continue;
    }

    const parsed = LetterPairSchema.safeParse(row.data);
    if (!parsed.success) continue; // Corrupt or foreign remote row: skip it rather than crash the whole reconciliation.
    await storage.putLetterPair(parsed.data);
    const hash = await sha256Hex(canonicalJson(parsed.data));
    localHashes.set(row.id, hash);
    nextTracking[row.id] = { rev: row.rev, hash, deleted: false };
    pulled++;
  }

  // Push: send local creations, edits and deletions the server doesn't have yet.
  for (const pair of localPairs) {
    if (conflictIds.has(pair.id)) continue; // Never push over an unresolved conflict.
    const hash = localHashes.get(pair.id) ?? (await sha256Hex(canonicalJson(pair)));
    const tracked = nextTracking[pair.id];
    if (tracked !== undefined && !tracked.deleted && tracked.hash === hash) continue;

    if (tracked === undefined) {
      const { data, error } = await client.from("sync_letter_pairs").insert({ id: pair.id, user_id: accountId, data: pair }).select("rev");
      if (error) { failed = true; continue; }
      const rev = data?.[0]?.rev;
      if (rev !== undefined) { nextTracking[pair.id] = { rev, hash, deleted: false }; pushed++; }
      continue;
    }

    const { data, error } = await client.from("sync_letter_pairs").update({ data: pair }).eq("id", pair.id).eq("rev", tracked.rev).select("rev");
    if (error) { failed = true; continue; }
    if (data === null || data.length === 0) {
      const remote = remoteById.get(pair.id);
      if (remote !== undefined) { conflicts.push({ id: pair.id, local: pair, remote: remote.data as LetterPair, remoteRev: remote.rev }); conflictIds.add(pair.id); }
      continue;
    }
    const rev = data[0]?.rev;
    if (rev !== undefined) { nextTracking[pair.id] = { rev, hash, deleted: false }; pushed++; }
  }

  // Push deletions: a pair this device knows was synced, but which is no longer in local storage.
  for (const [id, tracked] of Object.entries(tracking)) {
    if (localById.has(id) || tracked.deleted || conflictIds.has(id)) continue;
    const current = nextTracking[id] ?? tracked;
    const { data, error } = await client.from("sync_letter_pairs").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("rev", current.rev).select("rev");
    if (error) { failed = true; continue; }
    if (data === null || data.length === 0) continue; // Someone else changed it since; leave it for the next reconciliation to reconsider.
    const rev = data[0]?.rev;
    if (rev !== undefined) { nextTracking[id] = { rev, hash: current.hash, deleted: true }; pushed++; }
  }

  setPairTracking(nextTracking);
  return { pushed, pulled, failed, conflicts };
}

export interface ResolveConflictResult {
  readonly ok: boolean;
  /** True if someone else changed the pair again between detecting this conflict and resolving it -- rare, but possible with more than two devices. The caller should re-run reconcileLetterPairs() to see the fresh state rather than retry blindly. */
  readonly staleAgain: boolean;
}

/**
 * Resolves a reported conflict by picking one side outright -- there is no field-level merge UI,
 * matching how far this pass of the sync engine goes (see docs/DECISIONS.md). "local" pushes the
 * user's local edit over the server's version, using the rev captured at detection time as the
 * expected rev; "remote" applies the server's version locally and updates tracking to match, so the
 * next reconciliation stops re-reporting this pair.
 */
export async function resolveLetterPairConflict(conflict: LetterPairConflict, choice: "local" | "remote", client: PairsSyncClient = getSupabase()): Promise<ResolveConflictResult> {
  const accountId = currentAccountId();
  if (accountId === undefined) return { ok: false, staleAgain: false };
  const storage = getStorage();
  const tracking = getPairTracking();

  if (choice === "remote") {
    await storage.putLetterPair(conflict.remote);
    const hash = await sha256Hex(canonicalJson(conflict.remote));
    setPairTracking({ ...tracking, [conflict.id]: { rev: conflict.remoteRev, hash, deleted: false } });
    return { ok: true, staleAgain: false };
  }

  const { data, error } = await client.from("sync_letter_pairs").update({ data: conflict.local }).eq("id", conflict.id).eq("rev", conflict.remoteRev).select("rev");
  if (error) return { ok: false, staleAgain: false };
  if (data === null || data.length === 0) return { ok: false, staleAgain: true };
  const rev = data[0]?.rev;
  if (rev === undefined) return { ok: false, staleAgain: false };
  const hash = await sha256Hex(canonicalJson(conflict.local));
  setPairTracking({ ...tracking, [conflict.id]: { rev, hash, deleted: false } });
  return { ok: true, staleAgain: false };
}

export type { PairTracking };
