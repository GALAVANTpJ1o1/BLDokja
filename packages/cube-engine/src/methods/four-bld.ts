import type { Puzzle } from "../core/puzzle.js";
import { err, ok, type Result } from "../core/result.js";
import { expandNodes, invertMoves } from "../commutator/expand.js";
import { parseAlg, type AlgMove } from "../commutator/parse.js";
import type { OpCornerParityDataset } from "../data/four-bld-parity.js";
import type { OpSetupsDataset } from "../data/op-dataset.js";
import type { SwapDataset, SwapParityDataset } from "../data/swap-dataset.js";
import type { Scheme } from "../lettering/scheme.js";
import { trace, type TraceError, type TraceInput, type TraceResult } from "../trace/trace.js";

/**
 * A full 4BLD solve (BRIEF §6's 4BLD track, DECISIONS D-041): U2 for x-centres, r2 for wings, Old Pochmann
 * for corners, in that order, each followed by its parity alg when its target count is odd.
 *
 * Every piece type is traced once, from the scramble, with the cube held as scrambled (D-032). Each phase,
 * parity step included, puts back every piece but its own: setups are undone, the swaps' side effects pair
 * up, and the parity alg undoes what an odd count leaves (D-039, D-041). Centres go first because the wing
 * and corner parity algs are only right by colour: they may swap x-centres within a face, which shows only
 * while the centres are unsolved. Wings and corners could go either way round; wings first is the usual
 * order. The full-solve property test checks all of this.
 */

export type FourBldPieceType = "xcenters" | "wings" | "corners";
export const FOUR_BLD_ORDER: readonly FourBldPieceType[] = ["xcenters", "wings", "corners"];

export interface FourBldTargetStep {
  readonly kind: "target";
  readonly pieceType: FourBldPieceType;
  /** Index into the piece type's `TraceResult.targetStickers`. */
  readonly traceIndex: number;
  readonly target: string;
  /** Set when the odd/even rule shot another sticker's case for this target. */
  readonly shotAs?: string;
  readonly setup: readonly AlgMove[];
  readonly core: readonly AlgMove[];
  readonly undo: readonly AlgMove[];
}

export interface FourBldParityStep {
  readonly kind: "parity";
  readonly pieceType: FourBldPieceType;
  readonly alg: readonly AlgMove[];
}

export type FourBldStep = FourBldTargetStep | FourBldParityStep;

export interface FourBldSolution {
  readonly traces: Readonly<Record<FourBldPieceType, TraceResult>>;
  readonly steps: readonly FourBldStep[];
  /** Every step's moves in order, uncancelled. */
  readonly moves: readonly AlgMove[];
}

export interface FourBldConfig {
  readonly scheme: Scheme;
  readonly centres: SwapDataset;
  readonly centreParity: SwapParityDataset;
  readonly wings: SwapDataset;
  readonly wingParity: SwapParityDataset;
  /** The 3x3 OP corners dataset: outer turns only, so its setups and swap work on a 4x4 unchanged. */
  readonly corners: OpSetupsDataset;
  readonly cornerParity: OpCornerParityDataset;
}

export type FourBldSolveError =
  | { readonly code: "trace"; readonly pieceType: FourBldPieceType; readonly error: TraceError }
  | { readonly code: "orientation-left-over"; readonly pieceType: FourBldPieceType }
  | { readonly code: "dataset-mismatch"; readonly field: string }
  | { readonly code: "missing-record"; readonly pieceType: FourBldPieceType; readonly target: string }
  | { readonly code: "invalid-dataset-alg"; readonly alg: string };

export function fourBldStepMoves(step: FourBldStep): readonly AlgMove[] {
  return step.kind === "target" ? [...step.setup, ...step.core, ...step.undo] : step.alg;
}

function movesOf(puzzle: Puzzle, text: string): AlgMove[] | undefined {
  if (text === "") return [];
  const parsed = parseAlg(puzzle.id, text);
  return parsed.ok ? expandNodes(parsed.value.nodes) : undefined;
}

/** A swap method's steps (r2, U2): setups from the table, special algs for the swap's own pieces, the odd/even rule. */
function swapPhase(puzzle: Puzzle, dataset: SwapDataset, pieceTypeId: FourBldPieceType, traced: TraceResult): Result<FourBldTargetStep[], FourBldSolveError> {
  const swap = movesOf(puzzle, dataset.swap.alg);
  if (swap === undefined) return err({ code: "invalid-dataset-alg", alg: dataset.swap.alg });
  const steps: FourBldTargetStep[] = [];
  for (const [traceIndex, target] of traced.targetStickers.entries()) {
    const shootAs = traceIndex % 2 === 1 ? (dataset.oddStepRule.find((r) => r.target === target)?.shootAs ?? target) : target;
    const record = dataset.records.find((r) => r.target === shootAs);
    if (record === undefined) return err({ code: "missing-record", pieceType: pieceTypeId, target: shootAs });
    const shotAs = shootAs === target ? {} : { shotAs: shootAs };
    if (record.kind === "target") {
      const setup = movesOf(puzzle, record.setup);
      if (setup === undefined) return err({ code: "invalid-dataset-alg", alg: record.setup });
      steps.push({ kind: "target", pieceType: pieceTypeId, traceIndex, target, ...shotAs, setup, core: swap, undo: invertMoves(setup) });
    } else {
      const text = record.algs[0]?.alg ?? "";
      const core = movesOf(puzzle, text);
      if (core === undefined || core.length === 0) return err({ code: "invalid-dataset-alg", alg: text });
      steps.push({ kind: "target", pieceType: pieceTypeId, traceIndex, target, ...shotAs, setup: [], core, undo: [] });
    }
  }
  return ok(steps);
}

