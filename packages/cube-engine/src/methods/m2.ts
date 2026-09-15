import type { Puzzle } from "../core/puzzle.js";
import { err, ok, type Result } from "../core/result.js";
import { cubeSymmetries, relabelMove } from "../core/symmetry.js";
import { buildCatalogue, type CommCatalogue } from "../commutator/catalogue.js";
import { expandNodes, formatMoves, invertMoves } from "../commutator/expand.js";
import { parseAlg, type AlgMove } from "../commutator/parse.js";
import { buildM2Dataset, buildM2OpParityDataset, verifyM2Dataset, verifyM2OpParityDataset, type M2Dataset, type M2DatasetProblem, type M2OpParityDataset } from "../data/m2-dataset.js";
import { buildOpSetupsDataset, verifyOpSetupsDataset, type OpSetupsDataset } from "../data/op-dataset.js";
import type { Scheme } from "../lettering/scheme.js";
import { pieceName } from "../pieces/names.js";
import { pieceType } from "../pieces/piece-types.js";
import type { TracePolicy, TraceInput, TraceResult } from "../trace/trace.js";
import { M2_SPECIAL_BOUNDS } from "./m2-search.js";
import { opBufferPairs, opPhase, traceForSolve, type BufferPair, type OpPhaseError, type SolveTraceError } from "./op.js";
import { GATE_B_SETUP_FAMILIES } from "./setup-search.js";
import { m2Swaps, REFERENCE_SWAPS, swapVariants } from "./swap-algs.js";
import { stepMoves, type MethodSolution, type MethodStep, type TargetStep } from "./solution.js";

/**
 * M2 edges with Old Pochmann corners (BRIEF §5.4, DECISIONS D-022 and D-025).
 *
 * Both piece types are traced once, with twisted and flipped pieces as targets. Edges go first: a
 * target on the M slice's side-effect edges is shot with its special alg, and on an odd step (the
 * second target of a pair) the dataset's odd/even rule swaps UF↔DB and FU↔BD. With odd target
 * counts the parity alg follows the edges (your choice; it also works after the corners, which a
 * test checks), then the corners run exactly as in OP/OP.
 */

export type M2PhaseError = { readonly code: "missing-record"; readonly target: string } | { readonly code: "invalid-dataset-alg"; readonly alg: string };

function movesOf(text: string): AlgMove[] | undefined {
  if (text === "") return [];
  const parsed = parseAlg("3x3x3", text);
  return parsed.ok ? expandNodes(parsed.value.nodes) : undefined;
}

/**
 * The edge target steps, in trace order, with the odd/even rule applied. `append` adds targets after
 * the traced ones (the parity partner of D-026); they count as steps for the odd/even rule too.
 */
export function m2Phase(dataset: M2Dataset, traced: TraceResult, options: { readonly append?: readonly string[] } = {}): Result<TargetStep[], M2PhaseError> {
  const swap = movesOf(dataset.swap.alg);
  if (swap === undefined) return err({ code: "invalid-dataset-alg", alg: dataset.swap.alg });
  const steps: TargetStep[] = [];
  const targets = [...traced.targetStickers, ...(options.append ?? [])];
  for (const [traceIndex, target] of targets.entries()) {
    const shootAs = traceIndex % 2 === 1 ? (dataset.oddStepRule.find((r) => r.target === target)?.shootAs ?? target) : target;
    const record = dataset.records.find((r) => r.target === shootAs);
    if (record === undefined) return err({ code: "missing-record", target: shootAs });
    const marks = { ...(shootAs === target ? {} : { shotAs: shootAs }), ...(traceIndex >= traced.targetStickers.length ? { parityTarget: true as const } : {}) };
    if (record.kind === "target") {
      const setup = movesOf(record.setup);
      if (setup === undefined) return err({ code: "invalid-dataset-alg", alg: record.setup });
      steps.push({ kind: "target", pieceType: "edges", traceIndex, target, ...marks, setup, core: swap, undo: invertMoves(setup) });
    } else {
      const text = record.algs[0]?.alg ?? "";
      const core = movesOf(text);
      if (core === undefined || core.length === 0) return err({ code: "invalid-dataset-alg", alg: text });
      steps.push({ kind: "target", pieceType: "edges", traceIndex, target, ...marks, setup: [], core, undo: [] });
    }
  }
  return ok(steps);
}

export interface M2OpConfig {
  readonly scheme: Scheme;
  readonly corners: OpSetupsDataset;
  readonly edges: M2Dataset;
  readonly parity: M2OpParityDataset;
  readonly breakOrder?: TracePolicy["breakOrder"];
}

export type M2OpSolveError = SolveTraceError | { readonly code: "dataset-mismatch"; readonly field: string } | OpPhaseError | M2PhaseError;

