// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { createStorage } from "@bld/storage";
import { dexieBackend } from "@bld/storage/dexie";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncCycleResult } from "./orchestrator";

const runSyncCycle = vi.fn<() => Promise<SyncCycleResult>>();
vi.mock("./orchestrator", () => ({ runSyncCycle: () => runSyncCycle() }));

const SYNCED: SyncCycleResult = { status: "synced", eventsPushed: 0, eventsPulled: 0, pairsPushed: 0, pairsPulled: 0, pairConflicts: [], settingsSynced: false };

function openGuestDb() {
  return createStorage(dexieBackend("bldokja"));
}

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  runSyncCycle.mockResolvedValue(SYNCED);
  // Each test gets a clean slate: delete both the fixed guest database and whatever
  // account-namespaced ones a previous test might have left behind.
  const guest = dexieBackend("bldokja");
  await guest.deleteDatabase();
});

describe("guestDataExists / exportGuestData", () => {
  it("reports false / undefined when the guest database has never been written to", async () => {
    const { guestDataExists, exportGuestData } = await import("./migration");
    expect(await guestDataExists()).toBe(false);
    expect(await exportGuestData()).toBeUndefined();
  });

  it("reports true and returns the data once the guest has something saved", async () => {
    const guestStorage = openGuestDb();
    await guestStorage.putLetterPair({ id: "AB", first: "A", second: "B", images: [] });
    const { guestDataExists, exportGuestData } = await import("./migration");

    expect(await guestDataExists()).toBe(true);
    const exported = await exportGuestData();
    expect(exported?.letterPairs.map((p) => p.id)).toEqual(["AB"]);
  });
});

describe("migrateGuestData", () => {
  let setActiveAccount: typeof import("@/lib/storage-client").setActiveAccount;
  let getStorage: typeof import("@/lib/storage-client").getStorage;
  let migrateGuestData: typeof import("./migration").migrateGuestData;

  beforeEach(async () => {
    ({ setActiveAccount, getStorage } = await import("@/lib/storage-client"));
    ({ migrateGuestData } = await import("./migration"));
  });

  it("does nothing for a guest (no signed-in account to migrate into)", async () => {
    setActiveAccount(undefined);
    const result = await migrateGuestData();
    expect(result).toEqual({ ok: false, guestHadData: false });
    expect(runSyncCycle).not.toHaveBeenCalled();
  });

  it("reports guestHadData: false and skips syncing when the guest database is empty", async () => {
    setActiveAccount("acct-migrate-1");
    const result = await migrateGuestData();
    expect(result).toEqual({ ok: true, guestHadData: false });
    expect(runSyncCycle).not.toHaveBeenCalled();
  });

  it("copies guest letter pairs, events and settings into the account's own storage, then syncs", async () => {
    const guestStorage = openGuestDb();
    await guestStorage.putLetterPair({ id: "AB", first: "A", second: "B", images: [], notes: "from guest" });
    await guestStorage.appendEvents([{ id: "e1", type: "drill.attempt", at: "2026-09-18T00:00:00Z", trainer: "trace", caseId: "M", correct: true, responseMs: 500 }]);
    await guestStorage.putSettings({ theme: "dark" });

    setActiveAccount("acct-migrate-2");
    const result = await migrateGuestData();

    expect(result.ok).toBe(true);
    expect(result.guestHadData).toBe(true);
    expect(runSyncCycle).toHaveBeenCalledTimes(1);

    const accountStorage = getStorage();
    expect(await accountStorage.letterPair("AB")).toEqual({ id: "AB", first: "A", second: "B", images: [], notes: "from guest" });
    expect((await accountStorage.events()).map((e) => e.id)).toEqual(["e1"]);
    expect((await accountStorage.settings())?.theme).toBe("dark");
  });

  it("stamps syncFieldUpdatedAt for every migrated settings field, so the first sync actually has something to push", async () => {
    const guestStorage = openGuestDb();
    await guestStorage.putSettings({ theme: "dark", compactLayout: true, persistentStorage: "granted" });

    setActiveAccount("acct-migrate-3");
    await migrateGuestData();

    const times = (await getStorage().settings())?.syncFieldUpdatedAt;
    expect(times?.theme).toBeTypeOf("string");
    expect(times?.compactLayout).toBeTypeOf("string");
    // persistentStorage is a device fact, never claimed for sync (matches settings-provider.tsx's own rule).
    expect(times?.persistentStorage).toBeUndefined();
  });

  it("does not overwrite a settings field the account already has a newer timestamp for", async () => {
    const guestStorage = openGuestDb();
    await guestStorage.putSettings({ theme: "dark" });

    setActiveAccount("acct-migrate-4");
    // Simulate this account already having synced a theme change from another device before migration ran.
    await getStorage().putSettings({ theme: "light", syncFieldUpdatedAt: { theme: "2026-01-01T00:00:00Z" } });

    await migrateGuestData();

    // The pre-existing timestamp is left alone -- migration only fills in *missing* stamps, it
    // never claims a field the account was already tracking.
    expect((await getStorage().settings())?.syncFieldUpdatedAt?.theme).toBe("2026-01-01T00:00:00Z");
  });

  it("never touches the guest database itself -- it stays exactly as it was", async () => {
    const guestStorage = openGuestDb();
    await guestStorage.putLetterPair({ id: "AB", first: "A", second: "B", images: [] });

    setActiveAccount("acct-migrate-5");
    await migrateGuestData();

    expect(await guestStorage.letterPair("AB")).toBeDefined();
  });

  it("is idempotent: running it twice does not duplicate anything or error", async () => {
    const guestStorage = openGuestDb();
    await guestStorage.putLetterPair({ id: "AB", first: "A", second: "B", images: [] });

    setActiveAccount("acct-migrate-6");
    const first = await migrateGuestData();
    const second = await migrateGuestData();

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    const accountStorage = getStorage();
    expect((await accountStorage.letterPairs()).filter((p) => p.id === "AB")).toHaveLength(1);
  });

  it("reports failure (but keeps the local copy) when the sync cycle itself fails", async () => {
    const guestStorage = openGuestDb();
    await guestStorage.putLetterPair({ id: "AB", first: "A", second: "B", images: [] });
    runSyncCycle.mockResolvedValue({ ...SYNCED, status: "failed" });

    setActiveAccount("acct-migrate-7");
    const result = await migrateGuestData();

    expect(result.ok).toBe(false);
    expect(await getStorage().letterPair("AB")).toBeDefined(); // the local copy still landed even though the push failed
  });
});
