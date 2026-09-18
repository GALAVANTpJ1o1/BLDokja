import { describe, expect, it } from "vitest";
import { accuracyBand, activityDays, attemptsOf, heatCells, legacyMemoSummary, median, MIN_SAMPLES, sessionSummary, streaks, summariseCases, traceDiagnostics, trend, weakItems, type AttemptLike } from "../src/index.js";

const DAY = 86_400_000;
const T0 = Date.parse("2026-09-01T09:00:00Z");
let n = 0;
const attempt = (trainer: string, caseId: string, correct: boolean, responseMs: number, time: number, detail: Record<string, unknown> = {}): AttemptLike => ({
  type: "drill.attempt",
  at: new Date(time).toISOString(),
  trainer,
  caseId,
  correct,
  responseMs,
  detail,
  strategy: `s${String(n++)}`,
});

describe("attempts and cases", () => {
  it("keeps only graded drill attempts, oldest first", () => {
    const events: AttemptLike[] = [attempt("pairs", "AB", true, 900, T0 + 1000), { type: "lesson.opened", at: new Date(T0).toISOString() }, attempt("pairs", "AB", false, 1500, T0), { type: "drill.attempt", at: "not a date", trainer: "x", caseId: "y", correct: true, responseMs: 1 }];
    expect(attemptsOf(events).map((a) => a.correct)).toEqual([false, true]);
  });

  it("medians and case summaries", () => {
    expect([median([]), median([3]), median([4, 1, 3]), median([4, 1, 3, 2])]).toEqual([undefined, 3, 3, 2.5]);
    const s = summariseCases(attemptsOf([attempt("pairs", "AB", true, 800, T0), attempt("pairs", "AB", false, 1200, T0 + 1), attempt("pairs", "AB", true, 1000, T0 + 2), attempt("3style", "AB", true, 5000, T0)]), "pairs");
    expect([...s.values()]).toEqual([{ trainer: "pairs", caseId: "AB", attempts: 3, correct: 2, accuracy: 2 / 3, medianMs: 1000, lastAt: new Date(T0 + 2).toISOString() }]);
  });
});

describe("trace diagnostics", () => {
  it("gives the median time per kind of lookup, and says when a kind has too few targets", () => {
    const events: AttemptLike[] = [];
    for (let i = 0; i < 8; i++) events.push(attempt("trace", `edges:X${String(i)}`, true, 1000 + i * 100, T0 + i, { kind: "normal" }));
    for (let i = 0; i < 6; i++) events.push(attempt("trace", `edges:B${String(i)}`, i !== 0, 3000 + i * 100, T0 + 100 + i, { kind: "break" }));
    events.push(attempt("trace", "corners:Q", true, 2000, T0 + 200, { kind: "twist" }));
    const d = traceDiagnostics(attemptsOf(events));
    expect(d.map((k) => [k.kind, k.count, k.medianMs, k.enough])).toEqual([["first", 0, undefined, false], ["normal", 8, 1350, true], ["break", 6, 3250, true], ["twist", 1, 2000, false]]);
    expect(d.find((k) => k.kind === "break")?.accuracy).toBeCloseTo(5 / 6);
    expect(MIN_SAMPLES).toBe(5);
  });
});

describe("heat cells", () => {
  it("ranks recall speed into five steps (fastest highest) and bands accuracy", () => {
    const events: AttemptLike[] = ["AB", "AC", "AD", "AE", "AF"].flatMap((id, i) => [attempt("pairs", id, true, 1000 + i * 500, T0 + i), attempt("pairs", id, i < 3, 1000 + i * 500, T0 + 10 + i)]);
    const cells = heatCells(attemptsOf(events), "pairs");
    expect(["AB", "AC", "AD", "AE", "AF"].map((id) => cells.get(id)?.speedStep)).toEqual([4, 3, 2, 1, 0]);
    expect(cells.get("AB")?.accuracyBand).toBe("high");
    expect(cells.get("AF")?.accuracyBand).toBe("low");
    expect([accuracyBand(0.9), accuracyBand(0.75), accuracyBand(0.69)]).toEqual(["high", "mid", "low"]);
    expect(heatCells(attemptsOf(events), "pairs", (id) => id === "AC").size).toBe(1);
  });
});

describe("trends", () => {
  it("rolls a window over practice days and says when there isn't enough data", () => {
    const events: AttemptLike[] = [];
    for (let day = 0; day < 10; day++) for (let i = 0; i < 4; i++) events.push(attempt("pairs", "AB", day >= 5 || i === 0, 2000 - day * 100, T0 + day * DAY + i));
    const accuracy = trend(attemptsOf(events), "accuracy", { window: 3 });
    expect(accuracy.enough).toBe(true);
    expect(accuracy.points).toHaveLength(10);
    expect(accuracy.points[0]?.value).toBeCloseTo(0.25);
    expect(accuracy.points[9]?.value).toBe(1);
    expect(accuracy.points[6]?.windowAttempts).toBe(12);
    const speed = trend(attemptsOf(events), "medianMs", { window: 1 });
    expect(speed.points[9]?.value).toBe(1100);
    const few = trend(attemptsOf(events.slice(0, 8)), "accuracy");
    expect(few.enough).toBe(false);
  });
});

