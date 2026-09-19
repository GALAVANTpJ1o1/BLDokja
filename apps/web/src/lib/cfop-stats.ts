import type { AppEvent } from "@bld/storage";

/**
 * Per-case practice statistics for the CFOP trainers (polish brief §50-51). Nothing here is stored: every figure is
 * folded from the `drill.attempt` events the trainers already write, so there is one progress system, saved progress is
 * untouched, and a case's history follows the account through sync like every other attempt.
 *
 * Recognition attempts (`trainer: "ll-recognition"`) carry `detail.stage`, `detail.answerCaseId`/`detail.answer` on a
 * wrong answer, and `responseMs` measured from the case appearing to the answer being committed, never including the
 * algorithm animation. F2L attempts (`trainer: "f2l-practice"`) carry `detail.moves`, `hints`, `resets`, `level`.
 */
export const LL_TRAINER = "ll-recognition";
export const F2L_TRAINER = "f2l-practice";

export type CaseStatus = "unlearned" | "learning" | "learned";
export type Trend = "faster" | "slower" | "steady" | "unknown";

export interface CaseStat {
  readonly caseId: string;
  readonly attempts: number;
  readonly correct: number;
  readonly accuracy: number;
  /** Average recognition time of correct answers, in ms. */
  readonly averageMs: number | undefined;
  readonly bestMs: number | undefined;
  /** Median of the last five correct times. */
  readonly recentMs: number | undefined;
  readonly trend: Trend;
  /** The last ten results, oldest first. */
  readonly recent: readonly boolean[];
  readonly wrongAnswers: Readonly<Record<string, number>>;
  readonly mostCommonWrong: string | undefined;
  readonly lastAt: string | undefined;
  readonly lastWrongAt: string | undefined;
  /** F2L: total moves over correct solves and how many hints and resets were used. */
  readonly moves: number;
  readonly hints: number;
  readonly resets: number;
}

const median = (values: readonly number[]): number | undefined => {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
};

const mean = (values: readonly number[]): number | undefined => (values.length === 0 ? undefined : values.reduce((a, b) => a + b, 0) / values.length);

function detailNumber(detail: Record<string, unknown> | undefined, key: string): number {
  const value = detail?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function detailString(detail: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = detail?.[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

export function trendOf(times: readonly number[]): Trend {
  if (times.length < 6) return "unknown";
  const last = times.slice(-3); const before = times.slice(-6, -3);
  const a = mean(last) ?? 0; const b = mean(before) ?? 0;
  if (b === 0) return "unknown";
  return a < b * 0.85 ? "faster" : a > b * 1.15 ? "slower" : "steady";
}

/** Fold the events of one trainer into per-case statistics, in time order. */
export function foldStats(events: readonly AppEvent[], trainer: string): Map<string, CaseStat> {
  const attempts = events
    .flatMap((event) => (event.type === "drill.attempt" && event.trainer === trainer ? [event] : []))
    .sort((a, b) => a.at.localeCompare(b.at));
  const byCase = new Map<string, typeof attempts>();
  for (const attempt of attempts) byCase.set(attempt.caseId, [...(byCase.get(attempt.caseId) ?? []), attempt]);
  const out = new Map<string, CaseStat>();
  for (const [caseId, list] of byCase) {
    const correct = list.filter((a) => a.correct);
    const times = correct.map((a) => a.responseMs);
    const wrong: Record<string, number> = {};
    for (const a of list) {
      if (a.correct) continue;
      const answer = detailString(a.detail, "answerCaseId") ?? detailString(a.detail, "answer");
      if (answer !== undefined) wrong[answer] = (wrong[answer] ?? 0) + 1;
    }
    const worst = Object.entries(wrong).sort((x, y) => y[1] - x[1])[0]?.[0];
    const lastWrong = [...list].reverse().find((a) => !a.correct);
    out.set(caseId, {
      caseId, attempts: list.length, correct: correct.length, accuracy: correct.length / list.length,
      averageMs: mean(times), bestMs: times.length === 0 ? undefined : Math.min(...times), recentMs: median(times.slice(-5)), trend: trendOf(times),
      recent: list.slice(-10).map((a) => a.correct), wrongAnswers: wrong, mostCommonWrong: worst,
      lastAt: list[list.length - 1]?.at, lastWrongAt: lastWrong?.at,
      moves: correct.reduce((sum, a) => sum + detailNumber(a.detail, "moves"), 0), hints: list.reduce((sum, a) => sum + detailNumber(a.detail, "hints"), 0), resets: list.reduce((sum, a) => sum + detailNumber(a.detail, "resets"), 0),
    });
  }
  return out;
}

/** Learned after five correct answers in a row at a steady pace; learning after any attempt; otherwise unlearned (D-083). */
export const LEARNED_STREAK = 5;
export const LEARNED_MAX_MS = 6000;

export function inferStatus(stat: CaseStat | undefined): CaseStatus {
  if (stat === undefined || stat.attempts === 0) return "unlearned";
  const last = stat.recent.slice(-LEARNED_STREAK);
  const solid = last.length === LEARNED_STREAK && last.every(Boolean);
  const paced = stat.recentMs === undefined || stat.recentMs <= LEARNED_MAX_MS;
  return solid && paced ? "learned" : "learning";
}

/** A hand-set status wins; otherwise the practice decides. */
export interface EffectiveStatus { readonly value: CaseStatus; readonly manual: boolean; /** What practice alone says, kept so a hand-set status can show what clearing it would give. */ readonly inferred: CaseStatus }

export function effectiveStatus(caseId: string, stat: CaseStat | undefined, manual: Readonly<Record<string, CaseStatus>> | undefined): EffectiveStatus {
  const inferred = inferStatus(stat);
  const set = manual?.[caseId];
  return set !== undefined ? { value: set, manual: true, inferred } : { value: inferred, manual: false, inferred };
}

export type PracticeFilter = "all" | "learning" | "weak" | "slowest" | "recentlyWrong" | "neverSeen";

/**
 * Which case ids a practice filter allows, and how strongly each is weighted. Weak = accuracy below 80% over at least two
 * attempts; slowest = the slowest quarter by recent time; recently wrong = wrong in the last three attempts. An empty
 * result means the caller should fall back to every case and say so.
 */
export function filterCases(ids: readonly string[], stats: ReadonlyMap<string, CaseStat>, filter: PracticeFilter, manual?: Readonly<Record<string, CaseStatus>>): string[] {
  switch (filter) {
    case "all": return [...ids];
    case "learning": return ids.filter((id) => effectiveStatus(id, stats.get(id), manual).value === "learning");
    case "weak": return ids.filter((id) => { const s = stats.get(id); return s !== undefined && s.attempts >= 2 && s.accuracy < 0.8; });
    case "neverSeen": return ids.filter((id) => (stats.get(id)?.attempts ?? 0) === 0);
    case "recentlyWrong": return ids.filter((id) => (stats.get(id)?.recent.slice(-3) ?? []).includes(false));
    case "slowest": {
      const timed = ids.flatMap((id) => { const ms = stats.get(id)?.recentMs; return ms === undefined ? [] : [[id, ms] as const]; }).sort((a, b) => b[1] - a[1]);
      return timed.slice(0, Math.max(1, Math.ceil(timed.length / 4))).map(([id]) => id);
    }
  }
}

/** Selection weight for a case: unseen and struggling cases come up more often, cases you have mastered less. */
export function caseWeight(stat: CaseStat | undefined): number {
  if (stat === undefined || stat.attempts === 0) return 2;
  return 0.5 + (1 - stat.accuracy) * 3 + (stat.trend === "slower" ? 0.5 : 0);
}
