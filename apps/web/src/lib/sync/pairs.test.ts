// @vitest-environment jsdom
import { canonicalJson, type LetterPair } from "@bld/storage";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sha256Hex } from "@/lib/hash";
import type { PairsSyncClient } from "./pairs";

interface FakeRow {
  id: string;
  rev: number;
  data: unknown;
  deleted_at: string | null;
}

/** A fake server table (plus a fake Storage bucket) for sync_letter_pairs, wide enough to satisfy PairsSyncClient's chain. */
function fakeClient(initialRows: FakeRow[] = []) {
  const rows = new Map(initialRows.map((r) => [r.id, { ...r }]));
  const bucket = new Map<string, { bytes: Uint8Array<ArrayBuffer>; contentType: string }>();
  let failNextFetch = false;
  let failNextUpload = false;

  const client: PairsSyncClient = {
    from: () => ({
      select: () => {
        if (failNextFetch) return Promise.resolve({ data: null, error: { message: "boom" } });
        return Promise.resolve({ data: [...rows.values()], error: null });
      },
      insert: (row) => ({
        select: () => {
          if (rows.has(row.id)) return Promise.resolve({ data: null, error: { message: "duplicate" } });
          rows.set(row.id, { id: row.id, rev: 1, data: row.data, deleted_at: null });
          return Promise.resolve({ data: [{ rev: 1 }], error: null });
        },
      }),
      update: (patch) => ({
        eq: (_col1: string, id: string) => ({
          eq: (_col2: string, expectedRev: number) => ({
            select: () => {
              const existing = rows.get(id);
              if (existing === undefined || existing.rev !== expectedRev) return Promise.resolve({ data: [], error: null });
              const updated: FakeRow = { ...existing, rev: existing.rev + 1, data: patch.data ?? existing.data, deleted_at: patch.deleted_at ?? existing.deleted_at };
              rows.set(id, updated);
              return Promise.resolve({ data: [{ rev: updated.rev }], error: null });
            },
          }),
        }),
      }),
    }),
    storage: {
      from: () => ({
        upload: (path, body, options) => {
          if (failNextUpload) return Promise.resolve({ error: { message: "upload failed" } });
          bucket.set(path, { bytes: body, contentType: options.contentType });
          return Promise.resolve({ error: null });
        },
        download: (path) => {
          const object = bucket.get(path);
          if (object === undefined) return Promise.resolve({ data: null, error: { message: "not found" } });
          return Promise.resolve({ data: new Blob([object.bytes], { type: object.contentType }), error: null });
        },
      }),
    },
  };

  return { client, rows, bucket, failNextFetchOnce: () => { failNextFetch = true; }, failNextUploadOnce: () => { failNextUpload = true; } };
}

const pair = (id: string, notes: string): LetterPair => ({ id, first: id[0] ?? "", second: id[1] ?? "", images: [], notes });

