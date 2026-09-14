import * as z from "zod";
import { at } from "../core/arrays.js";
import { composePerms, identityPerm, moveTable, type StickerPerm } from "../core/move-table.js";
import { faceletsOf, VERIFIED_MOVE_FAMILIES, type Puzzle } from "../core/puzzle.js";
import { err, ok, type Result } from "../core/result.js";
import { cubeSymmetries, relabelMove } from "../core/symmetry.js";
import { formatMoves } from "../commutator/expand.js";
import type { AlgMove } from "../commutator/parse.js";
import { stickerCyclePattern } from "../commutator/validate.js";
import { geometryAlgPermutation } from "../core/geometry-moves.js";
import { DEFAULT_SETUP_POOLS, searchSetups } from "../methods/setup-search.js";
import { analyseSwap, REFERENCE_JB, type SwapAlg } from "../methods/swap-algs.js";
import { pieceName, stickerName } from "../pieces/names.js";
import { pieceType } from "../pieces/piece-types.js";
import { ENGINE_VERSION } from "../version.js";
import { AlgEntrySchema, checkAlgEntry, entryForAlg, IntendedEffectSchema, stickerCycles, StickerName, type AlgDataset, type AlgEntry, type DatasetProblem } from "./alg-dataset.js";
import type { M2Dataset } from "./m2-dataset.js";
import { movesOf, targetAlg } from "./op-dataset.js";

/**
 * 3-style parity datasets (DECISIONS D-026).
 *
 * With odd target counts, each piece type gets one more target, its buffer's partner (UBR for corners,
 * UR for edges), and one alg at the end swaps both buffers with their partners: a Jb perm for 3-style
 * edges, Jb conjugated by a searched setup for M2 edges (whose buffer is DF). A last target on a
 * partner piece can't be paired with the partner; its "tail" is the twist or flip alg with the same
 * effect, found by matching effects, never written in.
 */

const Symmetry = z.number().int().min(0).max(47);
const Tail = z.object({ pieceType: z.enum(["corners", "edges"]), target: StickerName, record: z.string().min(1) });
const common = {
  format: z.literal("bld-platform/alg-dataset"),
  version: z.literal(1),
  id: z.string().min(1),
  puzzle: z.literal("3x3x3"),
  kind: z.literal("parity"),
  generatedBy: z.object({ engine: z.string().min(1) }),
  buffers: z.object({ corners: StickerName, edges: StickerName }),
  /** Where the parity alg sends each buffer sticker: the target appended to an odd memo. */
  partners: z.object({ corners: StickerName, edges: StickerName }),
  /** A last target on a partner piece, other than the partner itself: the orientation record to use instead. */
  tails: z.array(Tail),
  /** The symmetry relabelling the reference Jb (y2). */
  symmetry: Symmetry,
  records: z.tuple([z.object({ id: z.literal("parity"), kind: z.literal("parity"), intendedEffect: IntendedEffectSchema, algs: z.array(AlgEntrySchema).min(1).max(4) })]),
};

export const ThreeStyleParityDatasetSchema = z.object({ ...common, method: z.literal("3style") });
export const M2ThreeStyleParityDatasetSchema = z.object({
  ...common,
  method: z.literal("m2-3style"),
  /** Brings the M2 buffer to the Jb's edge slot without disturbing the edge partner or the corners. */
  setup: z.string().min(1),
});

export type ThreeStyleParityDataset = z.infer<typeof ThreeStyleParityDatasetSchema>;
export type M2ThreeStyleParityDataset = z.infer<typeof M2ThreeStyleParityDatasetSchema>;
export type ParityTail = z.infer<typeof Tail>;

export type ThreeStyleParityProblem =
  | DatasetProblem
  | { readonly code: "parity-mismatch"; readonly field: string }
  | { readonly code: "parity-not-reference" }
  | { readonly code: "citation-mismatch"; readonly record: string }
  | { readonly code: "partner-mismatch"; readonly pieceType: "corners" | "edges" }
  | { readonly code: "tails-mismatch" }
  | { readonly code: "setup-mismatch"; readonly expected: string };