export function solveM2Op(puzzle: Puzzle, input: TraceInput, config: M2OpConfig): Result<MethodSolution, M2OpSolveError> {
  const { corners, edges, parity } = config;
  if (corners.pieceType !== "corners") return err({ code: "dataset-mismatch", field: "corners.pieceType" });
  if (parity.buffers.corners !== corners.buffer || parity.buffers.edges !== edges.buffer) return err({ code: "dataset-mismatch", field: "parity.buffers" });
  if (parity.swaps.corners !== corners.swap.alg || parity.swaps.edges !== edges.swap.alg) return err({ code: "dataset-mismatch", field: "parity.swaps" });

  const traced = traceForSolve(puzzle, input, { scheme: config.scheme, cornerBuffer: corners.buffer, edgeBuffer: edges.buffer, ...(config.breakOrder === undefined ? {} : { breakOrder: config.breakOrder }) });
  if (!traced.ok) return traced;
  const { corners: cornerTrace, edges: edgeTrace, rotation } = traced.value;
  const parityText = parity.records[0].algs[0]?.alg ?? "";
  const parityAlg = movesOf(parityText);
  if (parityAlg === undefined || parityAlg.length === 0) return err({ code: "invalid-dataset-alg", alg: parityText });

  const edgeSteps = m2Phase(edges, edgeTrace);
  if (!edgeSteps.ok) return edgeSteps;
  const cornerSteps = opPhase(corners, cornerTrace);
  if (!cornerSteps.ok) return cornerSteps;

  const steps: MethodStep[] = [];
  if (rotation.length > 0) steps.push({ kind: "frame", rotation });
  steps.push(...edgeSteps.value);
  if (edgeTrace.parity) {
    // M2 leaves its side effect (the other M-slice edges and the centres); the corner swap leaves its edges.
    steps.push({ kind: "parity", alg: parityAlg, cancels: { corners: [], edges: [...new Set([...edges.swap.sideEffectPieces.filter((p) => p.length === 2), ...corners.swap.sideEffectPieces])] } });
  }
  steps.push(...cornerSteps.value);
  return ok({ method: "m2-op", traces: { corners: cornerTrace, edges: edgeTrace }, steps, moves: steps.flatMap((s) => [...stepMoves(s)]) });
}

export interface M2OpSystem {
  readonly corners: OpSetupsDataset;
  readonly edges: M2Dataset;
  readonly parity: M2OpParityDataset;
}

export type M2OpSystemError =
  | { readonly code: "unknown-buffer"; readonly buffer: string }
  | { readonly code: "no-verified-m2-system"; readonly cornerBuffer: string; readonly edgeBuffer: string }
  | { readonly code: "build-failed"; readonly detail: string }
  | { readonly code: "verification-failed"; readonly problems: readonly M2DatasetProblem[] };

const catalogues = new WeakMap<Puzzle, CommCatalogue>();
const systems = new WeakMap<Puzzle, Map<string, Result<M2OpSystem, M2OpSystemError>>>();

function specialCatalogue(puzzle: Puzzle): CommCatalogue {
  let catalogue = catalogues.get(puzzle);
  if (catalogue === undefined) {
    catalogue = buildCatalogue(puzzle, "edges", M2_SPECIAL_BOUNDS);
    catalogues.set(puzzle, catalogue);
  }
  return catalogue;
}

/**
 * The M2/OP datasets for a corner buffer and an M2 edge buffer (stickers), built and verified in
 * memory. Available for the 8 buffer pairs that a symmetry keeping M2 an M move maps (UBL, DF)
 * onto: the corner swap and the Gate B corner setup families are relabelled by the lowest-index such
 * symmetry, the M2 swap is the M2 variant for the buffer, and the special cases and parity alg are
 * searched for the buffer stickers given (D-025). Other pairs return `no-verified-m2-system`.
 */
/** Every buffer pair `m2OpSystem` can build: the images of (UBL, DF) under the symmetries that keep M2 an M move. */
export function m2BufferPairs(puzzle: Puzzle): BufferPair[] {
  return opBufferPairs(puzzle, (g) => relabelMove(puzzle, g, { family: "M", amount: 2 }).family === "M", { corners: REFERENCE_SWAPS["op-corners"].bufferPiece, edges: REFERENCE_SWAPS.m2.bufferPiece });
}

export function m2OpSystem(puzzle: Puzzle, buffers: { readonly cornerBuffer: string; readonly edgeBuffer: string }): Result<M2OpSystem, M2OpSystemError> {
  const key = `${buffers.cornerBuffer}/${buffers.edgeBuffer}`;
  let byPuzzle = systems.get(puzzle);
  if (byPuzzle === undefined) {
    byPuzzle = new Map();
    systems.set(puzzle, byPuzzle);
  }
  const cached = byPuzzle.get(key);
  if (cached !== undefined) return cached;
  const result = buildSystem(puzzle, buffers);
  byPuzzle.set(key, result);
  return result;
}