describe("reconcileLetterPairs", () => {
  let setActiveAccount: typeof import("@/lib/storage-client").setActiveAccount;
  let getStorage: typeof import("@/lib/storage-client").getStorage;
  let reconcileLetterPairs: typeof import("./pairs").reconcileLetterPairs;

  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();
    ({ setActiveAccount, getStorage } = await import("@/lib/storage-client"));
    ({ reconcileLetterPairs } = await import("./pairs"));
    setActiveAccount("acct-pairs-1");
  });

  it("does nothing for a guest", async () => {
    setActiveAccount(undefined);
    const { client, rows } = fakeClient();
    const result = await reconcileLetterPairs(client);
    expect(result).toEqual({ pushed: 0, pulled: 0, failed: false, conflicts: [] });
    expect(rows.size).toBe(0);
  });

  it("pushes a new local pair as an insert", async () => {
    await getStorage().putLetterPair(pair("AB", "first"));
    const { client, rows } = fakeClient();

    const result = await reconcileLetterPairs(client);

    expect(result).toEqual({ pushed: 1, pulled: 0, failed: false, conflicts: [] });
    expect(rows.get("AB")?.data).toEqual(pair("AB", "first"));
  });

  it("a second reconciliation with no changes pushes and pulls nothing", async () => {
    await getStorage().putLetterPair(pair("AB", "first"));
    const { client } = fakeClient();
    await reconcileLetterPairs(client);

    const second = await reconcileLetterPairs(client);
    expect(second).toEqual({ pushed: 0, pulled: 0, failed: false, conflicts: [] });
  });

  it("pushes an edit made after a prior sync, using optimistic concurrency", async () => {
    await getStorage().putLetterPair(pair("AB", "first"));
    const { client, rows } = fakeClient();
    await reconcileLetterPairs(client);

    await getStorage().putLetterPair(pair("AB", "edited"));
    const result = await reconcileLetterPairs(client);

    expect(result).toEqual({ pushed: 1, pulled: 0, failed: false, conflicts: [] });
    expect(rows.get("AB")?.data).toEqual(pair("AB", "edited"));
    expect(rows.get("AB")?.rev).toBe(2);
  });

  it("pulls a pair that exists remotely but not locally", async () => {
    const remote = pair("CD", "from another device");
    const { client } = fakeClient([{ id: "CD", rev: 1, data: remote, deleted_at: null }]);

    const result = await reconcileLetterPairs(client);

    expect(result).toEqual({ pushed: 0, pulled: 1, failed: false, conflicts: [] });
    expect(await getStorage().letterPair("CD")).toEqual(remote);
  });

  it("a conflicting edit on both sides is reported, and the local edit is never overwritten", async () => {
    await getStorage().putLetterPair(pair("AB", "first"));
    const { client, rows } = fakeClient();
    await reconcileLetterPairs(client);

    // Another device edits it (bumping the server rev independently of this device).
    const remoteEdit = pair("AB", "changed elsewhere");
    const existing = rows.get("AB");
    if (existing !== undefined) rows.set("AB", { ...existing, rev: existing.rev + 1, data: remoteEdit });

    // This device also edits it locally, unaware of the remote change.
    await getStorage().putLetterPair(pair("AB", "changed here"));

    const result = await reconcileLetterPairs(client);

    expect(result.failed).toBe(false);
    expect(result.conflicts).toEqual([{ id: "AB", local: pair("AB", "changed here"), remote: remoteEdit, remoteRev: 2 }]);
    // The local copy is untouched -- never silently overwritten by the remote edit.
    expect(await getStorage().letterPair("AB")).toEqual(pair("AB", "changed here"));
    // And the conflicting local edit was not pushed over the remote one either.
    expect(rows.get("AB")?.data).toEqual(remoteEdit);
  });

  it("a local deletion is pushed as a soft delete", async () => {
    await getStorage().putLetterPair(pair("AB", "first"));
    const { client, rows } = fakeClient();
    await reconcileLetterPairs(client);

    await getStorage().deleteLetterPair("AB", "2026-09-18T00:00:00Z");
    const result = await reconcileLetterPairs(client);

    expect(result).toEqual({ pushed: 1, pulled: 0, failed: false, conflicts: [] });
    expect(rows.get("AB")?.deleted_at).not.toBeNull();
  });

  it("a remote deletion with no local changes is applied locally", async () => {
    await getStorage().putLetterPair(pair("AB", "first"));
    const { client, rows } = fakeClient();
    await reconcileLetterPairs(client);

    const existing = rows.get("AB");
    if (existing !== undefined) rows.set("AB", { ...existing, rev: existing.rev + 1, deleted_at: "2026-09-18T00:00:00Z" });

    const result = await reconcileLetterPairs(client);

    expect(result.pulled).toBe(1);
    expect(await getStorage().letterPair("AB")).toBeUndefined();
  });

  it("a remote deletion while this device has an unsynced local edit is a conflict, not a silent resurrection or a silent delete", async () => {
    await getStorage().putLetterPair(pair("AB", "first"));
    const { client, rows } = fakeClient();
    await reconcileLetterPairs(client);

    const existing = rows.get("AB");
    if (existing !== undefined) rows.set("AB", { ...existing, rev: existing.rev + 1, deleted_at: "2026-09-18T00:00:00Z" });
    await getStorage().putLetterPair(pair("AB", "edited after the other device deleted it"));

    const result = await reconcileLetterPairs(client);

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.id).toBe("AB");
    // Not deleted locally, and not resurrected server-side either -- left for the user to resolve.
    expect(await getStorage().letterPair("AB")).toEqual(pair("AB", "edited after the other device deleted it"));
  });

  it("skips a corrupt remote row instead of crashing the whole reconciliation", async () => {
    const good = pair("EF", "fine");
    const { client } = fakeClient([
      { id: "BAD", rev: 1, data: { not: "a letter pair" }, deleted_at: null },
      { id: "EF", rev: 1, data: good, deleted_at: null },
    ]);

    const result = await reconcileLetterPairs(client);

    expect(result.failed).toBe(false);
    expect(await getStorage().letterPair("EF")).toEqual(good);
    expect(await getStorage().letterPair("BAD")).toBeUndefined();
  });

  it("reports failure when the initial fetch errors, touching nothing", async () => {
    await getStorage().putLetterPair(pair("AB", "first"));
    const { client, failNextFetchOnce } = fakeClient();
    failNextFetchOnce();

    const result = await reconcileLetterPairs(client);

    expect(result).toEqual({ pushed: 0, pulled: 0, failed: true, conflicts: [] });
  });

  it("content hashing is stable via canonicalJson regardless of key order", async () => {
    const a = { id: "AB", first: "A", second: "B", images: [], notes: "x" };
    const b = { notes: "x", images: [], second: "B", first: "A", id: "AB" };
    expect(await sha256Hex(canonicalJson(a))).toBe(await sha256Hex(canonicalJson(b)));
  });
});

