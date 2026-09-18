// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncCycleResult } from "@/lib/sync/orchestrator";
import { SyncProvider, useSync } from "./sync-provider";

const runSyncCycleCoordinated = vi.fn<() => Promise<SyncCycleResult | undefined>>();
vi.mock("@/lib/sync/scheduler", () => ({ runSyncCycleCoordinated: () => runSyncCycleCoordinated() }));

// SyncProvider only reads `signedIn` from useAccount(), so the whole provider/context machinery is
// replaced with a single mock returning just that, reconfigured per test -- no real Supabase session
// or AccountProvider tree needed to exercise SyncProvider's own scheduling logic in isolation.
const useAccount = vi.fn<() => { signedIn: boolean }>();
vi.mock("@/components/account/account-provider", () => ({ useAccount: () => useAccount() }));

const SYNCED: SyncCycleResult = { status: "synced", eventsPushed: 1, eventsPulled: 0, pairsPushed: 0, pairsPulled: 0, pairConflicts: [], settingsSynced: false };

beforeEach(() => {
  vi.clearAllMocks();
  runSyncCycleCoordinated.mockResolvedValue(SYNCED);
});

describe("SyncProvider for a guest", () => {
  it("never runs a sync cycle and stays idle", async () => {
    useAccount.mockReturnValue({ signedIn: false });
    const { result } = renderHook(() => useSync(), { wrapper: SyncProvider });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(result.current.status).toBe("idle");
    expect(runSyncCycleCoordinated).not.toHaveBeenCalled();
  });
});

describe("SyncProvider when signed in", () => {
  beforeEach(() => {
    useAccount.mockReturnValue({ signedIn: true });
  });

  it("runs an initial cycle and reports the result", async () => {
    const { result } = renderHook(() => useSync(), { wrapper: SyncProvider });

    await waitFor(() => { expect(result.current.status).toBe("synced"); });

    expect(runSyncCycleCoordinated).toHaveBeenCalledTimes(1);
    expect(result.current.lastSyncedAt).toBeTypeOf("string");
  });

  it("re-runs on a foreground refresh (visibilitychange to visible)", async () => {
    renderHook(() => useSync(), { wrapper: SyncProvider });
    await waitFor(() => { expect(runSyncCycleCoordinated).toHaveBeenCalledTimes(1); });

    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => { expect(runSyncCycleCoordinated).toHaveBeenCalledTimes(2); });
  });

  it("re-runs on reconnect (the online event)", async () => {
    renderHook(() => useSync(), { wrapper: SyncProvider });
    await waitFor(() => { expect(runSyncCycleCoordinated).toHaveBeenCalledTimes(1); });

    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => { expect(runSyncCycleCoordinated).toHaveBeenCalledTimes(2); });
  });

  it("collects conflicts across cycles without duplicating an id already seen", async () => {
    const conflict = { id: "AB", local: { id: "AB", first: "A", second: "B", images: [] }, remote: { id: "AB", first: "A", second: "B", images: [], notes: "x" } };
    runSyncCycleCoordinated.mockResolvedValue({ ...SYNCED, pairConflicts: [conflict] });
    const { result } = renderHook(() => useSync(), { wrapper: SyncProvider });

    await waitFor(() => { expect(result.current.conflicts).toEqual([conflict]); });

    act(() => {
      result.current.syncNow();
    });
    await waitFor(() => { expect(runSyncCycleCoordinated).toHaveBeenCalledTimes(2); });

    expect(result.current.conflicts).toEqual([conflict]); // still just one, not duplicated
  });

  it("reports failed status when the sync cycle throws", async () => {
    runSyncCycleCoordinated.mockRejectedValue(new Error("network down"));
    const { result } = renderHook(() => useSync(), { wrapper: SyncProvider });

    await waitFor(() => { expect(result.current.status).toBe("failed"); });
  });

  it("skipping a round because another tab held the lock leaves the previous status untouched", async () => {
    const { result } = renderHook(() => useSync(), { wrapper: SyncProvider });
    await waitFor(() => { expect(result.current.status).toBe("synced"); });

    runSyncCycleCoordinated.mockResolvedValue(undefined); // another tab's lock this round
    act(() => {
      result.current.syncNow();
    });
    await waitFor(() => { expect(runSyncCycleCoordinated).toHaveBeenCalledTimes(2); });

    expect(result.current.status).toBe("synced"); // unchanged, not reset to anything else
  });
});