export type ThreeStyleParityBuildError = { readonly code: "build-failed"; readonly detail: string };

/** The reference Jb relabelled by its rotation into face turns, with that symmetry's index. */
export function referenceJb(puzzle: Puzzle): { readonly moves: readonly AlgMove[]; readonly symmetry: number } {
  const rotation = geometryAlgPermutation(puzzle.geometry, REFERENCE_JB.relabelBy);
  const g = cubeSymmetries(puzzle).find((s) => s.sticker.every((to, from) => to === rotation[from]));
  const moves = movesOf(puzzle, REFERENCE_JB.alg);
  if (g === undefined || moves === undefined) throw new Error("the reference Jb can't be relabelled");
  return { moves: moves.map((m): AlgMove => ({ type: "move", ...relabelMove(puzzle, g, m) })), symmetry: g.index };
}

function permOf(puzzle: Puzzle, moves: readonly AlgMove[]): StickerPerm {
  const table = moveTable(puzzle, VERIFIED_MOVE_FAMILIES[puzzle.id]);
  return moves.reduce((perm, m) => composePerms(perm, table.move(m.family, m.amount).perm), identityPerm(table.stickerCount));
}

function exchange(puzzle: Puzzle, buffer: string, target: string): StickerPerm {
  const pattern = stickerCyclePattern(puzzle, [buffer, target]);
  if (!pattern.ok) throw new Error(`${buffer} ↔ ${target}: ${JSON.stringify(pattern.error)}`);
  return Uint8Array.from(faceletsOf(puzzle, pattern.value));
}

const indexOf = (puzzle: Puzzle, name: string) => puzzle.geometry.stickers.findIndex((s) => stickerName(puzzle.geometry, s.index) === name);

/** The parity effect: both buffers exchanged with their partners. */
export function threeStyleParityEffect(puzzle: Puzzle, buffers: { corners: string; edges: string }, partners: { corners: string; edges: string }): StickerPerm {
  return composePerms(exchange(puzzle, buffers.corners, partners.corners), exchange(puzzle, buffers.edges, partners.edges));
}

/**
 * Tails for one piece type: each sticker of the partner piece other than the partner, with the
 * orientation record whose effect is the exchange with that sticker undone by the exchange with the
 * partner, E(b, t)·E(b, partner).
 */
export function deriveTails(puzzle: Puzzle, orientations: AlgDataset, partner: string): Result<ParityTail[], string> {
  const type = pieceType(puzzle, orientations.pieceType);
  const partnerInfo = type.stickerByName(partner);
  if (partnerInfo === undefined) return err(`unknown partner ${partner}`);
  const tails: ParityTail[] = [];
  for (const sticker of at(type.pieces, partnerInfo.position).stickers) {
    if (sticker.name === partner) continue;
    const required = JSON.stringify(stickerCycles(puzzle, composePerms(exchange(puzzle, orientations.buffer, sticker.name), exchange(puzzle, orientations.buffer, partner))));
    const matches = orientations.records.filter((r) => JSON.stringify(r.intendedEffect.stickerCycles) === required);
    const match = matches[0];
    if (matches.length !== 1 || match === undefined) return err(`no single ${orientations.kind} record for a last target ${sticker.name}`);
    tails.push({ pieceType: orientations.pieceType, target: sticker.name, record: match.id });
  }
  return ok(tails);
}

function partnersOf(puzzle: Puzzle, perm: StickerPerm, buffers: { corners: string; edges: string }): { corners: string; edges: string } {
  return { corners: stickerName(puzzle.geometry, at(perm, indexOf(puzzle, buffers.corners))), edges: stickerName(puzzle.geometry, at(perm, indexOf(puzzle, buffers.edges))) };
}

/** The piece type whose buffer the parity alg leaves on its own piece, if any. */
function unmovedBuffer(puzzle: Puzzle, buffers: { corners: string; edges: string }, partners: { corners: string; edges: string }): "corners" | "edges" | undefined {
  return (["corners", "edges"] as const).find((typeId) => {
    const type = pieceType(puzzle, typeId);
    return type.stickerByName(buffers[typeId])?.position === type.stickerByName(partners[typeId])?.position;
  });
}

