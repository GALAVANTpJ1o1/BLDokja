"use client";

import type { AppEvent, LetterPair } from "@bld/storage";
import type { CaseSchedule } from "@bld/srs";
import { graphemes } from "@bld/storage";
import type { Reader } from "@/lib/reader";
import { shortcutIgnored } from "@/lib/keyboard";

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
  readonly events: readonly AppEvent[];
  readonly append: (events: readonly AppEvent[]) => Promise<void>;
  readonly openEditor: (id: string) => void;
}

export { caseStatus as pairStatus, masteryOpacity, MasteryMark, type CaseStatus as PairStatus } from "@/components/trainer/mastery";

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
  return shortcutIgnored(event);
}
