import { err, ok, type Result } from "../core/result.js";
import { createRng, type Rng, shuffled } from "./prng.js";

/**
 * Selection strategies for drills (BRIEF §5.6), kept apart from scramble generation.
 *
 * A selector picks the next case id from a fixed set. Every strategy runs behind the same recency
 * guard, draws only from its own seeded generator, and reads performance through an injected
 * `CaseStatsProvider`, so cube-engine never depends on FSRS or storage (D-028).
 */

export const SELECTION_STRATEGIES = ["uniform", "coverage", "weakness", "adversarial", "spaced"] as const;
export type SelectionStrategy = (typeof SELECTION_STRATEGIES)[number];

/** What the caller knows about one case. Supplied by the SRS and analytics layers. */
export interface CaseStats {
  /** Graded attempts so far (integer ≥ 0). */
  readonly attempts: number;
  /** Wrong attempts among them (integer, 0..attempts). */
  readonly errors: number;
  /** FSRS retrievability at the selection time, in [0, 1], if the case has a card. */
  readonly retrievability?: number;
  /** When the case's FSRS card is due, in epoch milliseconds, if it has one. */
  readonly due?: number;
}

export type CaseStatsProvider = (caseId: string) => CaseStats | undefined;

export interface SelectionContext {
  readonly stats?: CaseStatsProvider;
  /** Epoch milliseconds. Required by `spaced`, ignored by the others. */
  readonly now?: number;
}

export interface SelectorOptions {
  readonly strategy: SelectionStrategy;
  readonly cases: readonly string[];
  /** A shareable seed string, or a 32-bit integer. */
  readonly seed: string | number;
  /** Recency window. Defaults to `defaultRecencyWindow(cases.length)`; always capped at size − 1. */
  readonly recency?: number;
}

export type SelectorOptionError =
  | { readonly code: "empty-set" }
  | { readonly code: "duplicate-case"; readonly caseId: string }
  | { readonly code: "invalid-recency"; readonly recency: number }
  | { readonly code: "unknown-strategy"; readonly strategy: string };

export type SelectionError =
  /** `spaced` only: nothing is due, or everything due was shown within the recency window. */
  | { readonly reason: "nothing-due"; readonly dueButRecent: number }
  | { readonly reason: "missing-now" }
  | { readonly reason: "invalid-stats"; readonly caseId: string; readonly issue: string };

export interface Selector {
  readonly strategy: SelectionStrategy;
  readonly cases: readonly string[];
  /** The effective recency window: no case repeats within this many picks. */
  readonly recency: number;
  next(context?: SelectionContext): Result<string, SelectionError>;
  /** The last `recency` picks, oldest first. */
  recent(): readonly string[];
}

/** Weakness contributes `WEAKNESS_FLOOR + w`; every case keeps a nonzero chance. */
export const WEAKNESS_FLOOR = 0.05;
/** Adversarial contributes `ADVERSARIAL_FLOOR + w⁴`, which concentrates on the worst cases. */
export const ADVERSARIAL_FLOOR = 0.005;

/**
 * The default recency window: a quarter of the set, clamped to 1..10, and never more than size − 1
 * so a pick always exists. 4 cases → 1, 22 → 5, 440 → 10.
 */
export function defaultRecencyWindow(size: number): number {
  if (size <= 1) return 0;
  return Math.min(size - 1, Math.max(1, Math.min(10, Math.floor(size / 4))));
}

function statsIssue(stats: CaseStats): string | undefined {
  if (!Number.isInteger(stats.attempts) || stats.attempts < 0) return "attempts must be an integer ≥ 0";
  if (!Number.isInteger(stats.errors) || stats.errors < 0 || stats.errors > stats.attempts) return "errors must be an integer in 0..attempts";
  if (stats.retrievability !== undefined && !(stats.retrievability >= 0 && stats.retrievability <= 1)) return "retrievability must be in [0, 1]";
  if (stats.due !== undefined && !Number.isFinite(stats.due)) return "due must be a finite number";
  return undefined;
}

function hasHistory(stats: CaseStats | undefined): stats is CaseStats {
  return stats !== undefined && (stats.attempts > 0 || stats.retrievability !== undefined);
}

/**
 * How weak a case is, in [0, 1]: the Laplace-smoothed error rate (errors + 1) / (attempts + 2),
 * averaged with forgetting (1 − retrievability) when the case has an FSRS card.
 */
export function caseWeakness(stats: CaseStats): number {
  const errorRate = (stats.errors + 1) / (stats.attempts + 2);
  return stats.retrievability === undefined ? errorRate : (1 - stats.retrievability + errorRate) / 2;
}

function readStats(cases: readonly string[], provider: CaseStatsProvider | undefined): Result<(CaseStats | undefined)[], SelectionError> {
  const out: (CaseStats | undefined)[] = [];
  for (const caseId of cases) {
    const stats = provider?.(caseId);
    if (stats !== undefined) {
      const issue = statsIssue(stats);
      if (issue !== undefined) return err({ reason: "invalid-stats", caseId, issue });
    }
    out.push(stats);
  }
  return ok(out);
}

/**
 * Per-case sampling weights for `weakness` and `adversarial`, in case order. A case with no history
 * counts as weak as the weakest case that has one, or fully weak if none has.
 */