describe("Weak 20", () => {
  it("ranks cases by errors, slowness within their trainer, and forgetting, needing two attempts each", () => {
    const events: AttemptLike[] = [
      ...[true, true, true].map((c, i) => attempt("pairs", "AB", c, 800, T0 + i)),
      ...[false, false, true].map((c, i) => attempt("pairs", "AC", c, 900, T0 + 10 + i)),
      ...[true, true].map((c, i) => attempt("pairs", "AD", c, 4000, T0 + 20 + i)),
      attempt("pairs", "AE", false, 9000, T0 + 30),
      ...[true, false].map((c, i) => attempt("3style", "corners@UFR:UBR-UBL", c, 7000, T0 + 40 + i)),
    ];
    const weak = weakItems(attemptsOf(events), { retrievability: (trainer, caseId) => (caseId === "AB" ? 0.95 : trainer === "3style" ? 0.4 : undefined) });
    // Scores: AC 0.3 + 0.15 + 0.1 = 0.55; AD 0.125 + 0.3 + 0.1 = 0.525; the 3-style case 0.25 + 0 + 0.12 = 0.37; AB 0.1 + 0 + 0.01 = 0.11. AE has one attempt.
    expect(weak.map((w) => w.caseId)).toEqual(["AC", "AD", "corners@UFR:UBR-UBL", "AB"]);
    expect(weak.map((w) => Number(w.score.toFixed(3)))).toEqual([0.55, 0.525, 0.37, 0.11]);
    expect(weak.find((w) => w.caseId === "AC")?.reasons).toEqual(["errors"]);
    expect(weak.find((w) => w.caseId === "AD")?.reasons).toEqual(["slow"]);
    expect(weak.find((w) => w.caseId === "corners@UFR:UBR-UBL")?.reasons).toEqual(["errors", "forgetting"]);
    expect(weakItems(attemptsOf(events), { limit: 2 })).toHaveLength(2);
  });
});

describe("session summary", () => {
  it("compares the session with each case's history and suggests what to do next", () => {
    const start = T0 + DAY;
    const events: AttemptLike[] = [
      ...[false, false, true].map((c, i) => attempt("pairs", "AB", c, 2000, T0 + i)),
      ...[true, true, true].map((c, i) => attempt("pairs", "AC", c, 1000, T0 + 10 + i)),
      ...[true, true].map((c, i) => attempt("pairs", "AD", c, 3000, T0 + 20 + i)),
      attempt("pairs", "AB", true, 1800, start + 1),
      attempt("pairs", "AB", true, 1700, start + 2),
      attempt("pairs", "AC", false, 1100, start + 3),
      attempt("pairs", "AD", true, 2000, start + 4),
      attempt("pairs", "AE", true, 1000, start + 5),
    ];
    const s = sessionSummary(attemptsOf(events), "pairs", start);
    expect([s.attempts, s.correct, s.firstTimes]).toEqual([5, 4, 1]);
    expect(s.improved.map((c) => c.caseId)).toEqual(["AB", "AD"]);
    expect(s.regressed.map((c) => c.caseId)).toEqual(["AC"]);
    expect(s.next).toEqual([{ kind: "repeat-misses", caseIds: ["AC"] }]);
  });

  it("suggests speeding up cases that slowed down without losing accuracy", () => {
    const start = T0 + DAY;
    const events: AttemptLike[] = [
      ...[true, true].map((c, i) => attempt("pairs", "AB", c, 1000, T0 + i)),
      attempt("pairs", "AB", true, 1300, start + 1),
    ];
    const s = sessionSummary(attemptsOf(events), "pairs", start);
    expect(s.regressed.map((c) => c.caseId)).toEqual(["AB"]);
    expect(s.next).toEqual([{ kind: "speed-up", caseIds: ["AB"] }]);
  });

  it("points at the slowest kind of lookup in guided trace, and says keep going when nothing stands out", () => {
    const events: AttemptLike[] = [];
    for (let i = 0; i < 6; i++) events.push(attempt("trace", `edges:N${String(i)}`, true, 1000, T0 + i, { kind: "normal" }));
    for (let i = 0; i < 6; i++) events.push(attempt("trace", `edges:B${String(i)}`, true, 2600, T0 + 10 + i, { kind: "break" }));
    const s = sessionSummary(attemptsOf(events), "trace", T0);
    expect(s.next).toEqual([{ kind: "slow-lookup", lookup: "break", medianMs: 2600, normalMs: 1000 }]);
    expect(sessionSummary(attemptsOf([attempt("pairs", "AB", true, 900, T0)]), "pairs", T0).next).toEqual([{ kind: "keep-going" }]);
  });
});