describe("resolveLetterPairConflict", () => {
  let setActiveAccount: typeof import("@/lib/storage-client").setActiveAccount;
  let getStorage: typeof import("@/lib/storage-client").getStorage;
  let reconcileLetterPairs: typeof import("./pairs").reconcileLetterPairs;
  let resolveLetterPairConflict: typeof import("./pairs").resolveLetterPairConflict;

  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();
    ({ setActiveAccount, getStorage } = await import("@/lib/storage-client"));
    ({ reconcileLetterPairs, resolveLetterPairConflict } = await import("./pairs"));
    setActiveAccount("acct-resolve-1");
  });

  async function setUpConflict(client: ReturnType<typeof fakeClient>["client"], rows: ReturnType<typeof fakeClient>["rows"]) {
    await getStorage().putLetterPair(pair("AB", "first"));
    await reconcileLetterPairs(client);
    const existing = rows.get("AB");
    if (existing !== undefined) rows.set("AB", { ...existing, rev: existing.rev + 1, data: pair("AB", "changed elsewhere") });
    await getStorage().putLetterPair(pair("AB", "changed here"));
    const result = await reconcileLetterPairs(client);
    const conflict = result.conflicts[0];
    if (conflict === undefined) throw new Error("expected a conflict to be set up");
    return conflict;
  }

  it("'remote' applies the server's version locally and stops the pair from being reported again", async () => {
    const { client, rows } = fakeClient();
    const conflict = await setUpConflict(client, rows);

    const outcome = await resolveLetterPairConflict(conflict, "remote", client);

    expect(outcome).toEqual({ ok: true, staleAgain: false });
    expect(await getStorage().letterPair("AB")).toEqual(pair("AB", "changed elsewhere"));
    const again = await reconcileLetterPairs(client);
    expect(again.conflicts).toEqual([]);
  });

  it("'local' pushes the local edit over the server's version, using the rev captured at detection time", async () => {
    const { client, rows } = fakeClient();
    const conflict = await setUpConflict(client, rows);

    const outcome = await resolveLetterPairConflict(conflict, "local", client);

    expect(outcome).toEqual({ ok: true, staleAgain: false });
    expect(rows.get("AB")?.data).toEqual(pair("AB", "changed here"));
    // Local storage already had the local edit (never touched during the conflict); resolving
    // "local" doesn't need to write it again, only to make the server and tracking agree with it.
    expect(await getStorage().letterPair("AB")).toEqual(pair("AB", "changed here"));
    const again = await reconcileLetterPairs(client);
    expect(again.conflicts).toEqual([]);
    expect(again.pushed).toBe(0); // already in sync -- nothing left to push
  });

  it("reports staleAgain when a third change landed between detecting and resolving the conflict", async () => {
    const { client, rows } = fakeClient();
    const conflict = await setUpConflict(client, rows);
    const existing = rows.get("AB");
    if (existing !== undefined) rows.set("AB", { ...existing, rev: existing.rev + 1, data: pair("AB", "yet another change") });

    const outcome = await resolveLetterPairConflict(conflict, "local", client);

    expect(outcome).toEqual({ ok: false, staleAgain: true });
  });

  it("does nothing for a guest", async () => {
    setActiveAccount(undefined);
    const { client } = fakeClient();
    const outcome = await resolveLetterPairConflict({ id: "AB", local: pair("AB", "x"), remote: pair("AB", "y"), remoteRev: 1 }, "local", client);
    expect(outcome).toEqual({ ok: false, staleAgain: false });
  });
});

