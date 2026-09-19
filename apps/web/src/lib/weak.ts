import { attemptsOf, weakItems, type AttemptLike, type WeakItem } from "@bld/analytics";
import { reviewsByCase, scheduleCase, type Review } from "@bld/srs";
import { F2L_TRAINER, LL_TRAINER } from "./cfop-stats";

/**
 * Weak 20, computed one way everywhere it appears (home, Progress, the drill), so the list you see is the
 * deck you get: every attempt you've made, with each case's FSRS recall probability from its own trainer's
 * history. It isn't scoped to Progress's period filter, because the deck it links to isn't.
 */
export function weakDeck(allEvents: readonly AttemptLike[], now: Date, limit = 20): WeakItem[] {
  // The CFOP trainers have their own weak-case filters (last-layer recognition, F2L practice); the blindfolded Weak 20 is
  // built only from the blindfolded trainers, which is what its drill can ask.
  const events = allEvents.filter((event) => !("trainer" in event && (event.trainer === LL_TRAINER || event.trainer === F2L_TRAINER)));
  const reviews = new Map<string, Map<string, Review[]>>();
  const recall = (trainer: string, caseId: string) => {
    let byCase = reviews.get(trainer);
    if (byCase === undefined) {
      byCase = reviewsByCase(events, trainer);
      reviews.set(trainer, byCase);
    }
    return scheduleCase(caseId, byCase.get(caseId) ?? [], now).retrievability;
  };
  return weakItems(attemptsOf(events), { limit, retrievability: recall });
}
