"use client";

import type { ExecutionStyle } from "@bld/cube-engine/cfop-data";
import { useCallback, useMemo } from "react";
import { useSettings } from "@/components/settings/settings-provider";
import { effectiveStatus, foldStats, type CaseStat, type CaseStatus, type EffectiveStatus } from "@/lib/cfop-stats";
import { useEvents } from "@/lib/use-events";

/** How the reader turns (two-handed or one-handed), kept in settings and shared by every CFOP page. */
export function useExecutionStyle(): readonly [ExecutionStyle, (style: ExecutionStyle) => void] {
  const { stored, update } = useSettings();
  const style: ExecutionStyle = stored?.executionStyle ?? "2H";
  const set = useCallback((next: ExecutionStyle) => { void update({ executionStyle: next }).catch(() => undefined); }, [update]);
  return [style, set];
}

export interface CaseProgress {
  readonly ready: boolean;
  readonly stats: ReadonlyMap<string, CaseStat>;
  readonly manual: Readonly<Record<string, CaseStatus>>;
  statusOf(caseId: string): EffectiveStatus;
  /** Set a status by hand, or `null` to go back to judging from practice. */
  setStatus(caseId: string, status: CaseStatus | null): void;
  /** Log attempts for a trainer; the same store every other trainer uses. */
  readonly events: ReturnType<typeof useEvents>;
}

/** Practice statistics and case statuses for one trainer, folded from the event log (D-083): no second progress store. */
export function useCaseProgress(trainer: string): CaseProgress {
  const { stored, update } = useSettings();
  const events = useEvents();
  const stats = useMemo(() => foldStats(events.events ?? [], trainer), [events.events, trainer]);
  const manual = useMemo(() => stored?.caseStatus ?? {}, [stored?.caseStatus]);
  const statusOf = useCallback((caseId: string) => effectiveStatus(caseId, stats.get(caseId), manual), [stats, manual]);
  const setStatus = useCallback((caseId: string, status: CaseStatus | null) => {
    const next = Object.fromEntries(Object.entries(manual).filter(([id]) => id !== caseId)) as Record<string, CaseStatus>;
    if (status !== null) next[caseId] = status;
    void update({ caseStatus: next }).catch(() => undefined);
  }, [manual, update]);
  return { ready: events.events !== undefined, stats, manual, statusOf, setStatus, events };
}
