"use client";

import type { AppEvent, LetterPair } from "@bld/storage";
import type { CaseSchedule } from "@bld/srs";
import { graphemes } from "@bld/storage";
import { en } from "@/i18n/en";
import type { Reader } from "@/lib/reader";

/** Everything the library's views share. */
export interface LibraryContext {
  readonly reader: Reader;
  readonly letters: readonly string[];
  readonly pairs: readonly LetterPair[];
  readonly byId: ReadonlyMap<string, LetterPair>;
  readonly schedules: ReadonlyMap<string, CaseSchedule>;
  readonly seen: ReadonlyMap<string, number>;
  readonly expected: ReadonlyMap<string, number> | undefined;
  readonly now: Date;
  readonly save: (changed: readonly LetterPair[]) => Promise<boolean>;
  readonly append: (events: readonly AppEvent[]) => Promise<void>;
  readonly openEditor: (id: string) => void;
}

export type PairStatus = "new" | "learning" | "due" | "mastered";

export function pairStatus(schedule: CaseSchedule | undefined, now: Date): PairStatus {
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
export function MasteryMark({ status, className, decorative = false }: { status: PairStatus; className?: string; /** The label is already written next to the mark. */ decorative?: boolean }) {
  const label = en.pairs.mastery[status];
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

/** A pair's two letters from its id. */
export function lettersOf(id: string): [string, string] {
  const [first = "", second = ""] = graphemes(id);
  return [first, second];
}

/** A pair shown big, for the drill cards: two casual letters with a gap. */
export function BigPair({ id }: { id: string }) {
  const [first, second] = lettersOf(id);
  return (
    <span className="t-display-letter inline-flex gap-3" aria-label={`${first} ${second}`}>
      <span aria-hidden>{first}</span>
      <span aria-hidden>{second}</span>
    </span>
  );
}

/** Keys typed into a field, or pressed while a dialog is open, don't drive a drill. */
export function ignoreKey(event: KeyboardEvent): boolean {
  const target = event.target;
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || document.querySelector("dialog[open]") !== null || event.metaKey || event.ctrlKey || event.altKey;
}
