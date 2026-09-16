import type { Puzzle } from "../core/puzzle.js";
import { err, ok, type Result } from "../core/result.js";
import { expandNodes } from "../commutator/expand.js";
import { parseAlg, type AlgMove } from "../commutator/parse.js";
import type { AlgDataset } from "../data/alg-dataset.js";
import type { SwapDataset } from "../data/swap-dataset.js";
import type { M2ThreeStyleParityDataset, ParityTail, ThreeStyleParityDataset } from "../data/three-style-parity.js";
import type { Scheme } from "../lettering/scheme.js";
import { pieceType } from "../pieces/piece-types.js";
import type { TraceInput, TracePolicy, TraceResult } from "../trace/trace.js";
import { m2Phase, type M2PhaseError } from "./m2.js";
import { traceForSolve, type SolveTraceError } from "./op.js";
import { stepMoves, type CycleStep, type MethodSolution, type MethodStep, type OrientationStep, type ParityStep, type SolvedPieceType } from "./solution.js";

/**
 * 3-style (BRIEF §5.4, DECISIONS D-022, D-023, D-026), and M2 edges with 3-style corners.
 *
 * Targets are traced once, from the scramble, with twisted and flipped pieces reported apart
 * (`separate`). Targets are solved in pairs by comm. With odd counts each piece type's last target is
 * paired with its buffer's parity partner (UBR, UR), and one parity alg at the end swaps both buffers
 * back with their partners; a last target on a partner piece is solved by the matching twist or flip
 * alg instead (its tail), or by the parity alg itself when it is the partner. Twists and flips come
 * last, because their algs only work while each buffer holds its own piece.
 */

export type ThreeStylePhaseError =
  | { readonly code: "missing-record"; readonly dataset: string; readonly record: string }
  | { readonly code: "invalid-dataset-alg"; readonly alg: string }
  | { readonly code: "parity-required"; readonly pieceType: SolvedPieceType };

/** A record's main alg: its notation, and its cancelled moves (what gets executed). */
function mainAlg(dataset: AlgDataset, id: string): Result<{ notation: string; moves: AlgMove[] }, ThreeStylePhaseError> {
  const record = dataset.records.find((r) => r.id === id);
  if (record === undefined) return err({ code: "missing-record", dataset: dataset.id, record: id });
  const main = record.algs[0];
  const parsed = parseAlg("3x3x3", main?.moves ?? "");
  if (main === undefined || !parsed.ok) return err({ code: "invalid-dataset-alg", alg: main?.alg ?? "" });
  return ok({ notation: main.alg, moves: expandNodes(parsed.value.nodes) });
}

function orientationStep(orientations: AlgDataset, piece: string, direction: OrientationStep["direction"], parityTail?: OrientationStep["parityTail"]): Result<OrientationStep, ThreeStylePhaseError> {
  const id = direction === "flip" ? piece : `${piece}-${direction}`;
  const alg = mainAlg(orientations, id);
  if (!alg.ok) return alg;
  return ok({ kind: "orientation", pieceType: orientations.pieceType, piece, direction, ...(parityTail === undefined ? {} : { parityTail }), notation: alg.value.notation, alg: alg.value.moves });
}

export interface ThreeStylePhase {
  /** Pair comms, then the parity tail (a comm to the partner, or an orientation alg) when the count is odd. */
  readonly cycles: readonly (CycleStep | OrientationStep)[];
  /** The last target when the parity alg solves it itself (it is the partner). */
  readonly shotByParity: ParityStep["shoots"];
  /** Twists or flips of non-buffer pieces; the buffer's own is implied. */
  readonly orientations: readonly OrientationStep[];
}

