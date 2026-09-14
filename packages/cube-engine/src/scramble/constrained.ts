import type { KPattern } from "cubing/kpuzzle";
import type { Puzzle } from "../core/puzzle.js";
import { trace, type TraceConfig, type TraceError, type TraceResult } from "../trace/trace.js";
import { constraintFailures, constraintMeasures, validateConstraints, type ConstraintIssue, type TraceConstraints } from "./constraints.js";
import type { ScrambleProvider } from "./providers.js";

/**
 * Constrained scrambles (BRIEF §5.6, DECISIONS D-027): rejection sampling with a budget. Each
 * candidate's state is traced and tested; only an accepted one is turned into a scramble, and that
 * scramble is traced again, so a result can never fail to match. The provider is asked for at most
 * `maxAttempts` candidates, and every failure is a typed reason.
 */

export type Traces = Readonly<Record<string, TraceResult>>;

export interface ConstrainedOptions {
  readonly provider: ScrambleProvider;
  /** Named trace configs, for example `{ corners, edges }`. Constraints refer to these names. */
  readonly traceConfigs: Readonly<Record<string, TraceConfig>>;
  readonly accept: TraceConstraints | ((traces: Traces) => boolean);
  /** How many candidates to try at most; a positive integer. */
  readonly maxAttempts: number;
}

interface Range {
  min: number;
  max: number;
}

export interface TraceStats {
  readonly targets: Range;
  readonly cycleBreaks: Range;
  readonly misoriented: Range;
  /** How many candidates had parity. */
  readonly parity: number;
}

export interface ConstrainedStats {
  readonly traces: Readonly<Record<string, TraceStats>>;
  /** With a constraints object: how many candidates failed each `trace.field`. */
  readonly failures: Readonly<Record<string, number>>;
}

export type ConstrainedResult =
  | { readonly ok: true; readonly scramble: string; readonly state: KPattern; readonly traces: Traces; readonly attempts: number }
  | { readonly ok: false; readonly reason: "budget-exhausted"; readonly attempts: number; readonly stats: ConstrainedStats }
  | { readonly ok: false; readonly reason: "trace-error"; readonly attempts: number; readonly config: string; readonly error: TraceError }
  | { readonly ok: false; readonly reason: "scramble-mismatch"; readonly attempts: number; readonly scramble: string; readonly config: string }
  | { readonly ok: false; readonly reason: "invalid-options"; readonly issues: readonly InvalidOption[] };

export type InvalidOption =
  | { readonly code: "max-attempts"; readonly value: number }
  | { readonly code: "no-trace-configs" }
  | { readonly code: "puzzle-mismatch"; readonly provider: string; readonly puzzle: string }
  | ConstraintIssue;

function traceAll(puzzle: Puzzle, input: { pattern: KPattern } | { alg: string }, configs: Readonly<Record<string, TraceConfig>>): { traces: Traces } | { config: string; error: TraceError } {
  const traces: Record<string, TraceResult> = {};
  for (const [name, config] of Object.entries(configs)) {
    const result = trace(puzzle, input, config);
    if (!result.ok) return { config: name, error: result.error };
    traces[name] = result.value;
  }
  return { traces };
}

export async function generateConstrained(puzzle: Puzzle, options: ConstrainedOptions): Promise<ConstrainedResult> {
  const issues: InvalidOption[] = [];
  if (!Number.isInteger(options.maxAttempts) || options.maxAttempts < 1) issues.push({ code: "max-attempts", value: options.maxAttempts });
  if (Object.keys(options.traceConfigs).length === 0) issues.push({ code: "no-trace-configs" });
  if (options.provider.puzzle !== puzzle.id) issues.push({ code: "puzzle-mismatch", provider: options.provider.puzzle, puzzle: puzzle.id });
  let constraints: TraceConstraints | undefined;
  if (typeof options.accept !== "function") {
    const validated = validateConstraints(options.accept, Object.keys(options.traceConfigs));
    if (validated.ok) constraints = validated.value;
    else issues.push(...validated.error);
  }
  if (issues.length > 0) return { ok: false, reason: "invalid-options", issues };

  const accept = options.accept;
  const stats: Record<string, { targets: Range; cycleBreaks: Range; misoriented: Range; parity: number }> = {};
  const failures: Record<string, number> = {};
  const widen = (range: Range, value: number) => {
    range.min = Math.min(range.min, value);
    range.max = Math.max(range.max, value);
  };

  for (let attempts = 1; attempts <= options.maxAttempts; attempts++) {
    const candidate = await options.provider.next();
    const traced = traceAll(puzzle, { pattern: candidate.state }, options.traceConfigs);
    if (!("traces" in traced)) return { ok: false, reason: "trace-error", attempts, config: traced.config, error: traced.error };
    const { traces } = traced;

    for (const [name, result] of Object.entries(traces)) {
      const m = constraintMeasures(result);
      const s = (stats[name] ??= { targets: { min: m.targets, max: m.targets }, cycleBreaks: { min: m.cycleBreaks, max: m.cycleBreaks }, misoriented: { min: m.misoriented, max: m.misoriented }, parity: 0 });
      widen(s.targets, m.targets);
      widen(s.cycleBreaks, m.cycleBreaks);
      widen(s.misoriented, m.misoriented);
      if (m.parity) s.parity++;
    }

    let accepted: boolean;
    if (typeof accept === "function") {
      accepted = accept(traces);
    } else {
      const failed = constraintFailures(traces, constraints ?? accept);
      for (const f of failed) failures[`${f.trace}.${f.field}`] = (failures[`${f.trace}.${f.field}`] ?? 0) + 1;
      accepted = failed.length === 0;
    }
    if (!accepted) continue;

    const scramble = await candidate.scramble();
    const retraced = traceAll(puzzle, { alg: scramble }, options.traceConfigs);
    if (!("traces" in retraced)) return { ok: false, reason: "scramble-mismatch", attempts, scramble, config: retraced.config };
    const mismatch = Object.keys(traces).find((name) => JSON.stringify(traces[name]) !== JSON.stringify(retraced.traces[name]));
    if (mismatch !== undefined) return { ok: false, reason: "scramble-mismatch", attempts, scramble, config: mismatch };
    return { ok: true, scramble, state: candidate.state, traces, attempts };
  }
  return { ok: false, reason: "budget-exhausted", attempts: options.maxAttempts, stats: { traces: stats, failures } };
}
