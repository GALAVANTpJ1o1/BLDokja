import type { KPattern } from "cubing/kpuzzle";
import { centersRotation } from "../core/frame.js";
import type { Puzzle } from "../core/puzzle.js";
import { err, ok, type Result } from "../core/result.js";
import { cubeSymmetries, relabelMove } from "../core/symmetry.js";
import { expandNodes, formatMoves, invertMoves } from "../commutator/expand.js";
import { parseAlg, type AlgMove } from "../commutator/parse.js";
import {
  buildOpParityDataset,
  buildOpSetupsDataset,
  verifyOpParityDataset,
  verifyOpSetupsDataset,
  type OpDatasetProblem,
  type OpParityDataset,
  type OpSetupsDataset,
} from "../data/op-dataset.js";
import type { Scheme } from "../lettering/scheme.js";
import { pieceName } from "../pieces/names.js";
import { pieceType } from "../pieces/piece-types.js";
import { trace, type TraceError, type TraceInput, type TracePolicy, type TraceResult } from "../trace/trace.js";
import { GATE_B_SETUP_FAMILIES } from "./setup-search.js";
import { REFERENCE_SWAPS, swapVariants } from "./swap-algs.js";
import { stepMoves, type MethodSolution, type MethodStep, type TargetStep } from "./solution.js";

/**
 * Old Pochmann for corners and edges (BRIEF §5.4, DECISIONS D-022 and D-024).
 *
 * The memo is traced once, from the scramble, with twisted and flipped pieces traced as targets
 * (`asTargets`). The solve follows J Perm's order: edges, the parity alg when the target counts are
 * odd, then corners. Each target step repeats its swap's side effect once, so with odd counts the
 * edge phase leaves two corners swapped and the corner phase would leave two edges swapped; the
 * parity alg is exactly those two swaps, so it only works between the phases. The full-solve property
 * test checks all of this on random states.
 *
 * Solvers read verified datasets and never check them: the committed files are verified by the test
 * suite, and `opSystem` verifies what it builds.
 */

export type OpPhaseError = { readonly code: "missing-setup"; readonly pieceType: "corners" | "edges"; readonly target: string } | { readonly code: "invalid-dataset-alg"; readonly alg: string };

function movesOf(text: string): AlgMove[] | undefined {
  if (text === "") return [];
  const parsed = parseAlg("3x3x3", text);
  return parsed.ok ? expandNodes(parsed.value.nodes) : undefined;
}

/** One piece type's target steps, in trace order. */
export function opPhase(dataset: OpSetupsDataset, traced: TraceResult): Result<TargetStep[], OpPhaseError> {
  const core = movesOf(dataset.swap.alg);
  if (core === undefined) return err({ code: "invalid-dataset-alg", alg: dataset.swap.alg });
  const steps: TargetStep[] = [];
  for (const [traceIndex, target] of traced.targetStickers.entries()) {
    const record = dataset.records.find((r) => r.target === target);
    if (record === undefined) return err({ code: "missing-setup", pieceType: dataset.pieceType, target });
    const setup = movesOf(record.setup);
    if (setup === undefined) return err({ code: "invalid-dataset-alg", alg: record.setup });
    steps.push({ kind: "target", pieceType: dataset.pieceType, traceIndex, target, setup, core, undo: invertMoves(setup) });
  }
  return ok(steps);
}

export interface OpOpConfig {
  readonly scheme: Scheme;
  readonly corners: OpSetupsDataset;
  readonly edges: OpSetupsDataset;
  readonly parity: OpParityDataset;
  readonly breakOrder?: TracePolicy["breakOrder"];
}

export type SolveTraceError =
  | { readonly code: "trace"; readonly pieceType: "corners" | "edges"; readonly error: TraceError }
  | { readonly code: "orientation-left-over"; readonly pieceType: "corners" | "edges" }
  | { readonly code: "inconsistent-parity" }
  | { readonly code: "centers-not-normalisable" };

export type OpSolveError = SolveTraceError | { readonly code: "dataset-mismatch"; readonly field: string } | OpPhaseError;

/**
 * What every corners-and-edges solver starts from: both piece types traced once with `asTargets`,
 * and the rotation that puts the centres where the memo was traced.
 */
