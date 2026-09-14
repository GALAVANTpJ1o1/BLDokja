import type { AlgMove } from "../commutator/parse.js";
import type { TraceResult } from "../trace/trace.js";

/**
 * What a method solver returns: the traces it memorised from, and the solve as executable steps with
 * their teaching data. Steps carry codes and sticker names, never English and never letters; letters
 * stay in the traces, looked up through each step's `traceIndex`.
 */

/** Rotate the cube into the frame the memo was traced in (centres solved). */
export interface FrameStep {
  readonly kind: "frame";
  readonly rotation: readonly AlgMove[];
}

/** Shoot one traced target: setup, the method's core alg, then undo the setup. */
export interface TargetStep {
  readonly kind: "target";
  readonly pieceType: "corners" | "edges";
  /** Index into the piece type's `TraceResult.targets` (and `targetStickers`, `targetKinds`). */
  readonly traceIndex: number;
  readonly target: string;
  /**
   * Set when the method shot another sticker's case for this target: M2 on an odd step shoots UF
   * with DB's alg, and so on (DECISIONS D-025).
   */
  readonly shotAs?: string;
  readonly setup: readonly AlgMove[];
  readonly core: readonly AlgMove[];
  readonly undo: readonly AlgMove[];
}

/** The parity alg, with the leftover swaps it cancels. */
export interface ParityStep {
  readonly kind: "parity";
  readonly alg: readonly AlgMove[];
  /** Pieces swapped as a leftover when the step runs, per piece type. */
  readonly cancels: { readonly corners: readonly string[]; readonly edges: readonly string[] };
}

export type MethodStep = FrameStep | TargetStep | ParityStep;

export interface MethodSolution {
  readonly method: "op-op" | "m2-op";
  readonly traces: { readonly corners: TraceResult; readonly edges: TraceResult };
  readonly steps: readonly MethodStep[];
  /** Every step's moves in order, uncancelled: exactly what gets executed. */
  readonly moves: readonly AlgMove[];
}

export function stepMoves(step: MethodStep): readonly AlgMove[] {
  switch (step.kind) {
    case "frame":
      return step.rotation;
    case "target":
      return [...step.setup, ...step.core, ...step.undo];
    case "parity":
      return step.alg;
  }
}
