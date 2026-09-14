import type { AlgMove } from "../commutator/parse.js";
import type { TwistDirection } from "../pieces/orientation.js";
import type { TraceResult } from "../trace/trace.js";

/**
 * What a method solver returns: the traces it memorised from, and the solve as executable steps with
 * their teaching data. Steps carry codes and sticker names, never English and never letters; letters
 * stay in the traces, looked up through each step's trace index.
 */

export type SolvedPieceType = "corners" | "edges";

/** Rotate the cube into the frame the memo was traced in (centres solved). */
export interface FrameStep {
  readonly kind: "frame";
  readonly rotation: readonly AlgMove[];
}

/** Shoot one target with a swap method: setup, the method's core alg, then undo the setup. */
export interface TargetStep {
  readonly kind: "target";
  readonly pieceType: SolvedPieceType;
  /**
   * Index into the piece type's `TraceResult.targets` (and `targetStickers`, `targetKinds`). For a
   * `parityTarget` it is the target's position after the traced ones.
   */
  readonly traceIndex: number;
  readonly target: string;
  /**
   * Set when the method shot another sticker's case for this target: M2 on an odd step shoots UF
   * with DB's alg, and so on (DECISIONS D-025).
   */
  readonly shotAs?: string;
  /** Set when the target isn't in the trace: the buffer's parity partner appended to an odd memo (D-026). */
  readonly parityTarget?: true;
  readonly setup: readonly AlgMove[];
  readonly core: readonly AlgMove[];
  readonly undo: readonly AlgMove[];
}

/** Solve two targets at once with a 3-cycle alg (3-style). */
export interface CycleStep {
  readonly kind: "cycle";
  readonly pieceType: SolvedPieceType;
  /** Indices into the trace's targets: two, or one when the second target is the appended parity partner. */
  readonly traceIndices: readonly number[];
  readonly targets: readonly [string, string];
  /** Set when the second target is the buffer's parity partner, appended to an odd memo (D-026). */
  readonly parityTarget?: true;
  /** The dataset's notation, e.g. `[U2: [R, D]]`. */
  readonly notation: string;
  /** Its cancelled moves: what gets executed. */
  readonly alg: readonly AlgMove[];
}

/** Twist or flip a piece in place, together with the buffer (3-style). */
export interface OrientationStep {
  readonly kind: "orientation";
  readonly pieceType: SolvedPieceType;
  readonly piece: string;
  readonly direction: TwistDirection | "flip";
  /** Set when this alg stands in for an odd memo's last target on the parity partner's piece (D-026). */
  readonly parityTail?: { readonly traceIndex: number; readonly target: string };
  /** The dataset's notation. */
  readonly notation: string;
  /** Its cancelled moves: what gets executed. */
  readonly alg: readonly AlgMove[];
}

/** The parity alg, with the leftover swaps it cancels. */
export interface ParityStep {
  readonly kind: "parity";
  readonly alg: readonly AlgMove[];
  /** Pieces swapped as a leftover when the step runs, per piece type. */
  readonly cancels: { readonly corners: readonly string[]; readonly edges: readonly string[] };
  /** Traced targets the parity alg itself solves: an odd memo's last target when it is the parity partner (D-026). */
  readonly shoots?: readonly { readonly pieceType: SolvedPieceType; readonly traceIndex: number; readonly target: string }[];
}

export type MethodStep = FrameStep | TargetStep | CycleStep | OrientationStep | ParityStep;

export interface MethodSolution {
  readonly method: "op-op" | "m2-op" | "3style" | "m2-3style";
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
    case "cycle":
    case "orientation":
    case "parity":
      return step.alg;
  }
}