export function traceForSolve(
  puzzle: Puzzle,
  input: TraceInput,
  config: {
    readonly scheme: Scheme;
    readonly cornerBuffer: string;
    readonly edgeBuffer: string;
    readonly breakOrder?: TracePolicy["breakOrder"];
    /** Per piece type; `asTargets` unless given. */
    readonly orientedInPlace?: { readonly corners: "separate" | "asTargets"; readonly edges: "separate" | "asTargets" };
  },
): Result<{ readonly corners: TraceResult; readonly edges: TraceResult; readonly rotation: readonly AlgMove[] }, SolveTraceError> {
  const traced = (pieceTypeId: "corners" | "edges", buffer: string): Result<TraceResult, SolveTraceError> => {
    const orientedInPlace = config.orientedInPlace?.[pieceTypeId] ?? "asTargets";
    const policy: TracePolicy = { orientedInPlace, ...(config.breakOrder === undefined ? {} : { breakOrder: config.breakOrder }) };
    const result = trace(puzzle, input, { pieceType: pieceTypeId, buffer, scheme: config.scheme, policy });
    if (!result.ok) return err({ code: "trace", pieceType: pieceTypeId, error: result.error });
    // Under asTargets every misoriented piece is traced as targets; anything left means the state isn't a real cube.
    if (orientedInPlace === "asTargets" && result.value.orientedInPlace.length > 0) return err({ code: "orientation-left-over", pieceType: pieceTypeId });
    return result;
  };
  const corners = traced("corners", config.cornerBuffer);
  if (!corners.ok) return corners;
  const edges = traced("edges", config.edgeBuffer);
  if (!edges.ok) return edges;
  if (corners.value.parity !== edges.value.parity) return err({ code: "inconsistent-parity" });

  // Tracing already succeeded, so the alg applies.
  const pattern: KPattern = "pattern" in input ? input.pattern : puzzle.kpuzzle.defaultPattern().applyAlg(input.alg);
  const frame = centersRotation(puzzle, pattern);
  const rotation = frame === undefined ? undefined : movesOf(frame.alg);
  if (rotation === undefined) return err({ code: "centers-not-normalisable" });
  return ok({ corners: corners.value, edges: edges.value, rotation });
}

export function solveOpOp(puzzle: Puzzle, input: TraceInput, config: OpOpConfig): Result<MethodSolution, OpSolveError> {
  const { corners, edges, parity } = config;
  if (corners.pieceType !== "corners") return err({ code: "dataset-mismatch", field: "corners.pieceType" });
  if (edges.pieceType !== "edges") return err({ code: "dataset-mismatch", field: "edges.pieceType" });
  if (parity.buffers.corners !== corners.buffer || parity.buffers.edges !== edges.buffer) return err({ code: "dataset-mismatch", field: "parity.buffers" });
  if (parity.swaps.corners !== corners.swap.alg || parity.swaps.edges !== edges.swap.alg) return err({ code: "dataset-mismatch", field: "parity.swaps" });

  const traced = traceForSolve(puzzle, input, { scheme: config.scheme, cornerBuffer: corners.buffer, edgeBuffer: edges.buffer, ...(config.breakOrder === undefined ? {} : { breakOrder: config.breakOrder }) });
  if (!traced.ok) return traced;
  const { corners: cornerTrace, edges: edgeTrace, rotation } = traced.value;
  const parityAlg = movesOf(parity.records[0].algs[0]?.alg ?? "");
  if (parityAlg === undefined || parityAlg.length === 0) return err({ code: "invalid-dataset-alg", alg: parity.records[0].algs[0]?.alg ?? "" });

  const edgeSteps = opPhase(edges, edgeTrace);
  if (!edgeSteps.ok) return edgeSteps;
  const cornerSteps = opPhase(corners, cornerTrace);
  if (!cornerSteps.ok) return cornerSteps;

  const steps: MethodStep[] = [];
  if (rotation.length > 0) steps.push({ kind: "frame", rotation });
  steps.push(...edgeSteps.value);
  if (edgeTrace.parity) {
    // The edge swap's side effect is on corners, the corner swap's on edges.
    steps.push({ kind: "parity", alg: parityAlg, cancels: { corners: [...edges.swap.sideEffectPieces], edges: [...corners.swap.sideEffectPieces] } });
  }
  steps.push(...cornerSteps.value);
  return ok({ method: "op-op", traces: { corners: cornerTrace, edges: edgeTrace }, steps, moves: steps.flatMap((s) => [...stepMoves(s)]) });
}

export interface OpSystem {
  readonly corners: OpSetupsDataset;
  readonly edges: OpSetupsDataset;
  readonly parity: OpParityDataset;
}

export type OpSystemError =
  | { readonly code: "unknown-buffer"; readonly buffer: string }
  | { readonly code: "no-verified-parity-alg"; readonly cornerBuffer: string; readonly edgeBuffer: string }
  | { readonly code: "build-failed"; readonly detail: string }
  | { readonly code: "verification-failed"; readonly problems: readonly OpDatasetProblem[] };

const systemCache = new WeakMap<Puzzle, Map<string, Result<OpSystem, OpSystemError>>>();

