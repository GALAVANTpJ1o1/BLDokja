import { loadPuzzle } from "@bld/cube-engine";
import { dueCases, reviewsByCase, scheduleAll } from "@bld/srs";
import type { AppEvent, LetterPair, Settings } from "@bld/storage";
import { itemLabel } from "@/lib/item-labels";
import { readerFor } from "@/lib/reader";
import { weakDeck } from "@/lib/weak";
import { mainImage, PAIRS_TRAINER } from "@/trainers/pairs";

/** What home's "Today" shows: pair reviews due, and the top of Weak 20 with labels in your scheme. */
export interface Today {
  readonly pairsDue: number;
  readonly weakCount: number;
  readonly weak: readonly { readonly key: string; readonly label: string }[];
}

/**
 * Computed from storage after the page has painted, and loaded as its own chunk: the cube engine, spaced
 * repetition and analytics it needs would otherwise sit in home's first load.
 */
export async function today(events: readonly AppEvent[], pairs: readonly LetterPair[], stored: Settings | undefined): Promise<Today> {
  const now = new Date();
  // The same queue as the library's Review view: due cards for pairs that have an image.
  const ids = pairs.filter((p) => mainImage(p) !== undefined).map((p) => p.id);
  const pairsDue = dueCases(scheduleAll(ids, reviewsByCase(events, PAIRS_TRAINER), now), now).length;
  const weak = weakDeck(events, now);
  const reader = readerFor(await loadPuzzle("3x3x3"), { scheme: stored?.scheme, buffers: stored?.buffers });
  return { pairsDue, weakCount: weak.length, weak: weak.slice(0, 3).map((w) => ({ key: `${w.trainer}|${w.caseId}`, label: itemLabel(reader, w.trainer, w.caseId) })) };
}
