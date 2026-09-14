import * as z from "zod";
import { err, ok, type Result } from "../core/result.js";
import type { TraceResult } from "../trace/trace.js";

/**
 * Constraints on traces, as data (BRIEF §5.6, §7.7): what a constrained scramble must look like,
 * saved in presets and shared in URLs. Keys name trace configs (for example `corners` and `edges`).
 *
 * What each field counts:
 * - `targets`: `TraceResult.targetCount`.
 * - `cycleBreaks`: cycles of kind `break`, breaks into an unsolved piece. Orientation cycles are not
 *   counted here; they are `misoriented`.
 * - `misoriented`: twisted or flipped non-buffer pieces, whichever way the trace reports them:
 *   `orientedInPlace` entries under `separate`, orientation cycles under `asTargets`. So "at least one
 *   twisted corner" means the same under both policies.
 * - `parity`: `TraceResult.parity`.
 */

const Bound = z
  .object({ min: z.number().int().nonnegative().optional(), max: z.number().int().nonnegative().optional() })
  .strict()
  .refine((b) => b.min === undefined || b.max === undefined || b.min <= b.max, { message: "min is greater than max" });

export const PieceConstraintsSchema = z
  .object({
    targets: Bound.optional(),
    cycleBreaks: Bound.optional(),
    misoriented: Bound.optional(),
    parity: z.boolean().optional(),
  })
  .strict();

export const TraceConstraintsSchema = z.record(z.string().min(1), PieceConstraintsSchema);

export type PieceConstraints = z.infer<typeof PieceConstraintsSchema>;
export type TraceConstraints = z.infer<typeof TraceConstraintsSchema>;
export type ConstraintField = keyof PieceConstraints;

export interface ConstraintMeasures {
  readonly targets: number;
  readonly cycleBreaks: number;
  readonly misoriented: number;
  readonly parity: boolean;
}

export function constraintMeasures(traced: TraceResult): ConstraintMeasures {
  return {
    targets: traced.targetCount,
    cycleBreaks: traced.cycles.filter((c) => c.kind === "break").length,
    misoriented: traced.orientedInPlace.filter((o) => !o.isBuffer).length + traced.cycles.filter((c) => c.kind === "orientation").length,
    parity: traced.parity,
  };
}

export interface ConstraintFailure {
  readonly trace: string;
  readonly field: ConstraintField;
}

/** The fields each trace fails, in constraint order. A constraint naming a trace that isn't there fails on every field it sets. */
export function constraintFailures(traces: Readonly<Record<string, TraceResult>>, constraints: TraceConstraints): ConstraintFailure[] {
  const failures: ConstraintFailure[] = [];
  for (const [name, piece] of Object.entries(constraints)) {
    const traced = traces[name];
    const measures = traced === undefined ? undefined : constraintMeasures(traced);
    for (const field of ["targets", "cycleBreaks", "misoriented"] as const) {
      const bound = piece[field];
      if (bound === undefined) continue;
      const value = measures?.[field];
      if (value === undefined || (bound.min !== undefined && value < bound.min) || (bound.max !== undefined && value > bound.max)) failures.push({ trace: name, field });
    }
    if (piece.parity !== undefined && measures?.parity !== piece.parity) failures.push({ trace: name, field: "parity" });
  }
  return failures;
}

export function matchesConstraints(traces: Readonly<Record<string, TraceResult>>, constraints: TraceConstraints): boolean {
  return constraintFailures(traces, constraints).length === 0;
}

export type ConstraintIssue =
  | { readonly code: "invalid"; readonly path: readonly (string | number)[]; readonly message: string }
  | { readonly code: "unknown-trace"; readonly trace: string };

/** Parse untrusted constraints, and check every key names one of the trace configs they'll be used with. */
export function validateConstraints(input: unknown, traceNames: readonly string[]): Result<TraceConstraints, ConstraintIssue[]> {
  const parsed = TraceConstraintsSchema.safeParse(input);
  if (!parsed.success) {
    return err(parsed.error.issues.map((issue): ConstraintIssue => ({ code: "invalid", path: issue.path.map((p) => (typeof p === "symbol" ? String(p) : p)), message: issue.message })));
  }
  const unknown = Object.keys(parsed.data).filter((name) => !traceNames.includes(name));
  if (unknown.length > 0) return err(unknown.map((trace): ConstraintIssue => ({ code: "unknown-trace", trace })));
  return ok(parsed.data);
}
