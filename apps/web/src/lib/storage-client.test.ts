// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * storage-client.ts keeps its active-account state as module-level singletons (by design: it's the
 * one StorageAdapter the whole app shares). Each test gets a genuinely fresh module instance via
 * resetModules(), rather than relying on setActiveAccount()'s own no-op-when-unchanged guard to
 * "reset" state between tests -- that guard would silently no-op if two tests both started from the
 * same already-set value, leaking one test's storage instance into the next.
 */
async function freshModule() {
  vi.resetModules();
  return import("./storage-client");
}

beforeEach(() => {
  localStorage.clear();
});

describe("account-aware storage naming", () => {
  it("defaults to the original, unnamespaced guest database", async () => {
    const { activeStorageName } = await freshModule();
    expect(activeStorageName()).toBe("bldokja");
  });

  it("switches to an account-namespaced name, and back to guest, reporting whether it actually changed", async () => {
    const { activeStorageName, setActiveAccount } = await freshModule();
    expect(setActiveAccount("user-1")).toBe(true);
    expect(activeStorageName()).toBe("bldokja::account::user-1");

    // Same account again: a no-op, not a second switch.
    expect(setActiveAccount("user-1")).toBe(false);
    expect(activeStorageName()).toBe("bldokja::account::user-1");

    expect(setActiveAccount(undefined)).toBe(true);
    expect(activeStorageName()).toBe("bldokja");
  });

  it("persists the active account across a fresh module load (simulating a page reload)", async () => {
    const first = await freshModule();
    first.setActiveAccount("user-2");
    expect(localStorage.getItem("bld.activeAccountId")).toBe("user-2");

    const second = await freshModule();
    // No setActiveAccount() call here -- the module must read the persisted id at load time, the
    // same way a real page reload would, before anything else has a chance to call getStorage().
    expect(second.activeStorageName()).toBe("bldokja::account::user-2");
  });

  it("switching accounts actually isolates data, not just the database name", async () => {
    // Without indexedDB (not available under vitest's jsdom environment), getStorage() falls back to
    // memoryBackend() -- a plain in-memory Map with no persistence of its own, recreated fresh every
    // time setActiveAccount() resets `instance`. That's enough to prove the isolation half of this
    // (switching away hides the data), but NOT the "switching back restores it" half -- that half
    // depends on Dexie's real on-disk persistence across instance recreation, already covered by
    // packages/storage/test/dexie-upgrade.test.ts, not something a plain in-memory Map can provide.
    const { getStorage, setActiveAccount } = await freshModule();

    setActiveAccount("user-a");
    await getStorage().putLetterPair({ id: "AB", first: "A", second: "B", images: [] });
    expect(await getStorage().letterPair("AB")).toBeDefined();

    setActiveAccount("user-b");
    expect(await getStorage().letterPair("AB")).toBeUndefined();
  });

  it("clears the persisted id on sign-out, so the next load defaults back to guest", async () => {
    const first = await freshModule();
    first.setActiveAccount("user-3");
    first.setActiveAccount(undefined);
    expect(localStorage.getItem("bld.activeAccountId")).toBeNull();

    const second = await freshModule();
    expect(second.activeStorageName()).toBe("bldokja");
  });
});