function cornerPhase(puzzle: Puzzle, dataset: OpSetupsDataset, traced: TraceResult): Result<FourBldTargetStep[], FourBldSolveError> {
  const core = movesOf(puzzle, dataset.swap.alg);
  if (core === undefined) return err({ code: "invalid-dataset-alg", alg: dataset.swap.alg });
  const steps: FourBldTargetStep[] = [];
  for (const [traceIndex, target] of traced.targetStickers.entries()) {
    const record = dataset.records.find((r) => r.target === target);
    if (record === undefined) return err({ code: "missing-record", pieceType: "corners", target });
    const setup = movesOf(puzzle, record.setup);
    if (setup === undefined) return err({ code: "invalid-dataset-alg", alg: record.setup });
    steps.push({ kind: "target", pieceType: "corners", traceIndex, target, setup, core, undo: invertMoves(setup) });
  }
  return ok(steps);
}

function parityAlg(puzzle: Puzzle, text: string | undefined): Result<AlgMove[], FourBldSolveError> {
  const moves = movesOf(puzzle, text ?? "");
  return moves === undefined || moves.length === 0 ? err({ code: "invalid-dataset-alg", alg: text ?? "" }) : ok(moves);
}

export function solveFourBld(puzzle: Puzzle, input: TraceInput, config: FourBldConfig): Result<FourBldSolution, FourBldSolveError> {
  const { centres, centreParity, wings, wingParity, corners, cornerParity } = config;
  if (puzzle.id !== "4x4x4") return err({ code: "dataset-mismatch", field: "puzzle" });
  if (centres.method !== "u2" || centres.pieceType !== "xcenters") return err({ code: "dataset-mismatch", field: "centres" });
  if (wings.method !== "r2" || wings.pieceType !== "wings") return err({ code: "dataset-mismatch", field: "wings" });
  if (corners.pieceType !== "corners") return err({ code: "dataset-mismatch", field: "corners" });
  if (centreParity.method !== "u2" || centreParity.buffer !== centres.buffer || centreParity.swap !== centres.swap.alg) return err({ code: "dataset-mismatch", field: "centreParity" });
  if (wingParity.method !== "r2" || wingParity.buffer !== wings.buffer || wingParity.swap !== wings.swap.alg) return err({ code: "dataset-mismatch", field: "wingParity" });
  if (cornerParity.buffer !== corners.buffer || cornerParity.swap !== corners.swap.alg) return err({ code: "dataset-mismatch", field: "cornerParity" });

  const buffers: Readonly<Record<FourBldPieceType, string>> = { xcenters: centres.buffer, wings: wings.buffer, corners: corners.buffer };
  const traces: Partial<Record<FourBldPieceType, TraceResult>> = {};
  for (const pieceTypeId of FOUR_BLD_ORDER) {
    const result = trace(puzzle, input, { pieceType: pieceTypeId, buffer: buffers[pieceTypeId], scheme: config.scheme, frame: { kind: "asIs" }, policy: { orientedInPlace: "asTargets" } });
    if (!result.ok) return err({ code: "trace", pieceType: pieceTypeId, error: result.error });
    // Twisted corners are traced as targets; anything left over means the state isn't a real cube.
    if (result.value.orientedInPlace.length > 0) return err({ code: "orientation-left-over", pieceType: pieceTypeId });
    traces[pieceTypeId] = result.value;
  }
  const { xcenters: centreTrace, wings: wingTrace, corners: cornerTrace } = traces;
  if (centreTrace === undefined || wingTrace === undefined || cornerTrace === undefined) throw new Error("unreachable: every piece type was traced");

  const steps: FourBldStep[] = [];
  const phases: [FourBldPieceType, Result<FourBldTargetStep[], FourBldSolveError>, TraceResult, string | undefined][] = [
    ["xcenters", swapPhase(puzzle, centres, "xcenters", centreTrace), centreTrace, centreParity.records[0].algs[0]?.alg],
    ["wings", swapPhase(puzzle, wings, "wings", wingTrace), wingTrace, wingParity.records[0].algs[0]?.alg],
    ["corners", cornerPhase(puzzle, corners, cornerTrace), cornerTrace, cornerParity.records[0].algs[0]?.alg],
  ];
  for (const [pieceTypeId, phase, traced, parityText] of phases) {
    if (!phase.ok) return phase;
    steps.push(...phase.value);
    // The parity alg undoes what an odd number of swaps leaves: counted, as the solver counts them.
    if (traced.targetStickers.length % 2 === 1) {
      const alg = parityAlg(puzzle, parityText);
      if (!alg.ok) return alg;
      steps.push({ kind: "parity", pieceType: pieceTypeId, alg: alg.value });
    }
  }
  return ok({ traces: { xcenters: centreTrace, wings: wingTrace, corners: cornerTrace }, steps, moves: steps.flatMap((s) => [...fourBldStepMoves(s)]) });
}
