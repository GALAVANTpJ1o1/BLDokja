import { AppEventSchema, type AppEvent, type OutboxEntry } from "@bld/storage";
import { currentAccountId, getStorage } from "@/lib/storage-client";
import { getSupabase } from "@/lib/supabase-client";
import { getSyncCursor, setSyncCursor } from "./cursor";

const PUSH_BATCH_SIZE = 50;
const PULL_PAGE_SIZE = 200;

interface SyncEventRow {
  readonly id: string;
  readonly user_id: string;
  readonly type: string;
  readonly at: string;
  readonly payload: unknown;
}

interface PulledRow {
  readonly server_seq: number;
  readonly payload: unknown;
}

/**
 * The slice of the Supabase client this module actually calls, not the whole SupabaseClient type --
 * lets tests pass a small fake instead of mocking the real (heavily generic) client. A real
 * SupabaseClient satisfies this structurally with no cast needed at the call site.
 */
export interface EventsSyncClient {
  from(table: "sync_events"): {
    upsert(rows: readonly SyncEventRow[], opts: { readonly onConflict: string; readonly ignoreDuplicates: boolean }): PromiseLike<{ error: { message: string } | null }>;
    select(columns: string): {
      gt(column: string, value: number): {
        order(column: string, opts: { readonly ascending: boolean }): {
          limit(n: number): PromiseLike<{ data: readonly PulledRow[] | null; error: { message: string } | null }>;
        };
      };
    };
  };
}

export interface PushEventsResult {
  readonly pushed: number;
  readonly failed: boolean;
}

/**
 * Pushes every queued event outbox entry to sync_events, batched, dequeuing each on success.
 * Idempotent by design: a duplicate id (a retried push after a network blip, or the rare case of an
 * outbox entry surviving past its event already having been pushed) is silently ignored by the
 * server (`ignoreDuplicates`), never a conflict -- this is the same id-based union the local event
 * log already uses (packages/storage/src/storage.ts's appendEvents).
 */
export async function pushOutboxEvents(client: EventsSyncClient = getSupabase()): Promise<PushEventsResult> {
  const accountId = currentAccountId();
  if (accountId === undefined) return { pushed: 0, failed: false };

  const storage = getStorage();
  const outbox = (await storage.outbox()).filter((e): e is OutboxEntry & { kind: "event" } => e.kind === "event");
  if (outbox.length === 0) return { pushed: 0, failed: false };

  const allEvents = await storage.events();
  const byId = new Map(allEvents.map((e) => [e.id, e]));

  // An outbox entry whose event no longer exists locally shouldn't happen -- events are never
  // deleted -- but dequeue it rather than retrying something that can never succeed.
  await Promise.all(outbox.filter((entry) => !byId.has(entry.recordId)).map((entry) => storage.dequeueOutbox(entry.id)));
  const pushable = outbox.filter((entry) => byId.has(entry.recordId));

  let pushed = 0;
  for (let i = 0; i < pushable.length; i += PUSH_BATCH_SIZE) {
    const batch = pushable.slice(i, i + PUSH_BATCH_SIZE);
    const rows: SyncEventRow[] = batch.map((entry) => {
      const event = byId.get(entry.recordId);
      if (event === undefined) throw new Error("unreachable: filtered above");
      return { id: event.id, user_id: accountId, type: event.type, at: event.at, payload: event };
    });

    const { error } = await client.from("sync_events").upsert(rows, { onConflict: "id", ignoreDuplicates: true });
    if (error) return { pushed, failed: true }; // Stop at the first failed batch; retry the whole remaining outbox next cycle.

    await Promise.all(batch.map((entry) => storage.dequeueOutbox(entry.id)));
    pushed += batch.length;
  }

  return { pushed, failed: false };
}

export interface PullEventsResult {
  readonly pulled: number;
  readonly failed: boolean;
  /** Rows that didn't parse as a valid AppEvent -- logged, not applied, never blocking the rest of the page. */
  readonly invalid: number;
}

/** Pulls new events since the local cursor and merges them. appendEvents() is already id-idempotent, so a page re-pulled after a partial failure never double-applies. */
export async function pullNewEvents(client: EventsSyncClient = getSupabase()): Promise<PullEventsResult> {
  const accountId = currentAccountId();
  if (accountId === undefined) return { pulled: 0, failed: false, invalid: 0 };

  const storage = getStorage();
  let cursor = getSyncCursor();
  let pulled = 0;
  let invalid = 0;

  for (;;) {
    const { data, error } = await client.from("sync_events").select("server_seq, payload").gt("server_seq", cursor).order("server_seq", { ascending: true }).limit(PULL_PAGE_SIZE);
    if (error) return { pulled, failed: true, invalid };
    if (data === null || data.length === 0) break;

    // Validated here, at the boundary, rather than relying solely on appendEvents()'s own internal
    // check: that check throws on the first bad record, which would abort this whole page's
    // transaction (including the valid rows in it) rather than skip just the bad one.
    const valid: AppEvent[] = [];
    for (const row of data) {
      const parsed = AppEventSchema.safeParse(row.payload);
      if (parsed.success) valid.push(parsed.data);
      else invalid++;
    }
    if (valid.length > 0) await storage.appendEvents(valid);
    pulled += valid.length;

    const lastRow = data[data.length - 1];
    if (lastRow !== undefined) {
      cursor = lastRow.server_seq;
      setSyncCursor(cursor);
    }
    if (data.length < PULL_PAGE_SIZE) break;
  }

  return { pulled, failed: false, invalid };
}