/** The Jb as a swap from its edge partner, for the setup search (its side effect is the corner swap). */
function jbSwap(puzzle: Puzzle, jb: { moves: readonly AlgMove[]; symmetry: number }, edgePartner: string): Result<SwapAlg, ThreeStyleParityBuildError> {
  const perm = permOf(puzzle, jb.moves);
  const shape = analyseSwap(puzzle, "op-edges", perm, pieceName(puzzle.size, puzzle.geometry.sticker(indexOf(puzzle, edgePartner)).cubie));
  if (!shape.ok) return err({ code: "build-failed", detail: JSON.stringify(shape.error) });
  return ok({ ...shape.value, method: "op-edges", alg: { puzzle: puzzle.id, nodes: jb.moves }, moves: jb.moves, etm: jb.moves.length, symmetry: jb.symmetry });
}

function m2Setup(puzzle: Puzzle, swap: SwapAlg, edgePartner: string, edgeBuffer: string): Result<readonly AlgMove[], ThreeStyleParityBuildError> {
  const table = searchSetups(puzzle, { swap, bufferSticker: edgePartner, ...DEFAULT_SETUP_POOLS["op-edges"] });
  if (!table.ok) return err({ code: "build-failed", detail: JSON.stringify(table.error) });
  const setup = table.value.targets.find((t) => t.target === edgeBuffer)?.setup;
  return setup === undefined ? err({ code: "build-failed", detail: `no setup brings ${edgeBuffer} to the Jb` }) : ok(setup);
}

export interface ThreeStyleParitySpec {
  readonly id: string;
  readonly corners: AlgDataset;
  readonly edges: AlgDataset;
  readonly twists: AlgDataset;
  readonly flips: AlgDataset;
}

export function buildThreeStyleParityDataset(puzzle: Puzzle, spec: ThreeStyleParitySpec): Result<ThreeStyleParityDataset, ThreeStyleParityBuildError> {
  const jb = referenceJb(puzzle);
  const buffers = { corners: spec.corners.buffer, edges: spec.edges.buffer };
  const partners = partnersOf(puzzle, permOf(puzzle, jb.moves), buffers);
  const unmoved = unmovedBuffer(puzzle, buffers, partners);
  if (unmoved !== undefined) return err({ code: "build-failed", detail: `the Jb doesn't move the ${unmoved} buffer` });
  const cornerTails = deriveTails(puzzle, spec.twists, partners.corners);
  const edgeTails = deriveTails(puzzle, spec.flips, partners.edges);
  if (!cornerTails.ok) return err({ code: "build-failed", detail: cornerTails.error });
  if (!edgeTails.ok) return err({ code: "build-failed", detail: edgeTails.error });
  const entry = entryForAlg(puzzle, formatMoves(jb.moves), "symmetry", REFERENCE_JB.source);
  return ok({
    format: "bld-platform/alg-dataset",
    version: 1,
    id: spec.id,
    puzzle: "3x3x3",
    method: "3style",
    kind: "parity",
    generatedBy: { engine: ENGINE_VERSION },
    buffers,
    partners,
    tails: [...cornerTails.value, ...edgeTails.value],
    symmetry: jb.symmetry,
    records: [{ id: "parity", kind: "parity", intendedEffect: { stickerCycles: stickerCycles(puzzle, threeStyleParityEffect(puzzle, buffers, partners)), sideEffectPieces: [] }, algs: [entry] }],
  });
}

export interface M2ThreeStyleParitySpec {
  readonly id: string;
  readonly corners: AlgDataset;
  readonly twists: AlgDataset;
  readonly edges: M2Dataset;
}