export function selectionWeights(
  strategy: "weakness" | "adversarial",
  cases: readonly string[],
  provider: CaseStatsProvider | undefined,
): Result<number[], SelectionError> {
  const read = readStats(cases, provider);
  if (!read.ok) return read;
  const known = read.value.map((s) => (hasHistory(s) ? caseWeakness(s) : undefined));
  const seen = known.filter((w): w is number => w !== undefined);
  const unseen = seen.length === 0 ? 1 : Math.max(...seen);
  return ok(
    known.map((w) => {
      const weakness = w ?? unseen;
      return strategy === "weakness" ? WEAKNESS_FLOOR + weakness : ADVERSARIAL_FLOOR + weakness ** 4;
    }),
  );
}

function weightedIndex(rng: Rng, weights: readonly number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  const target = rng.float() * total;
  let running = 0;
  for (let i = 0; i < weights.length; i++) {
    running += weights[i] ?? 0;
    if (target < running) return i;
  }
  return weights.length - 1;
}

class SeededSelector implements Selector {
  readonly strategy: SelectionStrategy;
  readonly cases: readonly string[];
  readonly recency: number;
  readonly #rng: Rng;
  readonly #recent: string[] = [];
  #round: string[] = [];

  constructor(strategy: SelectionStrategy, cases: readonly string[], recency: number, rng: Rng) {
    this.strategy = strategy;
    this.cases = cases;
    this.recency = recency;
    this.#rng = rng;
  }

  recent(): readonly string[] {
    return [...this.#recent];
  }

  next(context: SelectionContext = {}): Result<string, SelectionError> {
    const picked = this.#choose(context, new Set(this.#recent));
    if (!picked.ok) return picked;
    if (this.recency > 0) {
      this.#recent.push(picked.value);
      if (this.#recent.length > this.recency) this.#recent.shift();
    }
    return picked;
  }

  #choose(context: SelectionContext, recent: ReadonlySet<string>): Result<string, SelectionError> {
    switch (this.strategy) {
      case "uniform": {
        const candidates = this.cases.filter((c) => !recent.has(c));
        return ok(this.#at(candidates, this.#rng.int(candidates.length)));
      }
      case "coverage":
        return ok(this.#coverage(recent));
      case "weakness":
      case "adversarial": {
        const weights = selectionWeights(this.strategy, this.cases, context.stats);
        if (!weights.ok) return weights;
        const indices = this.cases.flatMap((c, i) => (recent.has(c) ? [] : [i]));
        const index = indices[weightedIndex(this.#rng, indices.map((i) => weights.value[i] ?? 0))];
        return ok(this.#at(this.cases, index ?? -1));
      }
      case "spaced":
        return this.#spaced(context, recent);
    }
  }

  /** Round-robin over seeded shuffles. The guard only reorders within a round, so every case appears once per round. */
  #coverage(recent: ReadonlySet<string>): string {
    if (this.#round.length === 0) this.#round = shuffled(this.#rng, this.cases);
    // A candidate always exists: the window holds at most size − 1 distinct cases, and the ones from
    // earlier rounds can't cover what remains of this round (D-028).
    const index = this.#round.findIndex((c) => !recent.has(c));
    const [chosen] = this.#round.splice(index, 1);
    if (index < 0 || chosen === undefined) throw new Error("coverage: no candidate outside the recency window");
    return chosen;
  }

  /** The FSRS due queue: due cases, most overdue first, then least retrievable, then set order. */
  #spaced(context: SelectionContext, recent: ReadonlySet<string>): Result<string, SelectionError> {
    if (context.now === undefined || !Number.isFinite(context.now)) return err({ reason: "missing-now" });
    const now = context.now;
    const read = readStats(this.cases, context.stats);
    if (!read.ok) return read;
    const due = this.cases
      .map((caseId, index) => ({ caseId, index, stats: read.value[index] }))
      .filter((c) => c.stats?.due !== undefined && c.stats.due <= now)
      .sort((a, b) => (a.stats?.due ?? 0) - (b.stats?.due ?? 0) || (a.stats?.retrievability ?? 1) - (b.stats?.retrievability ?? 1) || a.index - b.index);
    const chosen = due.find((c) => !recent.has(c.caseId));
    return chosen === undefined ? err({ reason: "nothing-due", dueButRecent: due.length }) : ok(chosen.caseId);
  }

  #at(items: readonly string[], index: number): string {
    const item = items[index];
    if (item === undefined) throw new Error(`${this.strategy}: no candidate outside the recency window`);
    return item;
  }
}

export function createSelector(options: SelectorOptions): Result<Selector, SelectorOptionError> {
  if (!(SELECTION_STRATEGIES as readonly string[]).includes(options.strategy)) return err({ code: "unknown-strategy", strategy: options.strategy });
  if (options.cases.length === 0) return err({ code: "empty-set" });
  const seen = new Set<string>();
  for (const caseId of options.cases) {
    if (seen.has(caseId)) return err({ code: "duplicate-case", caseId });
    seen.add(caseId);
  }
  const { recency } = options;
  if (recency !== undefined && (!Number.isInteger(recency) || recency < 0)) return err({ code: "invalid-recency", recency });
  const window = Math.min(recency ?? defaultRecencyWindow(options.cases.length), options.cases.length - 1);
  return ok(new SeededSelector(options.strategy, [...options.cases], window, createRng(options.seed)));
}
