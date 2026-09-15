import { describe, expect, it } from "vitest";
import { cardFor, dueCases, MASTERY_MIN_SUCCESSES, reviewsByCase, scheduleAll, scheduleCase, statsFor, type Review } from "../src/index.js";

const day = (n: number, hour = 12) => new Date(Date.UTC(2026, 8, 1 + n, hour)).toISOString();

describe("FSRS schedules from the event log", () => {
  it("is deterministic: the same reviews give the same card, whatever order they arrive in", () => {
    const reviews: Review[] = [
      { at: day(0), correct: true },
      { at: day(1), correct: false },
      { at: day(3), correct: true },
    ];
    expect(cardFor([...reviews].reverse())).toEqual(cardFor(reviews));
    expect(scheduleCase("AB", reviews, new Date(day(4)))).toEqual(scheduleCase("AB", reviews, new Date(day(4))));
  });

  it("an unreviewed case has no due date, no retrievability and isn't mastered", () => {
    expect(scheduleCase("AB", [], new Date(day(0)))).toEqual({ caseId: "AB", reviews: 0, successes: 0, errors: 0, due: undefined, retrievability: undefined, mastered: false });
  });

  it("mastery needs three successful reviews and a recall probability of at least 90%, and fades without practice", () => {
    const good = [day(0), day(1), day(4), day(12)].map((at) => ({ at, correct: true }));
    const twoOnly = scheduleCase("x", good.slice(0, 2), new Date(day(1, 13)));
    expect(twoOnly.successes).toBeLessThan(MASTERY_MIN_SUCCESSES);
    expect(twoOnly.mastered).toBe(false);
    const fresh = scheduleCase("x", good, new Date(day(12, 13)));
    expect(fresh.retrievability).toBeGreaterThanOrEqual(0.9);
    expect(fresh.mastered).toBe(true);
    const stale = scheduleCase("x", good, new Date(day(400)));
    expect(stale.retrievability).toBeLessThan(0.9);
    expect(stale.mastered).toBe(false);
  });

  it("a wrong answer brings the card due sooner than a right one would have", () => {
    const base = [{ at: day(0), correct: true }, { at: day(2), correct: true }];
    const right = scheduleCase("x", [...base, { at: day(8), correct: true }], new Date(day(8)));
    const wrong = scheduleCase("x", [...base, { at: day(8), correct: false }], new Date(day(8)));
    expect(Date.parse(wrong.due ?? "")).toBeLessThan(Date.parse(right.due ?? ""));
  });

  it("groups graded attempts by case for one trainer, and lists due cases most overdue first", () => {
    const events = [
      { type: "drill.attempt", at: day(0), trainer: "pairs", caseId: "AB", correct: true },
      { type: "drill.attempt", at: day(0), trainer: "trace", caseId: "AB", correct: false },
      { type: "lesson.opened", at: day(0) },
      { type: "drill.attempt", at: day(1), trainer: "pairs", caseId: "CD", correct: true },
    ];
    const grouped = reviewsByCase(events, "pairs");
    expect([...grouped.keys()]).toEqual(["AB", "CD"]);
    const schedules = scheduleAll(["AB", "CD", "EF"], grouped, new Date(day(30)));
    expect(dueCases(schedules, new Date(day(30)))).toEqual(["AB", "CD"]);
    expect(statsFor(schedules.get("EF"))).toBeUndefined();
    expect(statsFor(schedules.get("AB"))).toMatchObject({ attempts: 1, errors: 0 });
  });
});