export function buildM2ThreeStyleParityDataset(puzzle: Puzzle, spec: M2ThreeStyleParitySpec): Result<M2ThreeStyleParityDataset, ThreeStyleParityBuildError> {
  const jb = referenceJb(puzzle);
  const jbPartners = partnersOf(puzzle, permOf(puzzle, jb.moves), { corners: spec.corners.buffer, edges: REFERENCE_JB.bufferPieces.edges });
  const swap = jbSwap(puzzle, jb, jbPartners.edges);
  if (!swap.ok) return swap;
  const setup = m2Setup(puzzle, swap.value, jbPartners.edges, spec.edges.buffer);
  if (!setup.ok) return setup;
  const text = targetAlg(formatMoves(setup.value), formatMoves(jb.moves));
  const entry: AlgEntry = entryForAlg(puzzle, text, "engine-search");
  const buffers = { corners: spec.corners.buffer, edges: spec.edges.buffer };
  const partners = partnersOf(puzzle, permOf(puzzle, movesOf(puzzle, text) ?? []), buffers);
  const unmoved = unmovedBuffer(puzzle, buffers, partners);
  if (unmoved !== undefined) return err({ code: "build-failed", detail: `the parity alg doesn't move the ${unmoved} buffer` });
  const cornerTails = deriveTails(puzzle, spec.twists, partners.corners);
  if (!cornerTails.ok) return err({ code: "build-failed", detail: cornerTails.error });
  return ok({
    format: "bld-platform/alg-dataset",
    version: 1,
    id: spec.id,
    puzzle: "3x3x3",
    method: "m2-3style",
    kind: "parity",
    generatedBy: { engine: ENGINE_VERSION },
    buffers,
    partners,
    tails: cornerTails.value,
    symmetry: jb.symmetry,
    setup: formatMoves(setup.value),
    records: [{ id: "parity", kind: "parity", intendedEffect: { stickerCycles: stickerCycles(puzzle, threeStyleParityEffect(puzzle, buffers, partners)), sideEffectPieces: [] }, algs: [entry] }],
  });
}

function checkCommon(puzzle: Puzzle, parity: ThreeStyleParityDataset | M2ThreeStyleParityDataset, problems: ThreeStyleParityProblem[]): void {
  const jb = referenceJb(puzzle);
  if (parity.symmetry !== jb.symmetry) problems.push({ code: "parity-mismatch", field: "symmetry" });
  const [record] = parity.records;
  const main = record.algs[0];
  const mainMoves = main === undefined ? undefined : movesOf(puzzle, main.alg);
  // Partners are where the main alg sends each buffer; each must be on a different piece of the buffer's type.
  if (mainMoves !== undefined) {
    const stated = partnersOf(puzzle, permOf(puzzle, mainMoves), parity.buffers);
    for (const typeId of ["corners", "edges"] as const) {
      const type = pieceType(puzzle, typeId);
      const buffer = type.stickerByName(parity.buffers[typeId]);
      const partner = type.stickerByName(parity.partners[typeId]);
      if (stated[typeId] !== parity.partners[typeId] || buffer === undefined || partner === undefined || buffer.position === partner.position) problems.push({ code: "partner-mismatch", pieceType: typeId });
    }
  }
  let effect: StickerPerm;
  try {
    effect = threeStyleParityEffect(puzzle, parity.buffers, parity.partners);
  } catch {
    problems.push({ code: "wrong-intended-effect", record: record.id });
    return;
  }
  if (JSON.stringify(record.intendedEffect.stickerCycles) !== JSON.stringify(stickerCycles(puzzle, effect))) problems.push({ code: "wrong-intended-effect", record: record.id });
  if (record.intendedEffect.sideEffectPieces.length > 0) problems.push({ code: "side-effects-not-allowed", record: record.id });
  const entryProblems: DatasetProblem[] = [];
  const seen = new Set<string>();
  for (const entry of record.algs) {
    checkAlgEntry(puzzle, record.id, entry, effect, entryProblems);
    if (seen.has(entry.moves)) entryProblems.push({ code: "duplicate-alg", record: record.id, alg: entry.alg });
    seen.add(entry.moves);
  }
  problems.push(...entryProblems);
}

