// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setActiveAccount } from "@/lib/storage-client";
import type { PushEventsResult, PullEventsResult } from "./events";
import type { ReconcileLetterPairsResult } from "./pairs";
import type { SyncSettingsResult } from "./settings";

const pushOutboxEvents = vi.fn<() => Promise<PushEventsResult>>();
const pullNewEvents = vi.fn<() => Promise<PullEventsResult>>();
const reconcileLetterPairs = vi.fn<() => Promise<ReconcileLetterPairsResult>>();
const syncSettings = vi.fn<() => Promise<SyncSettingsResult>>();

vi.mock("./events", () => ({ pushOutboxEvents: () => pushOutboxEvents(), pullNewEvents: () => pullNewEvents() }));
vi.mock("./pairs", () => ({ reconcileLetterPairs: () => reconcileLetterPairs() }));
vi.mock("./settings", () => ({ syncSettings: () => syncSettings() }));

function setOnline(online: boolean) {
  Object.defineProperty(navigator, "onLine", { value: online, configurable: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  setOnline(true);
  pushOutboxEvents.mockResolvedValue({ pushed: 0, failed: false });
  pullNewEvents.mockResolvedValue({ pulled: 0, failed: false, invalid: 0 });
  reconcileLetterPairs.mockResolvedValue({ pushed: 0, pulled: 0, failed: false, conflicts: [] });
  syncSettings.mockResolvedValue({ synced: false, failed: false });
});

describe("runSyncCycle", () => {
  it("reports sign-in-required for a guest, without calling any sync function", async () => {
    setActiveAccount(undefined);
    const { runSyncCycle } = await import("./orchestrator");

    const result = await runSyncCycle();

    expect(result.status).toBe("sign-in-required");
    expect(pushOutboxEvents).not.toHaveBeenCalled();
  });

  it("reports offline when signed in but the browser has no connection", async () => {
    setActiveAccount("acct-orch-1");
    setOnline(false);
    const { runSyncCycle } = await import("./orchestrator");

    const result = await runSyncCycle();

    expect(result.status).toBe("offline");
    expect(pushOutboxEvents).not.toHaveBeenCalled();
  });

  it("aggregates counts from all four sync pieces and reports synced when everything succeeds", async () => {
    setActiveAccount("acct-orch-2");
    pushOutboxEvents.mockResolvedValue({ pushed: 3, failed: false });
    pullNewEvents.mockResolvedValue({ pulled: 5, failed: false, invalid: 0 });
    reconcileLetterPairs.mockResolvedValue({ pushed: 1, pulled: 2, failed: false, conflicts: [] });
    syncSettings.mockResolvedValue({ synced: true, failed: false });
    const { runSyncCycle } = await import("./orchestrator");

    const result = await runSyncCycle();

    expect(result).toEqual({
      status: "synced",
      eventsPushed: 3,
      eventsPulled: 5,
      pairsPushed: 1,
      pairsPulled: 2,
      pairConflicts: [],
      settingsSynced: true,
    });
  });

  it("reports failed if any single piece fails, while still surfacing what the others accomplished", async () => {
    setActiveAccount("acct-orch-3");
    pushOutboxEvents.mockResolvedValue({ pushed: 2, failed: false });
    reconcileLetterPairs.mockResolvedValue({ pushed: 0, pulled: 0, failed: true, conflicts: [] });
    const { runSyncCycle } = await import("./orchestrator");

    const result = await runSyncCycle();

    expect(result.status).toBe("failed");
    expect(result.eventsPushed).toBe(2); // the successful piece's work still counted, not discarded
  });

  it("surfaces letter-pair conflicts through to the caller", async () => {
    setActiveAccount("acct-orch-4");
    const conflict = { id: "AB", local: { id: "AB", first: "A", second: "B", images: [] }, remote: { id: "AB", first: "A", second: "B", images: [], notes: "x" }, remoteRev: 2 };
    reconcileLetterPairs.mockResolvedValue({ pushed: 0, pulled: 0, failed: false, conflicts: [conflict] });
    const { runSyncCycle } = await import("./orchestrator");

    const result = await runSyncCycle();

    expect(result.pairConflicts).toEqual([conflict]);
    expect(result.status).toBe("synced"); // a conflict alone isn't a failure -- it's reported data, not an error
  });
});