export function threeStylePhase(
  cycles: AlgDataset,
  orientations: AlgDataset,
  traced: TraceResult,
  parity: { readonly partner: string; readonly tails: readonly ParityTail[] } | undefined,
): Result<ThreeStylePhase, ThreeStylePhaseError> {
  const typeId = cycles.pieceType;
  const steps: (CycleStep | OrientationStep)[] = [];
  const targets = traced.targetStickers;
  for (let i = 0; i + 1 < targets.length; i += 2) {
    const first = targets[i] ?? "";
    const second = targets[i + 1] ?? "";
    const alg = mainAlg(cycles, `${first}-${second}`);
    if (!alg.ok) return alg;
    steps.push({ kind: "cycle", pieceType: typeId, traceIndices: [i, i + 1], targets: [first, second], notation: alg.value.notation, alg: alg.value.moves });
  }

  const shoots: NonNullable<ParityStep["shoots"]>[number][] = [];
  if (targets.length % 2 === 1) {
    if (parity === undefined) return err({ code: "parity-required", pieceType: typeId });
    const traceIndex = targets.length - 1;
    const last = targets[traceIndex] ?? "";
    const tail = parity.tails.find((t) => t.pieceType === typeId && t.target === last);
    if (last === parity.partner) {
      shoots.push({ pieceType: typeId, traceIndex, target: last });
    } else if (tail !== undefined) {
      const record = orientations.records.find((r) => r.id === tail.record);
      if (record === undefined) return err({ code: "missing-record", dataset: orientations.id, record: tail.record });
      const piece = record.kind === "cycle" ? "" : record.target;
      const direction = record.kind === "twist" ? record.direction : "flip";
      const step = orientationStep(orientations, piece, direction, { traceIndex, target: last });
      if (!step.ok) return step;
      steps.push(step.value);
    } else {
      const alg = mainAlg(cycles, `${last}-${parity.partner}`);
      if (!alg.ok) return alg;
      steps.push({ kind: "cycle", pieceType: typeId, traceIndices: [traceIndex], targets: [last, parity.partner], parityTarget: true, notation: alg.value.notation, alg: alg.value.moves });
    }
  }

  const orientationSteps: OrientationStep[] = [];
  for (const piece of traced.orientedInPlace) {
    if (piece.isBuffer) continue;
    const step = orientationStep(orientations, piece.piece, piece.direction);
    if (!step.ok) return step;
    orientationSteps.push(step.value);
  }
  return ok({ cycles: steps, shotByParity: shoots, orientations: orientationSteps });
}

export type ThreeStyleSolveError = SolveTraceError | ThreeStylePhaseError | M2PhaseError | { readonly code: "dataset-mismatch"; readonly field: string };

function parityAlg(parity: ThreeStyleParityDataset | M2ThreeStyleParityDataset): Result<AlgMove[], ThreeStyleSolveError> {
  const main = parity.records[0].algs[0];
  const parsed = parseAlg("3x3x3", main?.moves ?? "");
  return main !== undefined && parsed.ok ? ok(expandNodes(parsed.value.nodes)) : err({ code: "invalid-dataset-alg", alg: main?.alg ?? "" });
}

function partnerPiece(puzzle: Puzzle, typeId: SolvedPieceType, sticker: string): string {
  const type = pieceType(puzzle, typeId);
  const info = type.stickerByName(sticker);
  return info === undefined ? sticker : (type.pieces[info.position]?.name ?? sticker);
}

export interface ThreeStyleConfig {
  readonly scheme: Scheme;
  readonly corners: AlgDataset;
  readonly edges: AlgDataset;
  readonly twists: AlgDataset;
  readonly flips: AlgDataset;
  readonly parity: ThreeStyleParityDataset;
  readonly breakOrder?: TracePolicy["breakOrder"];
}

function checkThreeStyle(config: { corners: AlgDataset; twists: AlgDataset; parity: ThreeStyleParityDataset | M2ThreeStyleParityDataset }): ThreeStyleSolveError | undefined {
  const { corners, twists, parity } = config;
  if (corners.kind !== "cycles" || corners.pieceType !== "corners") return { code: "dataset-mismatch", field: "corners" };
  if (twists.kind !== "twists" || twists.buffer !== corners.buffer) return { code: "dataset-mismatch", field: "twists" };
  if (parity.buffers.corners !== corners.buffer) return { code: "dataset-mismatch", field: "parity.buffers" };
  return undefined;
}

