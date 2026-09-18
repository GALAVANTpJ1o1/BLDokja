// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventsSyncClient } from "./events";

/**
 * A fake just wide enough to satisfy EventsSyncClient's chain -- narrower than mocking the real
 * (heavily generic) SupabaseClient. `rows` is the fake server's whole sync_events table, so pull
 * tests can seed it directly and push tests can inspect what got upserted.
 */
function fakeClient(initialRows: { server_seq: number; payload: unknown; id?: string }[] = []) {
  const rows = [...initialRows];
  let nextSeq = rows.length > 0 ? Math.max(...rows.map((r) => r.server_seq)) + 1 : 1;
  const upserts: unknown[][] = [];
  let failNextUpsert = false;
  let failNextSelect = false;

  const client: EventsSyncClient = {
    from: () => ({
      upsert: (newRows) => {
        upserts.push(newRows as unknown[]);
        if (failNextUpsert) return Promise.resolve({ error: { message: "boom" } });
        for (const r of newRows) {
          if (!rows.some((existing) => existing.id === r.id)) rows.push({ server_seq: nextSeq++, payload: r.payload, id: r.id });
        }
        return Promise.resolve({ error: null });
      },
      select: () => ({
        gt: (_col, cursor: number) => ({
          order: () => ({
            limit: (n: number) => {
              if (failNextSelect) return Promise.resolve({ data: null, error: { message: "boom" } });
              const page = rows.filter((r) => r.server_seq > cursor).sort((a, b) => a.server_seq - b.server_seq).slice(0, n);
              return Promise.resolve({ data: page.map((r) => ({ server_seq: r.server_seq, payload: r.payload })), error: null });
            },
          }),
        }),
      }),
    }),
  };

  return { client, rows, upserts, failNextUpsertOnce: () => { failNextUpsert = true; }, failNextSelectOnce: () => { failNextSelect = true; } };
}

describe("pushOutboxEvents", () => {
  let setActiveAccount: typeof import("@/lib/storage-client").setActiveAccount;
  let getStorage: typeof import("@/lib/storage-client").getStorage;
  let pushOutboxEvents: typeof import("./events").pushOutboxEvents;

  beforeEach(async () => {
    vi.resetModules();
    ({ setActiveAccount, getStorage } = await import("@/lib/storage-client"));
    ({ pushOutboxEvents } = await import("./events"));
    setActiveAccount("acct-1");
  });

  it("does nothing for a guest (no active account)", async () => {
    setActiveAccount(undefined);
    const { client, upserts } = fakeClient();
    const result = await pushOutboxEvents(client);
    expect(result).toEqual({ pushed: 0, failed: false });
    expect(upserts).toHaveLength(0);
  });

  it("pushes queued events and dequeues them on success", async () => {
    const storage = getStorage();
    const event = { id: "e1", type: "drill.attempt" as const, at: "2026-09-18T00:00:00Z", trainer: "trace", caseId: "M", correct: true, responseMs: 500 };
    await storage.appendEvents([event]);
    await storage.enqueueOutbox({ id: "event:e1", kind: "event", recordId: "e1", queuedAt: "2026-09-18T00:00:00Z" });

    const { client, rows } = fakeClient();
    const result = await pushOutboxEvents(client);

    expect(result).toEqual({ pushed: 1, failed: false });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.payload).toEqual(event);
    expect(await storage.outbox()).toEqual([]);
  });

  it("leaves the outbox entry queued (for retry) when the push fails", async () => {
    const storage = getStorage();
    const event = { id: "e2", type: "drill.attempt" as const, at: "2026-09-18T00:00:00Z", trainer: "trace", caseId: "M", correct: false, responseMs: 500 };
    await storage.appendEvents([event]);
    await storage.enqueueOutbox({ id: "event:e2", kind: "event", recordId: "e2", queuedAt: "2026-09-18T00:00:00Z" });

    const { client, failNextUpsertOnce } = fakeClient();
    failNextUpsertOnce();
    const result = await pushOutboxEvents(client);

    expect(result).toEqual({ pushed: 0, failed: true });
    expect((await storage.outbox()).map((e) => e.id)).toEqual(["event:e2"]);
  });

  it("dequeues an outbox entry whose event no longer exists locally, without pushing anything for it", async () => {
    const storage = getStorage();
    await storage.enqueueOutbox({ id: "event:ghost", kind: "event", recordId: "ghost", queuedAt: "2026-09-18T00:00:00Z" });
    const { client, upserts } = fakeClient();

    const result = await pushOutboxEvents(client);

    expect(result).toEqual({ pushed: 0, failed: false });
    expect(upserts).toHaveLength(0);
    expect(await storage.outbox()).toEqual([]);
  });

  it("only pushes outbox entries of kind event, leaving other kinds queued", async () => {
    const storage = getStorage();
    await storage.enqueueOutbox({ id: "settings", kind: "settings", recordId: "settings", queuedAt: "2026-09-18T00:00:00Z" });
    const { client, upserts } = fakeClient();

    await pushOutboxEvents(client);

    expect(upserts).toHaveLength(0);
    expect((await storage.outbox()).map((e) => e.id)).toEqual(["settings"]);
  });
});

