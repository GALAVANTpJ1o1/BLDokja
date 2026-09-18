// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncCycleResult } from "./orchestrator";

const runSyncCycle = vi.fn<() => Promise<SyncCycleResult>>();
vi.mock("./orchestrator", () => ({ runSyncCycle: () => runSyncCycle() }));

const SYNCED: SyncCycleResult = { status: "synced", eventsPushed: 0, eventsPulled: 0, pairsPushed: 0, pairsPulled: 0, pairConflicts: [], settingsSynced: false };

function removeLocks() {
  Reflect.deleteProperty(navigator, "locks");
}

function installFakeLocks(behavior: "grant" | "already-held" | "throw") {
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: {
      request: async (_name: string, _opts: unknown, callback: (lock: { name: string } | null) => Promise<unknown>) => {
        if (behavior === "throw") throw new Error("locks unavailable");
        return callback(behavior === "grant" ? { name: "bldokja-sync-cycle" } : null);
      },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  runSyncCycle.mockResolvedValue(SYNCED);
});

describe("runSyncCycleCoordinated", () => {
  it("runs directly when the Locks API isn't available at all", async () => {
    removeLocks();
    const { runSyncCycleCoordinated } = await import("./scheduler");

    const result = await runSyncCycleCoordinated();

    expect(result).toEqual(SYNCED);
    expect(runSyncCycle).toHaveBeenCalledTimes(1);
  });

  it("runs the cycle when this tab acquires the lock", async () => {
    installFakeLocks("grant");
    const { runSyncCycleCoordinated } = await import("./scheduler");

    const result = await runSyncCycleCoordinated();

    expect(result).toEqual(SYNCED);
    expect(runSyncCycle).toHaveBeenCalledTimes(1);
  });

  it("skips the cycle entirely when another tab already holds the lock", async () => {
    installFakeLocks("already-held");
    const { runSyncCycleCoordinated } = await import("./scheduler");

    const result = await runSyncCycleCoordinated();

    expect(result).toBeUndefined();
    expect(runSyncCycle).not.toHaveBeenCalled();
  });

  it("falls back to running directly if the Locks API itself errors", async () => {
    installFakeLocks("throw");
    const { runSyncCycleCoordinated } = await import("./scheduler");

    const result = await runSyncCycleCoordinated();

    expect(result).toEqual(SYNCED);
    expect(runSyncCycle).toHaveBeenCalledTimes(1);
  });
});