describe("image sync", () => {
  // A minimal, real 1x1 transparent PNG -- small enough to embed here, but genuinely decodable,
  // so dataUrlToBytes/bytesToDataUrl round-trip a real image, not a stand-in string.
  const ONE_PIXEL_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

  let setActiveAccount: typeof import("@/lib/storage-client").setActiveAccount;
  let getStorage: typeof import("@/lib/storage-client").getStorage;
  let reconcileLetterPairs: typeof import("./pairs").reconcileLetterPairs;

  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();
    ({ setActiveAccount, getStorage } = await import("@/lib/storage-client"));
    ({ reconcileLetterPairs } = await import("./pairs"));
    setActiveAccount("acct-images-1");
  });

  const pairWithImage = (id: string, asset: string): LetterPair => ({ id, first: id[0] ?? "", second: id[1] ?? "", images: [{ id: `img-${id}`, text: "picture", uses: 1, asset }] });

  it("uploads an inline image to Storage instead of sending it in the row, and the row carries only a reference", async () => {
    await getStorage().putLetterPair(pairWithImage("AB", ONE_PIXEL_PNG));
    const { client, rows, bucket } = fakeClient();

    const result = await reconcileLetterPairs(client);

    expect(result).toEqual({ pushed: 1, pulled: 0, failed: false, conflicts: [] });
    expect(bucket.size).toBe(1);
    const stored = rows.get("AB")?.data as { images: { asset?: unknown; assetStoragePath?: unknown; assetMime?: unknown }[] };
    expect(stored.images[0]?.asset).toBeUndefined();
    expect(stored.images[0]?.assetStoragePath).toBe("acct-images-1/AB/img-AB.png");
    expect(stored.images[0]?.assetMime).toBe("image/png");
  });

  it("round-trips the exact image bytes down to another device", async () => {
    await getStorage().putLetterPair(pairWithImage("AB", ONE_PIXEL_PNG));
    const { client } = fakeClient();
    await reconcileLetterPairs(client);

    // A second device starts with nothing local and pulls.
    setActiveAccount("acct-images-2");
    const result = await reconcileLetterPairs(client);

    expect(result.pulled).toBe(1);
    const pulled = await getStorage().letterPair("AB");
    expect(pulled?.images[0]?.asset).toBe(ONE_PIXEL_PNG);
  });

  it("keeps the inline asset (and still pushes the row) when the image upload itself fails", async () => {
    await getStorage().putLetterPair(pairWithImage("AB", ONE_PIXEL_PNG));
    const { client, rows, failNextUploadOnce } = fakeClient();
    failNextUploadOnce();

    const result = await reconcileLetterPairs(client);

    expect(result.pushed).toBe(1);
    const stored = rows.get("AB")?.data as { images: { asset?: unknown }[] };
    expect(stored.images[0]?.asset).toBe(ONE_PIXEL_PNG); // fell back to inline rather than losing the image
  });

  it("skips a row (rather than corrupting it) when the referenced image fails to download", async () => {
    await getStorage().putLetterPair(pairWithImage("AB", ONE_PIXEL_PNG));
    const { client } = fakeClient();
    await reconcileLetterPairs(client);

    setActiveAccount("acct-images-3");
    // Simulate the object having vanished from Storage (or a network failure) by using a client
    // whose bucket doesn't actually have the uploaded object -- a fresh fakeClient sharing the same
    // rows but an empty bucket.
    const rowsSnapshot = [...(await (async () => { const r = await client.from("sync_letter_pairs").select("*"); return r.data ?? []; })())];
    const { client: brokenClient } = fakeClient(rowsSnapshot.map((r) => ({ id: r.id, rev: r.rev, data: r.data, deleted_at: r.deleted_at })));

    const result = await reconcileLetterPairs(brokenClient);

    expect(result.pulled).toBe(0);
    expect(await getStorage().letterPair("AB")).toBeUndefined();
  });
});
