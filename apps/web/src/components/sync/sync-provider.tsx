"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAccount } from "@/components/account/account-provider";
import type { LetterPairConflict } from "@/lib/sync/pairs";
import type { SyncStatus } from "@/lib/sync/orchestrator";

const scheduler = () => import("@/lib/sync/scheduler");

const SYNC_INTERVAL_MS = 60_000;

interface SyncContextValue {
  /** "idle" before the first cycle has run this session -- distinct from any of runSyncCycle's own states. */
  readonly status: SyncStatus | "idle";
  readonly lastSyncedAt: string | undefined;
  readonly conflicts: readonly LetterPairConflict[];
  readonly syncNow: () => void;
}

const SyncContext = createContext<SyncContextValue | undefined>(undefined);

/**
 * Runs sync cycles periodically while signed in, and on the moments they matter most: right after
 * signing in, when the tab regains focus (foreground refresh), and when the browser comes back
 * online (reconnect) -- the plan's own required triggers (v2 §F). Does nothing at all for a guest;
 * `runSyncCycleCoordinated()` itself would report "sign-in-required" anyway, but skipping the timer
 * entirely means a guest's browser never even attempts a network call.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const { signedIn } = useAccount();
  // Only ever reflects an actual cycle's outcome. The exposed `status` below derives "idle" from
  // `signedIn` instead of this effect setting it directly -- calling setState synchronously from an
  // effect body (rather than from a callback reacting to an external event) causes an avoidable
  // extra render and is flagged by this repo's own lint rules for exactly that reason.
  const [cycleStatus, setCycleStatus] = useState<SyncStatus | undefined>(undefined);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | undefined>(undefined);
  const [conflicts, setConflicts] = useState<readonly LetterPairConflict[]>([]);
  const running = useRef(false);

  const runCycle = useCallback(() => {
    if (!signedIn || running.current) return;
    running.current = true;
    void scheduler()
      .then((m) => m.runSyncCycleCoordinated())
      .then((result) => {
        if (result === undefined) return; // Another tab held the lock this round.
        setCycleStatus(result.status);
        if (result.status === "synced") setLastSyncedAt(new Date().toISOString());
        if (result.pairConflicts.length > 0) setConflicts((current) => [...current, ...result.pairConflicts.filter((c) => !current.some((existing) => existing.id === c.id))]);
      })
      .catch(() => {
        setCycleStatus("failed");
      })
      .finally(() => {
        running.current = false;
      });
  }, [signedIn]);

  useEffect(() => {
    if (!signedIn) return;
    runCycle(); // Right after signing in (or on a page load that discovers an existing session).
    const interval = setInterval(runCycle, SYNC_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") runCycle();
    };
    const onOnline = () => { runCycle(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [signedIn, runCycle]);

  const status = signedIn ? (cycleStatus ?? "idle") : "idle";
  const value = useMemo<SyncContextValue>(() => ({ status, lastSyncedAt, conflicts, syncNow: runCycle }), [status, lastSyncedAt, conflicts, runCycle]);
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const value = useContext(SyncContext);
  if (value === undefined) throw new Error("useSync needs a SyncProvider");
  return value;
}