function buildSystem(puzzle: Puzzle, { cornerBuffer, edgeBuffer }: { readonly cornerBuffer: string; readonly edgeBuffer: string }): Result<M2OpSystem, M2OpSystemError> {
  const { geometry } = puzzle;
  const cornerSticker = pieceType(puzzle, "corners").stickerByName(cornerBuffer);
  if (cornerSticker === undefined) return err({ code: "unknown-buffer", buffer: cornerBuffer });
  const edgeSticker = pieceType(puzzle, "edges").stickerByName(edgeBuffer);
  if (edgeSticker === undefined) return err({ code: "unknown-buffer", buffer: edgeBuffer });
  const pieceOf = (index: number) => pieceName(geometry.size, geometry.sticker(index).cubie);
  const ubl = pieceType(puzzle, "corners").pieceByName(REFERENCE_SWAPS["op-corners"].bufferPiece)?.stickers[0]?.index ?? -1;
  const df = pieceType(puzzle, "edges").pieceByName(REFERENCE_SWAPS.m2.bufferPiece)?.stickers[0]?.index ?? -1;

  const symmetry = cubeSymmetries(puzzle).find(
    (g) =>
      relabelMove(puzzle, g, { family: "M", amount: 2 }).family === "M" &&
      pieceOf(g.sticker[ubl] ?? -1) === pieceOf(cornerSticker.index) &&
      pieceOf(g.sticker[df] ?? -1) === pieceOf(edgeSticker.index),
  );
  if (symmetry === undefined) return err({ code: "no-verified-m2-system", cornerBuffer, edgeBuffer });

  // Corners: the reference OP swap relabelled by the symmetry, with the relabelled Gate B families.
  const variants = swapVariants(puzzle, "op-corners");
  if (!variants.ok) return err({ code: "build-failed", detail: JSON.stringify(variants.error) });
  const cornerText = formatMoves((movesOf(REFERENCE_SWAPS["op-corners"].alg) ?? []).map((m): AlgMove => ({ type: "move", ...relabelMove(puzzle, symmetry, m) })));
  const cornerSwap = variants.value.find((v) => v.bufferPiece === pieceOf(cornerSticker.index) && formatMoves(v.moves) === cornerText);
  if (cornerSwap === undefined) return err({ code: "build-failed", detail: `no OP corner variant ${cornerText}` });
  const corners = buildOpSetupsDataset(puzzle, {
    id: `op-corners.${cornerBuffer}`,
    swap: cornerSwap,
    bufferSticker: cornerBuffer,
    setupFamilies: GATE_B_SETUP_FAMILIES["op-corners"].map((family) => relabelMove(puzzle, symmetry, { family, amount: 1 }).family),
    symmetry: symmetry.index,
  });
  if (!corners.ok) return err({ code: "build-failed", detail: JSON.stringify(corners.error) });

  // Edges: the M2 variant for the buffer; special cases and parity searched.
  const swaps = m2Swaps(puzzle);
  if (!swaps.ok) return err({ code: "build-failed", detail: JSON.stringify(swaps.error) });
  const m2 = swaps.value.find((s) => s.bufferPiece === pieceOf(edgeSticker.index));
  if (m2 === undefined) return err({ code: "no-verified-m2-system", cornerBuffer, edgeBuffer });
  const catalogue = specialCatalogue(puzzle);
  const edges = buildM2Dataset(puzzle, { id: `m2-edges.${edgeBuffer}`, swap: m2, bufferSticker: edgeBuffer, symmetry: symmetry.index, specials: { kind: "search", catalogue } });
  if (!edges.ok) return err({ code: "build-failed", detail: JSON.stringify(edges.error) });
  const parity = buildM2OpParityDataset(puzzle, { id: `m2op-parity.${cornerBuffer}-${edgeBuffer}`, corners: corners.value, edges: edges.value, symmetry: symmetry.index, algs: { kind: "search", catalogue } });
  if (!parity.ok) return err({ code: "build-failed", detail: JSON.stringify(parity.error) });

  const problems = [...verifyOpSetupsDataset(puzzle, corners.value), ...verifyM2Dataset(puzzle, edges.value), ...verifyM2OpParityDataset(puzzle, parity.value, corners.value, edges.value)];
  if (problems.length > 0) return err({ code: "verification-failed", problems });
  return ok({ corners: corners.value, edges: edges.value, parity: parity.value });
}
