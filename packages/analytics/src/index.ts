/**
 * Progress analytics (BRIEF §8), derived from the append-only event log. Nothing here is stored: every
 * view is recomputed from graded `drill.attempt` events, so an export or import carries it along and
 * nothing can drift from the attempts behind it. No timer and no solve times: these views measure what
 * diagnoses slowness, which lookups are slow and which cases fail.
 *
 * Every view says when it doesn't have enough data instead of drawing a trend from three points.
 */

export interface AttemptLike {
  readonly type: string;
  readonly at: string;
  readonly trainer?: string;
  readonly caseId?: string;
  readonly correct?: boolean;
  readonly responseMs?: number;
  readonly strategy?: string;
  readonly detail?: Readonly<Record<string, unknown>>;
}

export interface Attempt {
  readonly at: string;
  /** Epoch milliseconds. */
  readonly time: number;
  readonly trainer: string;
  readonly caseId: string;
  readonly correct: boolean;
  readonly responseMs: number;
  readonly strategy: string | undefined;
  readonly detail: Readonly<Record<string, unknown>>;
}

/** Below this many samples a median or accuracy is shown as "not enough data yet". */
export const MIN_SAMPLES = 5;

/** Graded drill attempts, oldest first. */
export function attemptsOf(events: readonly AttemptLike[]): Attempt[] {
  const out: Attempt[] = [];
  for (const e of events) {
    if (e.type !== "drill.attempt" || e.trainer === undefined || e.caseId === undefined || e.correct === undefined || e.responseMs === undefined) continue;
    const time = Date.parse(e.at);
    if (Number.isNaN(time)) continue;
    out.push({ at: e.at, time, trainer: e.trainer, caseId: e.caseId, correct: e.correct, responseMs: e.responseMs, strategy: e.strategy, detail: e.detail ?? {} });
  }
  return out.sort((a, b) => a.time - b.time);
}

export function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

export interface CaseSummary {
  readonly trainer: string;
  readonly caseId: string;
  readonly attempts: number;
  readonly correct: number;
  readonly accuracy: number;
  readonly medianMs: number;
  readonly lastAt: string;
}

export const caseKey = (trainer: string, caseId: string): string => `${trainer}|${caseId}`;