describe("pullNewEvents", () => {
  let setActiveAccount: typeof import("@/lib/storage-client").setActiveAccount;
  let getStorage: typeof import("@/lib/storage-client").getStorage;
  let pullNewEvents: typeof import("./events").pullNewEvents;

  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();
    ({ setActiveAccount, getStorage } = await import("@/lib/storage-client"));
    ({ pullNewEvents } = await import("./events"));
    setActiveAccount("acct-2");
  });

  it("merges remote events locally and advances the cursor", async () => {
    const remoteEvent = { id: "r1", type: "drill.attempt", at: "2026-09-18T00:00:00Z", trainer: "trace", caseId: "M", correct: true, responseMs: 400 };
    const { client } = fakeClient([{ server_seq: 5, payload: remoteEvent, id: "r1" }]);

    const result = await pullNewEvents(client);

    expect(result).toEqual({ pulled: 1, failed: false, invalid: 0 });
    expect((await getStorage().events()).map((e) => e.id)).toEqual(["r1"]);
  });

  it("a second pull with nothing new does nothing and is not an error", async () => {
    const remoteEvent = { id: "r2", type: "drill.attempt", at: "2026-09-18T00:00:00Z", trainer: "trace", caseId: "M", correct: true, responseMs: 400 };
    const { client } = fakeClient([{ server_seq: 1, payload: remoteEvent, id: "r2" }]);

    await pullNewEvents(client);
    const second = await pullNewEvents(client);

    expect(second).toEqual({ pulled: 0, failed: false, invalid: 0 });
    expect((await getStorage().events()).map((e) => e.id)).toEqual(["r2"]);
  });

  it("skips a row that doesn't parse as a valid event, without blocking the valid ones in the same page", async () => {
    const good = { id: "ok1", type: "drill.attempt", at: "2026-09-18T00:00:00Z", trainer: "trace", caseId: "M", correct: true, responseMs: 400 };
    const { client } = fakeClient([
      { server_seq: 1, payload: { not: "a valid event" }, id: "bad" },
      { server_seq: 2, payload: good, id: "ok1" },
    ]);

    const result = await pullNewEvents(client);

    expect(result).toEqual({ pulled: 1, failed: false, invalid: 1 });
    expect((await getStorage().events()).map((e) => e.id)).toEqual(["ok1"]);
  });

  it("reports failure and does not move the cursor when the server call errors", async () => {
    const { client, failNextSelectOnce } = fakeClient();
    failNextSelectOnce();

    const result = await pullNewEvents(client);

    expect(result).toEqual({ pulled: 0, failed: true, invalid: 0 });
  });
});