export function solveThreeStyle(puzzle: Puzzle, input: TraceInput, config: ThreeStyleConfig): Result<MethodSolution, ThreeStyleSolveError> {
  const { corners, edges, twists, flips, parity } = config;
  const mismatch = checkThreeStyle(config);
  if (mismatch !== undefined) return err(mismatch);
  if (edges.kind !== "cycles" || edges.pieceType !== "edges") return err({ code: "dataset-mismatch", field: "edges" });
  if (flips.kind !== "flips" || flips.buffer !== edges.buffer) return err({ code: "dataset-mismatch", field: "flips" });
  if (parity.buffers.edges !== edges.buffer) return err({ code: "dataset-mismatch", field: "parity.buffers" });

  const traced = traceForSolve(puzzle, input, {
    scheme: config.scheme,
    cornerBuffer: corners.buffer,
    edgeBuffer: edges.buffer,
    orientedInPlace: { corners: "separate", edges: "separate" },
    ...(config.breakOrder === undefined ? {} : { breakOrder: config.breakOrder }),
  });
  if (!traced.ok) return traced;
  const { corners: cornerTrace, edges: edgeTrace, rotation } = traced.value;
  const odd = cornerTrace.parity;
  const cornerPhase = threeStylePhase(corners, twists, cornerTrace, odd ? { partner: parity.partners.corners, tails: parity.tails } : undefined);
  if (!cornerPhase.ok) return cornerPhase;
  const edgePhase = threeStylePhase(edges, flips, edgeTrace, odd ? { partner: parity.partners.edges, tails: parity.tails } : undefined);
  if (!edgePhase.ok) return edgePhase;

  const steps: MethodStep[] = [];
  if (rotation.length > 0) steps.push({ kind: "frame", rotation });
  steps.push(...cornerPhase.value.cycles, ...edgePhase.value.cycles);
  if (odd) {
    const alg = parityAlg(parity);
    if (!alg.ok) return alg;
    const shoots = [...(cornerPhase.value.shotByParity ?? []), ...(edgePhase.value.shotByParity ?? [])];
    steps.push({
      kind: "parity",
      alg: alg.value,
      cancels: { corners: [partnerPiece(puzzle, "corners", parity.partners.corners)], edges: [partnerPiece(puzzle, "edges", parity.partners.edges)] },
      ...(shoots.length === 0 ? {} : { shoots }),
    });
  }
  steps.push(...cornerPhase.value.orientations, ...edgePhase.value.orientations);
  return ok({ method: "3style", traces: { corners: cornerTrace, edges: edgeTrace }, steps, moves: steps.flatMap((s) => [...stepMoves(s)]) });
}

export interface M2ThreeStyleConfig {
  readonly scheme: Scheme;
  readonly corners: AlgDataset;
  readonly twists: AlgDataset;
  readonly edges: SwapDataset;
  readonly parity: M2ThreeStyleParityDataset;
  readonly breakOrder?: TracePolicy["breakOrder"];
}

/**
 * M2 edges with 3-style corners. Corners go first; the M2 phase follows (with the edge partner
 * appended when odd, so M2 itself never has to handle parity), then the parity alg, then twists.
 */
export function solveM2ThreeStyle(puzzle: Puzzle, input: TraceInput, config: M2ThreeStyleConfig): Result<MethodSolution, ThreeStyleSolveError> {
  const { corners, twists, edges, parity } = config;
  const mismatch = checkThreeStyle(config);
  if (mismatch !== undefined) return err(mismatch);
  if (parity.buffers.edges !== edges.buffer) return err({ code: "dataset-mismatch", field: "parity.buffers" });

  const traced = traceForSolve(puzzle, input, {
    scheme: config.scheme,
    cornerBuffer: corners.buffer,
    edgeBuffer: edges.buffer,
    orientedInPlace: { corners: "separate", edges: "asTargets" },
    ...(config.breakOrder === undefined ? {} : { breakOrder: config.breakOrder }),
  });
  if (!traced.ok) return traced;
  const { corners: cornerTrace, edges: edgeTrace, rotation } = traced.value;
  const odd = cornerTrace.parity;
  const cornerPhase = threeStylePhase(corners, twists, cornerTrace, odd ? { partner: parity.partners.corners, tails: parity.tails } : undefined);
  if (!cornerPhase.ok) return cornerPhase;
  const edgeSteps = m2Phase(edges, edgeTrace, { append: odd ? [parity.partners.edges] : [] });
  if (!edgeSteps.ok) return edgeSteps;

  const steps: MethodStep[] = [];
  if (rotation.length > 0) steps.push({ kind: "frame", rotation });
  steps.push(...cornerPhase.value.cycles, ...edgeSteps.value);
  if (odd) {
    const alg = parityAlg(parity);
    if (!alg.ok) return alg;
    const shoots = cornerPhase.value.shotByParity ?? [];
    steps.push({
      kind: "parity",
      alg: alg.value,
      cancels: { corners: [partnerPiece(puzzle, "corners", parity.partners.corners)], edges: [partnerPiece(puzzle, "edges", parity.partners.edges)] },
      ...(shoots.length === 0 ? {} : { shoots }),
    });
  }
  steps.push(...cornerPhase.value.orientations);
  return ok({ method: "m2-3style", traces: { corners: cornerTrace, edges: edgeTrace }, steps, moves: steps.flatMap((s) => [...stepMoves(s)]) });
}