/**
 * The OP/OP datasets for a corner buffer and an edge buffer (stickers), built and verified in memory.
 *
 * Available for the 48 buffer pairs that a cube symmetry maps (UBL, UR) onto: the swaps, the Gate B
 * setup families and the parity alg are all relabelled by that symmetry. For (UBL, UR) this is exactly
 * what `content/algs/3x3/` holds. Other pairs return `no-verified-parity-alg`: they would need a parity
 * alg found by search, which isn't built (D-024).
 */
export function opSystem(puzzle: Puzzle, buffers: { readonly cornerBuffer: string; readonly edgeBuffer: string }): Result<OpSystem, OpSystemError> {
  const key = `${buffers.cornerBuffer}/${buffers.edgeBuffer}`;
  let byPuzzle = systemCache.get(puzzle);
  if (byPuzzle === undefined) {
    byPuzzle = new Map();
    systemCache.set(puzzle, byPuzzle);
  }
  const cached = byPuzzle.get(key);
  if (cached !== undefined) return cached;
  const result = buildSystem(puzzle, buffers);
  byPuzzle.set(key, result);
  return result;
}

function buildSystem(puzzle: Puzzle, { cornerBuffer, edgeBuffer }: { readonly cornerBuffer: string; readonly edgeBuffer: string }): Result<OpSystem, OpSystemError> {
  const { geometry } = puzzle;
  const cornerSticker = pieceType(puzzle, "corners").stickerByName(cornerBuffer);
  if (cornerSticker === undefined) return err({ code: "unknown-buffer", buffer: cornerBuffer });
  const edgeSticker = pieceType(puzzle, "edges").stickerByName(edgeBuffer);
  if (edgeSticker === undefined) return err({ code: "unknown-buffer", buffer: edgeBuffer });
  const pieceOf = (index: number) => pieceName(geometry.size, geometry.sticker(index).cubie);
  const referenceIndex = (method: "op-corners" | "op-edges") => {
    const reference = REFERENCE_SWAPS[method];
    return pieceType(puzzle, reference.pieceType).pieceByName(reference.bufferPiece)?.stickers[0]?.index ?? -1;
  };

  const symmetry = cubeSymmetries(puzzle).find(
    (g) => pieceOf(g.sticker[referenceIndex("op-corners")] ?? -1) === pieceOf(cornerSticker.index) && pieceOf(g.sticker[referenceIndex("op-edges")] ?? -1) === pieceOf(edgeSticker.index),
  );
  if (symmetry === undefined) return err({ code: "no-verified-parity-alg", cornerBuffer, edgeBuffer });

  const setups = (method: "op-corners" | "op-edges", bufferSticker: string): Result<OpSetupsDataset, OpSystemError> => {
    const variants = swapVariants(puzzle, method);
    if (!variants.ok) return err({ code: "build-failed", detail: JSON.stringify(variants.error) });
    const reference = REFERENCE_SWAPS[method];
    const referenceMoves = movesOf(reference.alg) ?? [];
    const text = formatMoves(referenceMoves.map((m): AlgMove => ({ type: "move", ...relabelMove(puzzle, symmetry, m) })));
    const bufferPiece = pieceOf(pieceType(puzzle, reference.pieceType).stickerByName(bufferSticker)?.index ?? -1);
    const swap = variants.value.find((v) => v.bufferPiece === bufferPiece && formatMoves(v.moves) === text);
    if (swap === undefined) return err({ code: "build-failed", detail: `no ${method} variant ${text} for ${bufferPiece}` });
    const setupFamilies = GATE_B_SETUP_FAMILIES[method].map((family) => relabelMove(puzzle, symmetry, { family, amount: 1 }).family);
    const built = buildOpSetupsDataset(puzzle, { id: `${method}.${bufferSticker}`, swap, bufferSticker, setupFamilies, symmetry: symmetry.index });
    return built.ok ? built : err({ code: "build-failed", detail: JSON.stringify(built.error) });
  };

  const corners = setups("op-corners", cornerBuffer);
  if (!corners.ok) return corners;
  const edges = setups("op-edges", edgeBuffer);
  if (!edges.ok) return edges;
  const parity = buildOpParityDataset(puzzle, { id: `op-parity.${cornerBuffer}-${edgeBuffer}`, corners: corners.value, edges: edges.value, symmetry: symmetry.index });
  if (!parity.ok) return err({ code: "verification-failed", problems: [parity.error] });

  const problems = [
    ...verifyOpSetupsDataset(puzzle, corners.value),
    ...verifyOpSetupsDataset(puzzle, edges.value),
    ...verifyOpParityDataset(puzzle, parity.value, corners.value, edges.value),
  ];
  if (problems.length > 0) return err({ code: "verification-failed", problems });
  return ok({ corners: corners.value, edges: edges.value, parity: parity.value });
}
