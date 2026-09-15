import { createEmptyCard, fsrs, Rating, type Card } from "ts-fsrs";

/**
 * Spaced repetition for drill cases (BRIEF §7.4, §7.2), derived from the event log.
 *
 * There is no stored card state: a case's FSRS card is rebuilt by replaying its graded attempts in
 * time order, so the log stays the single source of truth, an import or export carries scheduling
 * with it, and nothing can drift out of step with the attempts that produced it. The scheduler runs
 * without fuzz, so the same attempts always give the same schedule.
 *
 * A right answer is rated Good and a wrong one Again. "Mastered" follows your 2026-09-15 answer:
 * recall probability at least 90% now, and at least three successful reviews, so mastery fades when
 * practice stops.
 */
export interface Review {
  /** ISO instant. */
  readonly at: string;
  readonly correct: boolean;
}

export interface CaseSchedule {
  readonly caseId: string;
  readonly reviews: number;
  readonly successes: number;
  readonly errors: number;
  /** When the card is due, as an ISO instant; undefined if never reviewed. */
  readonly due: string | undefined;
  /** Recall probability at the time asked; undefined if never reviewed. */
  readonly retrievability: number | undefined;
  readonly mastered: boolean;
}

export const MASTERY_RETRIEVABILITY = 0.9;
export const MASTERY_MIN_SUCCESSES = 3;

const scheduler = fsrs({ enable_fuzz: false });

/** Replays a case's reviews into its FSRS card. Reviews are sorted by time first; ties keep their order. */
export function cardFor(reviews: readonly Review[]): Card | undefined {
  const ordered = [...reviews].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const first = ordered[0];
  if (first === undefined) return undefined;
  let card = createEmptyCard(new Date(first.at));
  for (const review of ordered) {
    card = scheduler.next(card, new Date(review.at), review.correct ? Rating.Good : Rating.Again).card;
  }
  return card;
}

export function scheduleCase(caseId: string, reviews: readonly Review[], now: Date): CaseSchedule {
  const card = cardFor(reviews);
  const successes = reviews.filter((r) => r.correct).length;
  const retrievability = card === undefined ? undefined : scheduler.get_retrievability(card, now, false);
  return {
    caseId,
    reviews: reviews.length,
    successes,
    errors: reviews.length - successes,
    due: card?.due.toISOString(),
    retrievability,
    mastered: successes >= MASTERY_MIN_SUCCESSES && retrievability !== undefined && retrievability >= MASTERY_RETRIEVABILITY,
  };
}

export interface AttemptLike {
  readonly type: string;
  readonly at: string;
  readonly trainer?: string;
  readonly caseId?: string;
  readonly correct?: boolean;
}

/** Graded attempts of one trainer, grouped by case id, in log order. */
export function reviewsByCase(events: readonly AttemptLike[], trainer: string): Map<string, Review[]> {
  const out = new Map<string, Review[]>();
  for (const e of events) {
    if (e.type !== "drill.attempt" || e.trainer !== trainer || e.caseId === undefined || e.correct === undefined) continue;
    const list = out.get(e.caseId) ?? [];
    list.push({ at: e.at, correct: e.correct });
    out.set(e.caseId, list);
  }
  return out;
}

export function scheduleAll(caseIds: readonly string[], reviews: ReadonlyMap<string, readonly Review[]>, now: Date): Map<string, CaseSchedule> {
  return new Map(caseIds.map((id) => [id, scheduleCase(id, reviews.get(id) ?? [], now)]));
}

/** Cases due now (reviewed before and due at or before `now`), most overdue first. */
export function dueCases(schedules: ReadonlyMap<string, CaseSchedule>, now: Date): string[] {
  return [...schedules.values()]
    .filter((s) => s.due !== undefined && Date.parse(s.due) <= now.getTime())
    .sort((a, b) => Date.parse(a.due ?? "") - Date.parse(b.due ?? "") || (a.caseId < b.caseId ? -1 : 1))
    .map((s) => s.caseId);
}

/** The engine's selection stats (`CaseStatsProvider`) from schedules: attempts, errors, retrievability, due. */
export function statsFor(schedule: CaseSchedule | undefined): { attempts: number; errors: number; retrievability?: number; due?: number } | undefined {
  if (schedule === undefined || schedule.reviews === 0) return undefined;
  return {
    attempts: schedule.reviews,
    errors: schedule.errors,
    ...(schedule.retrievability === undefined ? {} : { retrievability: schedule.retrievability }),
    ...(schedule.due === undefined ? {} : { due: Date.parse(schedule.due) }),
  };
}