function checkTails(puzzle: Puzzle, parity: ThreeStyleParityDataset | M2ThreeStyleParityDataset, sources: readonly [AlgDataset, "corners" | "edges"][], problems: ThreeStyleParityProblem[]): void {
  const expected: ParityTail[] = [];
  for (const [orientations, typeId] of sources) {
    const tails = deriveTails(puzzle, orientations, parity.partners[typeId]);
    if (!tails.ok) {
      problems.push({ code: "tails-mismatch" });
      return;
    }
    expected.push(...tails.value);
  }
  if (JSON.stringify(parity.tails) !== JSON.stringify(expected)) problems.push({ code: "tails-mismatch" });
}

export function verifyThreeStyleParityDataset(
  puzzle: Puzzle,
  parity: ThreeStyleParityDataset,
  datasets: { readonly corners: AlgDataset; readonly edges: AlgDataset; readonly twists: AlgDataset; readonly flips: AlgDataset },
): ThreeStyleParityProblem[] {
  const problems: ThreeStyleParityProblem[] = [];
  const { corners, edges, twists, flips } = datasets;
  if (corners.kind !== "cycles" || corners.pieceType !== "corners" || corners.buffer !== parity.buffers.corners) problems.push({ code: "parity-mismatch", field: "corners" });
  if (edges.kind !== "cycles" || edges.pieceType !== "edges" || edges.buffer !== parity.buffers.edges) problems.push({ code: "parity-mismatch", field: "edges" });
  if (twists.kind !== "twists" || twists.buffer !== parity.buffers.corners) problems.push({ code: "parity-mismatch", field: "twists" });
  if (flips.kind !== "flips" || flips.buffer !== parity.buffers.edges) problems.push({ code: "parity-mismatch", field: "flips" });
  const main = parity.records[0].algs[0];
  const jb = referenceJb(puzzle);
  if (main === undefined || main.source !== "symmetry" || formatMoves(movesOf(puzzle, main.alg) ?? []) !== formatMoves(jb.moves)) problems.push({ code: "parity-not-reference" });
  if (main !== undefined && main.citation !== REFERENCE_JB.source) problems.push({ code: "citation-mismatch", record: "parity" });
  checkCommon(puzzle, parity, problems);
  checkTails(puzzle, parity, [[twists, "corners"], [flips, "edges"]], problems);
  return problems;
}

export function verifyM2ThreeStyleParityDataset(
  puzzle: Puzzle,
  parity: M2ThreeStyleParityDataset,
  datasets: { readonly corners: AlgDataset; readonly twists: AlgDataset; readonly edges: M2Dataset },
): ThreeStyleParityProblem[] {
  const problems: ThreeStyleParityProblem[] = [];
  const { corners, twists, edges } = datasets;
  if (corners.kind !== "cycles" || corners.pieceType !== "corners" || corners.buffer !== parity.buffers.corners) problems.push({ code: "parity-mismatch", field: "corners" });
  if (twists.kind !== "twists" || twists.buffer !== parity.buffers.corners) problems.push({ code: "parity-mismatch", field: "twists" });
  if (edges.buffer !== parity.buffers.edges) problems.push({ code: "parity-mismatch", field: "edges" });

  // The main alg is the reference Jb conjugated by a fresh setup search.
  const jb = referenceJb(puzzle);
  const jbPartners = partnersOf(puzzle, permOf(puzzle, jb.moves), { corners: parity.buffers.corners, edges: REFERENCE_JB.bufferPieces.edges });
  const swap = jbSwap(puzzle, jb, jbPartners.edges);
  const setup = swap.ok ? m2Setup(puzzle, swap.value, jbPartners.edges, parity.buffers.edges) : swap;
  if (!setup.ok) {
    problems.push({ code: "setup-mismatch", expected: setup.error.detail });
  } else {
    const expectedSetup = formatMoves(setup.value);
    if (parity.setup !== expectedSetup) problems.push({ code: "setup-mismatch", expected: expectedSetup });
    const expectedMain = entryForAlg(puzzle, targetAlg(parity.setup, formatMoves(jb.moves)), "engine-search").alg;
    if (parity.records[0].algs[0]?.alg !== expectedMain) problems.push({ code: "parity-not-reference" });
  }
  checkCommon(puzzle, parity, problems);
  checkTails(puzzle, parity, [[twists, "corners"]], problems);
  return problems;
}
