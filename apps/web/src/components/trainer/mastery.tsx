"use client";

import type { CaseSchedule } from "@bld/srs";
import { en } from "@/i18n/en";

export type CaseStatus = "new" | "learning" | "due" | "mastered";

export function caseStatus(schedule: CaseSchedule | undefined, now: Date): CaseStatus {
  if (schedule === undefined || schedule.reviews === 0) return "new";
  if (schedule.mastered) return "mastered";
  if (schedule.due !== undefined && Date.parse(schedule.due) <= now.getTime()) return "due";
  return "learning";
}

/** DESIGN.md "States without colour": one lightness ramp in --text at five steps. */
const RAMP = [0.12, 0.3, 0.55, 0.78, 1] as const;

export function masteryOpacity(schedule: CaseSchedule | undefined): number {
  if (schedule === undefined || schedule.reviews === 0) return RAMP[0];
  if (schedule.mastered) return RAMP[4];
  const r = schedule.retrievability ?? 0;
  return r < 0.5 ? RAMP[1] : r < 0.8 ? RAMP[2] : RAMP[3];
}

/** An open ring (due), a dot (new), a filled square (mastered); nothing while learning. */
export function MasteryMark({ status, className, decorative = false }: { status: CaseStatus; className?: string; /** The label is already written next to the mark. */ decorative?: boolean }) {
  const label = en.trainer.mastery[status];
  return (
    <span className={`inline-flex items-center ${className ?? ""}`} title={decorative ? undefined : label}>
      <svg aria-hidden width="10" height="10" viewBox="0 0 10 10" className="shrink-0">
        {status === "due" ? <circle cx="5" cy="5" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.6" /> : null}
        {status === "new" ? <circle cx="5" cy="5" r="2" fill="currentColor" /> : null}
        {status === "mastered" ? <rect x="1.5" y="1.5" width="7" height="7" rx="1" fill="currentColor" /> : null}
      </svg>
      {decorative ? null : <span className="sr-only">{label}</span>}
    </span>
  );
}