describe("activityDays", () => {
  it("counts unique active days, not attempt counts, and sorts them ascending", () => {
    const events: AttemptLike[] = [
      attempt("pairs", "AB", true, 900, Date.parse("2026-09-16T09:00:00Z")),
      attempt("pairs", "AB", false, 900, Date.parse("2026-09-16T20:00:00Z")), // same UTC day, second attempt
      attempt("pairs", "CD", true, 900, Date.parse("2026-09-14T09:00:00Z")),
    ];
    expect(activityDays(attemptsOf(events))).toEqual([
      { day: "2026-09-14", attempts: 1 },
      { day: "2026-09-16", attempts: 2 },
    ]);
  });

  it("an incorrect graded attempt still qualifies the day (v2 §H)", () => {
    const events: AttemptLike[] = [attempt("pairs", "AB", false, 900, Date.parse("2026-09-16T09:00:00Z"))];
    expect(activityDays(attemptsOf(events))).toEqual([{ day: "2026-09-16", attempts: 1 }]);
  });

  it("a repeated delivery of the same event id is never double-counted", () => {
    // attemptsOf() itself doesn't dedupe by id (that's storage.appendEvents()'s job on the way in),
    // but activityDays() must still not be fooled by two rows that are the exact same id showing up
    // -- this exercises that the count is driven by how many *distinct* Attempt objects are passed
    // in, i.e. the guarantee comes from upstream idempotent storage, not from this function guessing.
    const events: AttemptLike[] = [attempt("pairs", "AB", true, 900, Date.parse("2026-09-16T09:00:00Z"))];
    expect(activityDays(attemptsOf(events))[0]?.attempts).toBe(1);
  });
});

describe("streaks", () => {
  const day = (iso: string) => Date.parse(`${iso}T12:00:00Z`); // midday UTC: safely inside that UTC day regardless of the reader's own clock

  it("no attempts at all: both zero", () => {
    expect(streaks([])).toEqual({ current: 0, longest: 0 });
  });

  it("a single active day, which is today: current and longest are both 1", () => {
    const events: AttemptLike[] = [attempt("pairs", "AB", true, 900, day("2026-09-18"))];
    expect(streaks(attemptsOf(events), { today: "2026-09-18" })).toEqual({ current: 1, longest: 1 });
  });

  it("a 3-day run ending today, plus an isolated day 5 days back, does not extend or confuse the current streak (mirrors the live SQL test in D-060)", () => {
    const events: AttemptLike[] = [
      attempt("pairs", "A1", true, 900, day("2026-09-16")),
      attempt("pairs", "A2", true, 900, day("2026-09-17")),
      attempt("pairs", "A3", true, 900, day("2026-09-18")),
      attempt("pairs", "A4", true, 900, day("2026-09-13")),
    ];
    expect(streaks(attemptsOf(events), { today: "2026-09-18" })).toEqual({ current: 3, longest: 3 });
  });

  it("stays current when yesterday was active and today has no attempt yet", () => {
    const events: AttemptLike[] = [attempt("pairs", "AB", true, 900, day("2026-09-17"))];
    expect(streaks(attemptsOf(events), { today: "2026-09-18" })).toEqual({ current: 1, longest: 1 });
  });

  it("is broken (current: 0) once the last active day is older than yesterday, but longest still reflects history", () => {
    const events: AttemptLike[] = [
      attempt("pairs", "A1", true, 900, day("2026-09-10")),
      attempt("pairs", "A2", true, 900, day("2026-09-11")),
      attempt("pairs", "A3", true, 900, day("2026-09-12")),
    ];
    expect(streaks(attemptsOf(events), { today: "2026-09-18" })).toEqual({ current: 0, longest: 3 });
  });

  it("longest reflects the best historical run even when the current run is shorter", () => {
    const events: AttemptLike[] = [
      attempt("pairs", "A1", true, 900, day("2026-09-01")),
      attempt("pairs", "A2", true, 900, day("2026-09-02")),
      attempt("pairs", "A3", true, 900, day("2026-09-03")),
      attempt("pairs", "A4", true, 900, day("2026-09-04")),
      attempt("pairs", "B1", true, 900, day("2026-09-18")),
    ];
    expect(streaks(attemptsOf(events), { today: "2026-09-18" })).toEqual({ current: 1, longest: 4 });
  });
});

describe("legacy memo attempts", () => {
  it("are summarised apart, oldest first, and never counted as drill attempts", () => {
    const legacy = (at: string, correct: number, total: number) => ({ type: "legacy.memoAttempt", at, legacy: { difficulty: "easy" }, derived: { correctLetters: correct, totalLetters: total } });
    const events = [legacy("2024-03-02T10:00:00.000Z", 18, 20), legacy("2024-01-05T10:00:00.000Z", 10, 20), { type: "drill.attempt", at: "2026-09-01T10:00:00.000Z" }];
    const summary = legacyMemoSummary(events);
    expect(summary).toMatchObject({ attempts: 2, first: "2024-01-05T10:00:00.000Z", last: "2024-03-02T10:00:00.000Z", correctLetters: 28, totalLetters: 40 });
    expect(summary?.rows.map((r) => r.correctLetters)).toEqual([10, 18]);
    expect(attemptsOf(events as AttemptLike[])).toHaveLength(0);
    expect(legacyMemoSummary([{ type: "drill.attempt", at: "2026-09-01T10:00:00.000Z" }])).toBeUndefined();
  });
});