/** Per case, keyed by `caseKey(trainer, caseId)`. */
export function summariseCases(attempts: readonly Attempt[], trainer?: string): Map<string, CaseSummary> {
  const groups = new Map<string, Attempt[]>();
  for (const a of attempts) {
    if (trainer !== undefined && a.trainer !== trainer) continue;
    const key = caseKey(a.trainer, a.caseId);
    const list = groups.get(key) ?? [];
    list.push(a);
    groups.set(key, list);
  }
  const out = new Map<string, CaseSummary>();
  for (const [key, list] of groups) {
    const first = list[0];
    const last = list[list.length - 1];
    if (first === undefined || last === undefined) continue;
    const correct = list.filter((a) => a.correct).length;
    out.set(key, { trainer: first.trainer, caseId: first.caseId, attempts: list.length, correct, accuracy: correct / list.length, medianMs: median(list.map((a) => a.responseMs)) ?? 0, lastAt: last.at });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------
// Trace diagnostics: median time per target by the kind of lookup (BRIEF §8).

export const LOOKUP_KINDS = ["first", "normal", "break", "twist"] as const;
export type LookupKind = (typeof LOOKUP_KINDS)[number];

export interface KindDiagnostics {
  readonly kind: LookupKind;
  readonly count: number;
  readonly medianMs: number | undefined;
  readonly accuracy: number | undefined;
  /** At least MIN_SAMPLES targets of this kind. */
  readonly enough: boolean;
}

export function traceDiagnostics(attempts: readonly Attempt[], options: { readonly since?: number } = {}): KindDiagnostics[] {
  const since = options.since ?? Number.NEGATIVE_INFINITY;
  return LOOKUP_KINDS.map((kind) => {
    const list = attempts.filter((a) => a.trainer === "trace" && a.time >= since && a.detail.kind === kind);
    const enough = list.length >= MIN_SAMPLES;
    return {
      kind,
      count: list.length,
      medianMs: list.length === 0 ? undefined : median(list.map((a) => a.responseMs)),
      accuracy: list.length === 0 ? undefined : list.filter((a) => a.correct).length / list.length,
      enough,
    };
  });
}

// ---------------------------------------------------------------------------------------------------
// Heatmap cells: recall speed as a lightness step, accuracy as a band (BRIEF §8).

export type AccuracyBand = "high" | "mid" | "low";

export interface HeatCell {
  readonly caseId: string;
  readonly attempts: number;
  readonly accuracy: number;
  readonly medianMs: number;
  /** 0 (slowest fifth) to 4 (fastest fifth), relative to your other cases in the same view. */
  readonly speedStep: 0 | 1 | 2 | 3 | 4;
  readonly accuracyBand: AccuracyBand;
}

export function accuracyBand(accuracy: number): AccuracyBand {
  return accuracy >= 0.9 ? "high" : accuracy >= 0.7 ? "mid" : "low";
}

/** One cell per case with at least one attempt, for one trainer (optionally a subset of its case ids). */
export function heatCells(attempts: readonly Attempt[], trainer: string, include: (caseId: string) => boolean = () => true): Map<string, HeatCell> {
  const summaries = [...summariseCases(attempts, trainer).values()].filter((s) => include(s.caseId));
  const medians = summaries.map((s) => s.medianMs).sort((a, b) => a - b);
  const stepOf = (ms: number): HeatCell["speedStep"] => {
    if (medians.length <= 1) return 2;
    // Fraction of cases at least as slow as this one: the fastest case scores 1.
    const slowerOrEqual = medians.filter((m) => m >= ms).length;
    const fraction = (slowerOrEqual - 1) / (medians.length - 1);
    return Math.min(4, Math.floor(fraction * 5)) as HeatCell["speedStep"];
  };
  return new Map(summaries.map((s) => [s.caseId, { caseId: s.caseId, attempts: s.attempts, accuracy: s.accuracy, medianMs: s.medianMs, speedStep: stepOf(s.medianMs), accuracyBand: accuracyBand(s.accuracy) }]));
}

// ---------------------------------------------------------------------------------------------------
// Trends over time, with a rolling window and an honest "not enough data yet" (BRIEF §8).

export type TrendMetric = "accuracy" | "medianMs";

export interface TrendPoint {
  /** The day, as `dayOf` names it. */
  readonly day: string;
  /** Attempts on that day. */
  readonly attempts: number;
  /** The metric over the rolling window that ends on this day. */
  readonly value: number;
  /** Attempts inside that window. */
  readonly windowAttempts: number;
}

export interface Trend {
  readonly metric: TrendMetric;
  readonly points: readonly TrendPoint[];
  /** Enough practice days and attempts for the line to mean something. */
  readonly enough: boolean;
}

/** A calendar day in UTC. The app passes its own local-day function. */
export const utcDay = (time: number): string => new Date(time).toISOString().slice(0, 10);

/** A "YYYY-MM-DD" day string as a count of days since the epoch -- consecutive calendar days are consecutive integers, which is what the streak run-length logic below relies on. */
const dayIndex = (day: string): number => Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000);

export function trend(attempts: readonly Attempt[], metric: TrendMetric, options: { readonly window?: number; readonly minDays?: number; readonly minAttempts?: number; readonly dayOf?: (time: number) => string } = {}): Trend {
  const window = options.window ?? 7;
  const minDays = options.minDays ?? 3;
  const minAttempts = options.minAttempts ?? 20;
  const dayOf = options.dayOf ?? utcDay;
  const byDay = new Map<string, Attempt[]>();
  for (const a of attempts) {
    const day = dayOf(a.time);
    const list = byDay.get(day) ?? [];
    list.push(a);
    byDay.set(day, list);
  }
  const days = [...byDay.keys()].sort();
  const points = days.map((day): TrendPoint => {
    const end = dayIndex(day);
    const inWindow = days.filter((d) => dayIndex(d) <= end && dayIndex(d) > end - window).flatMap((d) => byDay.get(d) ?? []);
    const value = metric === "accuracy" ? inWindow.filter((a) => a.correct).length / inWindow.length : (median(inWindow.map((a) => a.responseMs)) ?? 0);
    return { day, attempts: byDay.get(day)?.length ?? 0, value, windowAttempts: inWindow.length };
  });
  return { metric, points, enough: days.length >= minDays && attempts.length >= minAttempts };
}

// ---------------------------------------------------------------------------------------------------
// Activity calendar and streaks (v2 §H). Guest-available: this reads only the local event log, the
// same as everywhere else in this package -- an account is never required to see your own streak.
// Mirrors the server-side leaderboard_streaks() SQL (docs/DECISIONS.md D-059/D-060) exactly, so a
// signed-in device's own local view and the (opted-in) public leaderboard never quietly disagree
// about what "current streak" means. `dayOf` should bucket by the caller's own local timezone, not
// UTC -- utcDay is only the default for callers that genuinely want UTC days.

export interface ActivityDay {
  readonly day: string;
  readonly attempts: number;
}

/** One entry per local calendar day with at least one graded attempt (any drill.attempt event, correct or not -- BRIEF v2 §H: "a graded incorrect attempt also qualifies"). Duplicate attempts never double-count: attemptsOf() already dedupes by the event log's own id-uniqueness before this ever sees them. */
export function activityDays(attempts: readonly Attempt[], options: { readonly dayOf?: (time: number) => string } = {}): ActivityDay[] {
  const dayOf = options.dayOf ?? utcDay;
  const counts = new Map<string, number>();
  for (const a of attempts) counts.set(dayOf(a.time), (counts.get(dayOf(a.time)) ?? 0) + 1);
  return [...counts.entries()].map(([day, count]) => ({ day, attempts: count })).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

export interface Streaks {
  readonly current: number;
  readonly longest: number;
}

/**
 * Current and longest runs of consecutive active days. A run's current-ness is judged against
 * `today` (injectable for tests; defaults to now, in the same day-function as `attempts`): the most
 * recent active day must be today or yesterday, so a streak stays current when yesterday was active
 * and today hasn't ended yet, exactly as BRIEF v2 §H requires -- it does not go stale merely because
 * `dayOf`'s UTC "today" has rolled over while the user's own local day has not, provided the caller
 * passes a `dayOf` and `today` computed in the same (local) zone consistently.
 */
export function streaks(attempts: readonly Attempt[], options: { readonly dayOf?: (time: number) => string; readonly today?: string } = {}): Streaks {
  const dayOf = options.dayOf ?? utcDay;
  const days = [...new Set(attempts.map((a) => dayOf(a.time)))].sort();
  if (days.length === 0) return { current: 0, longest: 0 };

  let longestRun = 1;
  let longestSoFar = 1;
  for (let i = 1; i < days.length; i++) {
    const day = days[i];
    const prev = days[i - 1];
    if (day === undefined || prev === undefined) continue;
    longestRun = dayIndex(day) === dayIndex(prev) + 1 ? longestRun + 1 : 1;
    if (longestRun > longestSoFar) longestSoFar = longestRun;
  }

  const lastActiveDay = days[days.length - 1];
  if (lastActiveDay === undefined) return { current: 0, longest: longestSoFar };
  const today = options.today ?? dayOf(Date.now());
  const current = dayIndex(lastActiveDay) < dayIndex(today) - 1 ? 0 : (() => {
    let run = 1;
    for (let i = days.length - 1; i > 0; i--) {
      const day = days[i];
      const prev = days[i - 1];
      if (day === undefined || prev === undefined) break;
      if (dayIndex(day) !== dayIndex(prev) + 1) break;
      run++;
    }
    return run;
  })();

  return { current, longest: longestSoFar };
}

// ---------------------------------------------------------------------------------------------------
// Weak 20: the worst-performing items across every trainer (BRIEF §8).

export type WeakReason = "errors" | "slow" | "forgetting";

export interface WeakItem {
  readonly trainer: string;
  readonly caseId: string;
  readonly score: number;
  readonly attempts: number;
  readonly accuracy: number;
  readonly medianMs: number;
  readonly reasons: readonly WeakReason[];
}

/**
 * Score = half the smoothed error rate, (errors + 1) / (attempts + 2); three tenths slowness, the case's
 * place among its own trainer's medians (0 fastest, 1 slowest; trainers aren't compared on raw time); and
 * a fifth forgetting, 1 − FSRS recall probability (a half when unknown). Cases need `minAttempts`.
 */
export function weakItems(attempts: readonly Attempt[], options: { readonly limit?: number; readonly minAttempts?: number; readonly retrievability?: (trainer: string, caseId: string) => number | undefined } = {}): WeakItem[] {
  const limit = options.limit ?? 20;
  const minAttempts = options.minAttempts ?? 2;
  const summaries = [...summariseCases(attempts).values()].filter((s) => s.attempts >= minAttempts);
  const mediansByTrainer = new Map<string, number[]>();
  for (const s of summaries) mediansByTrainer.set(s.trainer, [...(mediansByTrainer.get(s.trainer) ?? []), s.medianMs]);
  const items = summaries.map((s): WeakItem => {
    const peers = (mediansByTrainer.get(s.trainer) ?? []).sort((a, b) => a - b);
    const slowness = peers.length <= 1 ? 0 : peers.filter((m) => m < s.medianMs).length / (peers.length - 1);
    const errorRate = (s.attempts - s.correct + 1) / (s.attempts + 2);
    const recall = options.retrievability?.(s.trainer, s.caseId);
    const forgetting = recall === undefined ? 0.5 : 1 - recall;
    const reasons: WeakReason[] = [];
    if (s.accuracy < 0.8) reasons.push("errors");
    if (slowness >= 0.75) reasons.push("slow");
    if (recall !== undefined && recall < 0.8) reasons.push("forgetting");
    return { trainer: s.trainer, caseId: s.caseId, score: 0.5 * errorRate + 0.3 * slowness + 0.2 * forgetting, attempts: s.attempts, accuracy: s.accuracy, medianMs: s.medianMs, reasons };
  });
  return items.sort((a, b) => b.score - a.score || (a.trainer < b.trainer ? -1 : a.trainer > b.trainer ? 1 : a.caseId < b.caseId ? -1 : 1)).slice(0, limit);
}

// ---------------------------------------------------------------------------------------------------
// Session summary: what improved, what regressed, what to do next (BRIEF §8).

export interface CaseChange {
  readonly caseId: string;
  readonly before: { readonly attempts: number; readonly accuracy: number; readonly medianMs: number };
  readonly now: { readonly attempts: number; readonly accuracy: number; readonly medianMs: number };
}

export type Suggestion =
  | { readonly kind: "repeat-misses"; readonly caseIds: readonly string[] }
  | { readonly kind: "slow-lookup"; readonly lookup: Exclude<LookupKind, "normal">; readonly medianMs: number; readonly normalMs: number }
  | { readonly kind: "speed-up"; readonly caseIds: readonly string[] }
  | { readonly kind: "keep-going" };

export interface SessionSummary {
  readonly attempts: number;
  readonly correct: number;
  readonly medianMs: number | undefined;
  readonly improved: readonly CaseChange[];
  readonly regressed: readonly CaseChange[];
  /** Cases drilled for the first time. */
  readonly firstTimes: number;
  readonly next: readonly Suggestion[];
}

/**
 * Compares a session's attempts with each case's history before it. A case improved if its accuracy rose
 * by at least 0.2, or held while its median time fell by at least a fifth; it regressed the other way.
 * Cases need two earlier attempts to be compared at all.
 */
export function sessionSummary(attempts: readonly Attempt[], trainer: string, sessionStart: number): SessionSummary {
  const mine = attempts.filter((a) => a.trainer === trainer);
  const session = mine.filter((a) => a.time >= sessionStart);
  const before = summariseCases(mine.filter((a) => a.time < sessionStart), trainer);
  const now = summariseCases(session, trainer);
  const improved: CaseChange[] = [];
  const regressed: CaseChange[] = [];
  let firstTimes = 0;
  for (const [key, s] of now) {
    const b = before.get(key);
    if (b === undefined) {
      firstTimes++;
      continue;
    }
    if (b.attempts < 2) continue;
    const change: CaseChange = { caseId: s.caseId, before: { attempts: b.attempts, accuracy: b.accuracy, medianMs: b.medianMs }, now: { attempts: s.attempts, accuracy: s.accuracy, medianMs: s.medianMs } };
    const accuracyDelta = s.accuracy - b.accuracy;
    if (accuracyDelta >= 0.2 || (accuracyDelta >= 0 && s.medianMs <= b.medianMs * 0.8)) improved.push(change);
    else if (accuracyDelta <= -0.2 || (accuracyDelta <= 0 && s.medianMs >= b.medianMs * 1.25)) regressed.push(change);
  }

  const next: Suggestion[] = [];
  const missed = [...now.values()].filter((s) => s.correct < s.attempts).sort((a, b) => b.attempts - b.correct - (a.attempts - a.correct) || (a.caseId < b.caseId ? -1 : 1));
  if (missed.length > 0) next.push({ kind: "repeat-misses", caseIds: missed.slice(0, 5).map((s) => s.caseId) });
  if (trainer === "trace") {
    const kinds = traceDiagnostics(mine);
    const normal = kinds.find((k) => k.kind === "normal");
    const slowest = kinds.filter((k): k is KindDiagnostics & { kind: Exclude<LookupKind, "normal">; medianMs: number } => k.kind !== "normal" && k.enough && k.medianMs !== undefined).sort((a, b) => b.medianMs - a.medianMs)[0];
    if (normal?.enough === true && normal.medianMs !== undefined && slowest !== undefined && slowest.medianMs >= normal.medianMs * 1.5) next.push({ kind: "slow-lookup", lookup: slowest.kind, medianMs: slowest.medianMs, normalMs: normal.medianMs });
  }
  const slowRegressions = regressed.filter((c) => c.now.accuracy >= c.before.accuracy).map((c) => c.caseId);
  if (slowRegressions.length > 0) next.push({ kind: "speed-up", caseIds: slowRegressions.slice(0, 5) });
  if (next.length === 0) next.push({ kind: "keep-going" });

  return {
    attempts: session.length,
    correct: session.filter((a) => a.correct).length,
    medianMs: median(session.map((a) => a.responseMs)),
    improved: improved.sort((a, b) => (a.caseId < b.caseId ? -1 : 1)),
    regressed: regressed.sort((a, b) => (a.caseId < b.caseId ? -1 : 1)),
    firstTimes,
    next,
  };
}

/** An imported memo attempt from the old app (`legacy.memoAttempt`), as far as the summary needs it. */
export interface LegacyMemoLike {
  readonly type: string;
  readonly at: string;
  readonly legacy?: { readonly difficulty?: string };
  readonly derived?: { readonly correctLetters: number; readonly totalLetters: number };
}

export interface LegacyMemoRow {
  readonly at: string;
  readonly difficulty: string;
  readonly correctLetters: number;
  readonly totalLetters: number;
}

export interface LegacyMemoSummary {
  readonly attempts: number;
  readonly first: string;
  readonly last: string;
  readonly correctLetters: number;
  readonly totalLetters: number;
  /** Oldest first. */
  readonly rows: readonly LegacyMemoRow[];
}

/**
 * The old app's memo attempts, summarised as what they are: whole memos scored letter by letter in order
 * (the import's LCS scorer). They carry no per-pair timing and no per-pair result, so they never feed the
 * attempt-based views; this only reports them. Undefined when there are none.
 */
export function legacyMemoSummary(events: readonly LegacyMemoLike[]): LegacyMemoSummary | undefined {
  const rows = events
    .flatMap((e): LegacyMemoRow[] => (e.type === "legacy.memoAttempt" && e.derived !== undefined && !Number.isNaN(Date.parse(e.at)) ? [{ at: e.at, difficulty: e.legacy?.difficulty ?? "", correctLetters: e.derived.correctLetters, totalLetters: e.derived.totalLetters }] : []))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (first === undefined || last === undefined) return undefined;
  return {
    attempts: rows.length,
    first: first.at,
    last: last.at,
    correctLetters: rows.reduce((sum, r) => sum + r.correctLetters, 0),
    totalLetters: rows.reduce((sum, r) => sum + r.totalLetters, 0),
    rows,
  };
}
