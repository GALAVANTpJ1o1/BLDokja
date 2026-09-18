// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SettingsSyncClient } from "./settings";

/** A fake merge_settings RPC: does the same per-field newer-wins merge the real Postgres function does (D-056/D-060), so tests exercise realistic behaviour without a live database. */
function fakeClient(initial: { data: Record<string, unknown>; times: Record<string, string> } = { data: {}, times: {} }) {
  let serverData = { ...initial.data };
  let serverTimes = { ...initial.times };
  let failNext = false;
  const calls: { patch: Record<string, unknown>; patch_times: Record<string, string> }[] = [];

  const client: SettingsSyncClient = {
    rpc: (_fn, args) => {
      calls.push(args);
      if (failNext) return Promise.resolve({ data: null, error: { message: "boom" } });
      for (const [key, value] of Object.entries(args.patch)) {
        const incomingTime = args.patch_times[key];
        const existingTime = serverTimes[key];
        if (existingTime === undefined || (incomingTime !== undefined && incomingTime > existingTime)) {
          serverData = { ...serverData, [key]: value };
          if (incomingTime !== undefined) serverTimes = { ...serverTimes, [key]: incomingTime };
        }
      }
      return Promise.resolve({ data: { ...serverData }, error: null });
    },
  };

  return { client, calls, failNextOnce: () => { failNext = true; }, getServerData: () => serverData };
}

describe("syncSettings", () => {
  let setActiveAccount: typeof import("@/lib/storage-client").setActiveAccount;
  let getStorage: typeof import("@/lib/storage-client").getStorage;
  let syncSettings: typeof import("./settings").syncSettings;

  beforeEach(async () => {
    vi.resetModules();
    ({ setActiveAccount, getStorage } = await import("@/lib/storage-client"));
    ({ syncSettings } = await import("./settings"));
    setActiveAccount("acct-settings-sync");
  });

  it("does nothing for a guest", async () => {
    setActiveAccount(undefined);
    const { client, calls } = fakeClient();
    const result = await syncSettings(client);
    expect(result).toEqual({ synced: false, failed: false });
    expect(calls).toHaveLength(0);
  });

  it("pushes only fields with a syncFieldUpdatedAt stamp, never device-only fields", async () => {
    const storage = getStorage();
    await storage.putSettings({ theme: "dark", persistentStorage: "granted", syncFieldUpdatedAt: { theme: "2026-09-18T00:00:00Z" } });
    const { client, calls } = fakeClient();

    await syncSettings(client);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ patch: { theme: "dark" }, patch_times: { theme: "2026-09-18T00:00:00Z" } });
  });

  it("applies the merged result locally without discarding fields the server has never seen", async () => {
    const storage = getStorage();
    await storage.putSettings({ theme: "dark", scratchpad: "never synced, no timestamp", syncFieldUpdatedAt: { theme: "2026-09-18T00:00:00Z" } });
    const { client } = fakeClient({ data: { theme: "light" }, times: { theme: "2026-09-19T00:00:00Z" } }); // another device pushed a newer theme already

    const result = await syncSettings(client);

    expect(result).toEqual({ synced: true, failed: false });
    const after = await storage.settings();
    expect(after?.theme).toBe("light"); // server's newer value won
    expect(after?.scratchpad).toBe("never synced, no timestamp"); // untouched local-only field survives
  });

  it("a stale local timestamp loses to a newer server value, and the local copy is corrected to match", async () => {
    const storage = getStorage();
    await storage.putSettings({ theme: "dark", syncFieldUpdatedAt: { theme: "2026-01-01T00:00:00Z" } }); // an old, stale stamp
    const { client } = fakeClient({ data: { theme: "light" }, times: { theme: "2026-09-19T00:00:00Z" } });

    await syncSettings(client);

    expect((await storage.settings())?.theme).toBe("light");
  });

  it("reports failure and leaves local settings untouched when the RPC errors", async () => {
    const storage = getStorage();
    await storage.putSettings({ theme: "dark", syncFieldUpdatedAt: { theme: "2026-09-18T00:00:00Z" } });
    const { client, failNextOnce } = fakeClient();
    failNextOnce();

    const result = await syncSettings(client);

    expect(result).toEqual({ synced: false, failed: true });
    expect((await storage.settings())?.theme).toBe("dark");
  });
});
