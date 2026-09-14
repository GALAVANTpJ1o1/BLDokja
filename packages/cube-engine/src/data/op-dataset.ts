import * as z from "zod";
import { at } from "../core/arrays.js";
import { composePerms, type StickerPerm } from "../core/move-table.js";
import type { Puzzle } from "../core/puzzle.js";
import { err, ok, type Result } from "../core/result.js";
import { cubeSymmetries, relabelMove } from "../core/symmetry.js";
import { expandNodes, formatMoves } from "../commutator/expand.js";
import { parseAlg, type AlgMove } from "../commutator/parse.js";
import { demonstrateSetup, illegalSetupExamples } from "../methods/illegal-setup.js";
import { DEFAULT_SETUP_POOLS, searchSetups, type SetupTable } from "../methods/setup-search.js";
import { analyseSwap, REFERENCE_OP_PARITY, REFERENCE_SWAPS, sideEffectPerm, swapVariants, targetEffect, type SwapAlg } from "../methods/swap-algs.js";
import { stickerName } from "../pieces/names.js";
import { pieceType } from "../pieces/piece-types.js";
import { ENGINE_VERSION } from "../version.js";
import {
  AlgDatasetSchema,
  AlgEntrySchema,
  checkAlgEntry,
  entryForAlg,
  IntendedEffectSchema,
  PieceName,
  stickerCycles,
  StickerName,
  type AlgEntry,
  type DatasetProblem,
} from "./alg-dataset.js";

/**
 * Old Pochmann datasets (DECISIONS D-024): one setup table per piece type and buffer, and one parity
 * alg per pair of swaps.
 *
 * A setups dataset states its swap alg, the families its setups use, which candidate families are
 * forbidden and why (with an example of the damage), and one record per target: the setup, the
 * intended effect, and the alg `[setup: swap]`. Verification never trusts a record: the swap must be
 * a verified symmetry image of the reference, the tables are searched again, and every alg's
 * whole-puzzle permutation must equal the exchange of buffer and target plus the swap's side effect,
 * worked out from the case alone.
 */

const Family = z.string().min(1);
const Symmetry = z.number().int().min(0).max(47);
const counts = { etm: z.number().int().nonnegative(), qtm: z.number().int().nonnegative(), htm: z.number().int().nonnegative(), stm: z.number().int().nonnegative() };
const envelope = {
  format: z.literal("bld-platform/alg-dataset"),
  version: z.literal(1),
  id: z.string().min(1),
  puzzle: z.literal("3x3x3"),
  method: z.literal("op"),
  generatedBy: z.object({ engine: z.string().min(1) }),
};

export const OpSwapSchema = z.object({
  alg: z.string().min(1),
  moves: z.string().min(1),
  ...counts,
  /** `reference` for the published alg itself; `symmetry` for a relabelled image of it. */
  source: z.enum(["reference", "symmetry"]),
  citation: z.string().min(1),
  /** The symmetry (index into `cubeSymmetries`) that relabels the reference into this alg. */
  symmetry: Symmetry,
  swapSticker: StickerName,
  sideEffectPieces: z.array(PieceName).min(1),
});

export const OpTargetRecordSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("target"),
  target: StickerName,
  /** Setup moves; empty for the swap sticker itself. */
  setup: z.string(),
  intendedEffect: IntendedEffectSchema,
  algs: z.array(AlgEntrySchema).min(1).max(4),
});

export const OpSetupsDatasetSchema = z.object({
  ...envelope,
  pieceType: z.enum(["corners", "edges"]),
  /** Buffer sticker. */
  buffer: StickerName,
  kind: z.literal("setups"),
  swap: OpSwapSchema,
  /** Every family checked for whether it may be used (`DEFAULT_SETUP_POOLS`). */
  candidateFamilies: z.array(Family).min(1),
  /** The families the setups use, in candidate order. */
  setupFamilies: z.array(Family).min(1),
  /** Candidate families that move no protected piece. */
  allowed: z.array(Family),
  forbidden: z.array(
    z.object({
      family: Family,
      disturbs: z.array(PieceName).min(1),
      example: z.object({ target: StickerName, setup: z.string().min(1), damagedPieces: z.array(PieceName).min(1) }),
    }),
  ),
  records: z.array(OpTargetRecordSchema),
});

export const OpParityRecordSchema = z.object({
  id: z.literal("parity"),
  kind: z.literal("parity"),
  intendedEffect: IntendedEffectSchema,
  algs: z.array(AlgEntrySchema).min(1).max(4),
});

export const OpParityDatasetSchema = z.object({
  ...envelope,
  kind: z.literal("parity"),
  /** Buffer stickers of the two setups datasets this parity alg belongs with. */
  buffers: z.object({ corners: StickerName, edges: StickerName }),
  /** Their swap algs, whose leftover side effects the parity alg cancels. */
  swaps: z.object({ corners: z.string().min(1), edges: z.string().min(1) }),
  symmetry: Symmetry,
  records: z.tuple([OpParityRecordSchema]),
});

/** Every dataset kind under `content/algs/`. */
export const ContentDatasetSchema = z.discriminatedUnion("kind", [AlgDatasetSchema, OpSetupsDatasetSchema, OpParityDatasetSchema]);

export type OpSetupsDataset = z.infer<typeof OpSetupsDatasetSchema>;
export type OpParityDataset = z.infer<typeof OpParityDatasetSchema>;
export type OpTargetRecord = z.infer<typeof OpTargetRecordSchema>;
export type ContentDataset = z.infer<typeof ContentDatasetSchema>;

export type OpDatasetProblem =
  | DatasetProblem
  | { readonly code: "invalid-swap"; readonly detail: string }
  | { readonly code: "swap-not-reference" }
  | { readonly code: "swap-not-symmetry-image" }
  | { readonly code: "swap-mismatch"; readonly field: string }
  | { readonly code: "setup-families-invalid"; readonly detail: string }
  | { readonly code: "allowed-mismatch" }
  | { readonly code: "forbidden-mismatch" }
  | { readonly code: "example-mismatch"; readonly family: string }
  | { readonly code: "example-harmless"; readonly family: string }
  | { readonly code: "setup-mismatch"; readonly record: string; readonly expected: string }
  | { readonly code: "setup-uses-other-family"; readonly record: string }
  | { readonly code: "main-alg-mismatch"; readonly record: string; readonly expected: string }
  | { readonly code: "citation-mismatch"; readonly record: string }
  | { readonly code: "parity-mismatch"; readonly field: string }
  | { readonly code: "parity-not-reference" };

type OpMethod = "op-corners" | "op-edges";
const methodOf = (typeId: "corners" | "edges"): OpMethod => (typeId === "corners" ? "op-corners" : "op-edges");

function identitySymmetry(puzzle: Puzzle): number {
  return cubeSymmetries(puzzle).findIndex((g) => g.sticker.every((to, from) => to === from));
}

function movesOf(puzzle: Puzzle, text: string): AlgMove[] | undefined {
  const parsed = parseAlg(puzzle.id, text);
  return parsed.ok ? expandNodes(parsed.value.nodes) : undefined;
}

/** A reference alg relabelled by a symmetry, as a plain move sequence. */
function relabelled(puzzle: Puzzle, symmetry: number, text: string): string {
  const moves = movesOf(puzzle, text);
  const g = cubeSymmetries(puzzle)[symmetry];
  if (moves === undefined || g === undefined) throw new Error(`can't relabel "${text}" by symmetry ${symmetry}`);
  return formatMoves(moves.map((m): AlgMove => ({ type: "move", ...relabelMove(puzzle, g, m) })));
}

/** `[setup: swap]`, or the plain swap when there is no setup. */
function targetAlg(setup: string, swap: string): string {
  return setup === "" ? swap : `[${setup}: ${swap}]`;
}

export interface OpSetupsSpec {
  readonly id: string;
  /** A reference swap or one of its symmetry variants (`swapVariants`). */
  readonly swap: SwapAlg;
  readonly bufferSticker: string;
  readonly setupFamilies: readonly string[];
  /** The symmetry relabelling the reference into `swap`; defaults to `swap.symmetry`. */
  readonly symmetry?: number;
}

export type OpBuildError =
  | { readonly code: "not-an-op-swap"; readonly method: string }
  | { readonly code: "setup-family-not-a-candidate"; readonly family: string }
  | { readonly code: "setup-family-forbidden"; readonly family: string }
  | { readonly code: "setup-search-failed"; readonly detail: string }
  | { readonly code: "unreachable-targets"; readonly targets: readonly string[] };

interface BuiltTables {
  readonly setupFamilies: string[];
  readonly candidates: SetupTable;
  readonly legal: SetupTable;
}

function buildTables(puzzle: Puzzle, method: OpMethod, swap: SwapAlg, bufferSticker: string, families: readonly string[]): Result<BuiltTables, OpBuildError> {
  const candidateFamilies = DEFAULT_SETUP_POOLS[method].pool;
  const stray = families.find((f) => !(candidateFamilies as readonly string[]).includes(f));
  if (stray !== undefined) return err({ code: "setup-family-not-a-candidate", family: stray });
  const candidates = searchSetups(puzzle, { swap, bufferSticker, pool: candidateFamilies, regime: "every-move" });
  if (!candidates.ok) return err({ code: "setup-search-failed", detail: JSON.stringify(candidates.error) });
  const forbidden = families.find((f) => !candidates.value.allowed.includes(f));
  if (forbidden !== undefined) return err({ code: "setup-family-forbidden", family: forbidden });
  const setupFamilies = candidateFamilies.filter((f) => families.includes(f));
  const legal = searchSetups(puzzle, { swap, bufferSticker, pool: setupFamilies, regime: "every-move" });
  if (!legal.ok) return err({ code: "setup-search-failed", detail: JSON.stringify(legal.error) });
  if (legal.value.unreachable.length > 0) return err({ code: "unreachable-targets", targets: legal.value.unreachable });
  return ok({ setupFamilies, candidates: candidates.value, legal: legal.value });
}

export function buildOpSetupsDataset(puzzle: Puzzle, spec: OpSetupsSpec): Result<OpSetupsDataset, OpBuildError> {
  const { swap, bufferSticker } = spec;
  if (swap.method !== "op-corners" && swap.method !== "op-edges") return err({ code: "not-an-op-swap", method: swap.method });
  const method: OpMethod = swap.method;
  const tables = buildTables(puzzle, method, swap, bufferSticker, spec.setupFamilies);
  if (!tables.ok) return tables;
  const { setupFamilies, candidates, legal } = tables.value;
  const symmetry = spec.symmetry ?? swap.symmetry;

  const reference = REFERENCE_SWAPS[method];
  const swapText = formatMoves(swap.moves);
  const swapEntry = entryForAlg(puzzle, swapText, symmetry === identitySymmetry(puzzle) ? "reference" : "symmetry", reference.source);
  const examples = illegalSetupExamples(puzzle, { swap, bufferSticker, legal, forbidden: candidates.forbidden, candidateFamilies: DEFAULT_SETUP_POOLS[method].pool });

  const records: OpTargetRecord[] = legal.targets.map(({ target, setup }) => {
    const setupText = formatMoves(setup ?? []);
    const effect = targetEffect(puzzle, swap, bufferSticker, target);
    if (!effect.ok) throw new Error(`${target}: ${JSON.stringify(effect.error)}`);
    return {
      id: target,
      kind: "target",
      target,
      setup: setupText,
      intendedEffect: { stickerCycles: stickerCycles(puzzle, effect.value), sideEffectPieces: [...swap.sideEffectPieces] },
      algs: [entryForAlg(puzzle, targetAlg(setupText, swapText), "engine-search")],
    };
  });

  return ok({
    format: "bld-platform/alg-dataset",
    version: 1,
    id: spec.id,
    puzzle: "3x3x3",
    method: "op",
    pieceType: reference.pieceType,
    buffer: bufferSticker,
    kind: "setups",
    generatedBy: { engine: ENGINE_VERSION },
    swap: {
      alg: swapEntry.alg,
      moves: swapEntry.moves,
      etm: swapEntry.etm,
      qtm: swapEntry.qtm,
      htm: swapEntry.htm,
      stm: swapEntry.stm,
      source: swapEntry.source === "reference" ? "reference" : "symmetry",
      citation: reference.source,
      symmetry,
      swapSticker: legal.swapSticker,
      sideEffectPieces: [...swap.sideEffectPieces],
    },
    candidateFamilies: [...DEFAULT_SETUP_POOLS[method].pool],
    setupFamilies,
    allowed: [...candidates.allowed],
    forbidden: candidates.forbidden.map((f) => {
      const example = examples.find((e) => e.family === f.family);
      if (example === undefined) throw new Error(`no example for ${f.family}`);
      return { family: f.family, disturbs: [...f.disturbs], example: { target: example.target, setup: formatMoves(example.setup), damagedPieces: [...example.damagedPieces] } };
    }),
    records,
  });
}

/** The swap a setups dataset states, recomputed and checked: a verified variant of the reference, relabelled by the stated symmetry. */
export function datasetSwap(puzzle: Puzzle, dataset: OpSetupsDataset): Result<SwapAlg, OpDatasetProblem> {
  const method = methodOf(dataset.pieceType);
  const type = pieceType(puzzle, dataset.pieceType);
  const buffer = type.stickerByName(dataset.buffer);
  if (buffer === undefined) return err({ code: "unknown-buffer", buffer: dataset.buffer });
  const bufferPiece = at(type.pieces, buffer.position).name;
  const text = formatMoves(movesOf(puzzle, dataset.swap.alg) ?? []);
  const variants = swapVariants(puzzle, method);
  if (!variants.ok) return err({ code: "invalid-swap", detail: JSON.stringify(variants.error) });
  const swap = variants.value.find((v) => v.bufferPiece === bufferPiece && formatMoves(v.moves) === text);
  if (swap === undefined) return err({ code: "swap-not-symmetry-image" });
  if (relabelled(puzzle, dataset.swap.symmetry, REFERENCE_SWAPS[method].alg) !== text) return err({ code: "swap-not-symmetry-image" });
  return ok(swap);
}

export function verifyOpSetupsDataset(puzzle: Puzzle, dataset: OpSetupsDataset): OpDatasetProblem[] {
  const problems: OpDatasetProblem[] = [];
  const entryProblems: DatasetProblem[] = [];
  const method = methodOf(dataset.pieceType);
  const swapResult = datasetSwap(puzzle, dataset);
  if (!swapResult.ok) return [swapResult.error];
  const swap = swapResult.value;

  // The swap: provenance, notation, counts and computed effect.
  const reference = REFERENCE_SWAPS[method];
  const isIdentity = dataset.swap.symmetry === identitySymmetry(puzzle);
  if ((dataset.swap.source === "reference") !== isIdentity) problems.push({ code: "swap-not-reference" });
  if (dataset.swap.citation !== reference.source) problems.push({ code: "citation-mismatch", record: "swap" });
  const stated = dataset.swap;
  const asEntry: AlgEntry = { alg: stated.alg, moves: stated.moves, etm: stated.etm, qtm: stated.qtm, htm: stated.htm, stm: stated.stm, source: "engine-search" };
  checkAlgEntry(puzzle, "swap", asEntry, swap.perm, entryProblems);
  const shape = analyseSwap(puzzle, method, swap.perm, swap.bufferPiece);
  if (!shape.ok) problems.push({ code: "invalid-swap", detail: JSON.stringify(shape.error) });
  const bufferIndex = pieceType(puzzle, dataset.pieceType).stickerByName(dataset.buffer)?.index ?? -1;
  if (stickerName(puzzle.geometry, at(swap.perm, bufferIndex)) !== stated.swapSticker) problems.push({ code: "swap-mismatch", field: "swapSticker" });
  if (JSON.stringify(stated.sideEffectPieces) !== JSON.stringify(swap.sideEffectPieces)) problems.push({ code: "swap-mismatch", field: "sideEffectPieces" });

  // The tables, searched again.
  if (JSON.stringify(dataset.candidateFamilies) !== JSON.stringify(DEFAULT_SETUP_POOLS[method].pool)) problems.push({ code: "setup-families-invalid", detail: "candidateFamilies" });
  const tables = buildTables(puzzle, method, swap, dataset.buffer, dataset.setupFamilies);
  if (!tables.ok) return [...problems, ...entryProblems, { code: "setup-families-invalid", detail: JSON.stringify(tables.error) }];
  const { candidates, legal } = tables.value;
  if (JSON.stringify(tables.value.setupFamilies) !== JSON.stringify(dataset.setupFamilies)) problems.push({ code: "setup-families-invalid", detail: "not in candidate order" });
  if (JSON.stringify(dataset.allowed) !== JSON.stringify(candidates.allowed)) problems.push({ code: "allowed-mismatch" });
  const forbiddenKey = (f: { family: string; disturbs: readonly string[] }) => `${f.family}:${f.disturbs.join(",")}`;
  if (JSON.stringify(dataset.forbidden.map(forbiddenKey)) !== JSON.stringify(candidates.forbidden.map(forbiddenKey))) problems.push({ code: "forbidden-mismatch" });

  // Forbidden examples: recomputed, and the damage shown again.
  const examples = illegalSetupExamples(puzzle, { swap, bufferSticker: dataset.buffer, legal, forbidden: candidates.forbidden, candidateFamilies: dataset.candidateFamilies });
  for (const stated of dataset.forbidden) {
    const expected = examples.find((e) => e.family === stated.family);
    if (expected === undefined) continue;
    const same =
      expected.target === stated.example.target &&
      formatMoves(expected.setup) === stated.example.setup &&
      JSON.stringify(expected.damagedPieces) === JSON.stringify(stated.example.damagedPieces);
    if (!same) problems.push({ code: "example-mismatch", family: stated.family });
    const demo = demonstrateSetup(puzzle, swap, dataset.buffer, stated.example.target, stated.example.setup);
    const setupMoves = movesOf(puzzle, stated.example.setup) ?? [];
    if (!demo.ok || !demo.value.reachesSwapSticker || demo.value.damagedPieces.length === 0 || !setupMoves.some((m) => m.family === stated.family)) {
      problems.push({ code: "example-harmless", family: stated.family });
    }
  }

  // Records: coverage, setups, intended effects and algs.
  const expectedIds = legal.targets.map((t) => t.target);
  const swapText = formatMoves(swap.moves);
  for (const record of dataset.records) {
    const legalSetup = legal.targets.find((t) => t.target === record.target);
    if (record.id !== record.target) problems.push({ code: "wrong-id", record: record.id, expected: record.target });
    if (legalSetup === undefined) continue;
    const expectedSetup = formatMoves(legalSetup.setup ?? []);
    if (record.setup !== expectedSetup) problems.push({ code: "setup-mismatch", record: record.id, expected: expectedSetup });
    const setupMoves = record.setup === "" ? [] : movesOf(puzzle, record.setup);
    if (setupMoves === undefined || !setupMoves.every((m) => dataset.setupFamilies.includes(m.family))) problems.push({ code: "setup-uses-other-family", record: record.id });
    const effect = targetEffect(puzzle, swap, dataset.buffer, record.target);
    if (!effect.ok) {
      problems.push({ code: "invalid-case", record: record.id, detail: JSON.stringify(effect.error) });
      continue;
    }
    if (JSON.stringify(record.intendedEffect.stickerCycles) !== JSON.stringify(stickerCycles(puzzle, effect.value))) problems.push({ code: "wrong-intended-effect", record: record.id });
    if (JSON.stringify(record.intendedEffect.sideEffectPieces) !== JSON.stringify(swap.sideEffectPieces)) problems.push({ code: "wrong-intended-effect", record: record.id });
    const main = record.algs[0];
    const expectedMain = entryForAlg(puzzle, targetAlg(record.setup, swapText), "engine-search").alg;
    if (main?.alg !== expectedMain) problems.push({ code: "main-alg-mismatch", record: record.id, expected: expectedMain });
    const seen = new Set<string>();
    for (const entry of record.algs) {
      checkAlgEntry(puzzle, record.id, entry, effect.value, entryProblems);
      if (seen.has(entry.moves)) entryProblems.push({ code: "duplicate-alg", record: record.id, alg: entry.alg });
      seen.add(entry.moves);
    }
  }
  const present = dataset.records.map((r) => r.id);
  for (const id of expectedIds) if (!present.includes(id)) problems.push({ code: "missing-record", record: id });
  for (const id of present) if (!expectedIds.includes(id)) problems.push({ code: "unexpected-record", record: id });
  const inOrder = present.filter((id) => expectedIds.includes(id));
  if (JSON.stringify(inOrder) !== JSON.stringify(expectedIds.filter((id) => present.includes(id)))) problems.push({ code: "records-out-of-order" });
  return [...problems, ...entryProblems];
}

/**
 * The permutation a parity alg for these two setups datasets must have: the corner swap's side effect
 * (on edges) together with the edge swap's side effect (on corners). Each OP target step repeats its
 * swap's side effect once, so with odd target counts both are left over, and this cancels them.
 */
export function opParityEffect(puzzle: Puzzle, corners: OpSetupsDataset, edges: OpSetupsDataset): Result<StickerPerm, OpDatasetProblem> {
  const cornerSwap = datasetSwap(puzzle, corners);
  if (!cornerSwap.ok) return cornerSwap;
  const edgeSwap = datasetSwap(puzzle, edges);
  if (!edgeSwap.ok) return edgeSwap;
  return ok(composePerms(sideEffectPerm(puzzle, cornerSwap.value), sideEffectPerm(puzzle, edgeSwap.value)));
}

export interface OpParitySpec {
  readonly id: string;
  readonly corners: OpSetupsDataset;
  readonly edges: OpSetupsDataset;
  /** The symmetry relabelling the reference parity alg (and both reference swaps). */
  readonly symmetry: number;
}

export function buildOpParityDataset(puzzle: Puzzle, spec: OpParitySpec): Result<OpParityDataset, OpDatasetProblem> {
  const effect = opParityEffect(puzzle, spec.corners, spec.edges);
  if (!effect.ok) return effect;
  const isIdentity = spec.symmetry === identitySymmetry(puzzle);
  const entry: AlgEntry = entryForAlg(puzzle, relabelled(puzzle, spec.symmetry, REFERENCE_OP_PARITY.alg), isIdentity ? "reference" : "symmetry", REFERENCE_OP_PARITY.source);
  return ok({
    format: "bld-platform/alg-dataset",
    version: 1,
    id: spec.id,
    puzzle: "3x3x3",
    method: "op",
    kind: "parity",
    generatedBy: { engine: ENGINE_VERSION },
    buffers: { corners: spec.corners.buffer, edges: spec.edges.buffer },
    swaps: { corners: spec.corners.swap.alg, edges: spec.edges.swap.alg },
    symmetry: spec.symmetry,
    records: [{ id: "parity", kind: "parity", intendedEffect: { stickerCycles: stickerCycles(puzzle, effect.value), sideEffectPieces: [] }, algs: [entry] }],
  });
}

export function verifyOpParityDataset(puzzle: Puzzle, parity: OpParityDataset, corners: OpSetupsDataset, edges: OpSetupsDataset): OpDatasetProblem[] {
  const problems: OpDatasetProblem[] = [];
  if (corners.pieceType !== "corners" || edges.pieceType !== "edges") problems.push({ code: "parity-mismatch", field: "pieceType" });
  if (parity.buffers.corners !== corners.buffer || parity.buffers.edges !== edges.buffer) problems.push({ code: "parity-mismatch", field: "buffers" });
  if (parity.swaps.corners !== corners.swap.alg || parity.swaps.edges !== edges.swap.alg) problems.push({ code: "parity-mismatch", field: "swaps" });
  const effect = opParityEffect(puzzle, corners, edges);
  if (!effect.ok) return [...problems, effect.error];

  const [record] = parity.records;
  if (JSON.stringify(record.intendedEffect.stickerCycles) !== JSON.stringify(stickerCycles(puzzle, effect.value))) problems.push({ code: "wrong-intended-effect", record: record.id });
  if (record.intendedEffect.sideEffectPieces.length > 0) problems.push({ code: "side-effects-not-allowed", record: record.id });

  const isIdentity = parity.symmetry === identitySymmetry(puzzle);
  const main = record.algs[0];
  const expectedMain = relabelled(puzzle, parity.symmetry, REFERENCE_OP_PARITY.alg);
  if (main === undefined || formatMoves(movesOf(puzzle, main.alg) ?? []) !== expectedMain || main.source !== (isIdentity ? "reference" : "symmetry")) {
    problems.push({ code: "parity-not-reference" });
  }
  if (main !== undefined && main.citation !== REFERENCE_OP_PARITY.source) problems.push({ code: "citation-mismatch", record: record.id });
  const entryProblems: DatasetProblem[] = [];
  const seen = new Set<string>();
  for (const entry of record.algs) {
    checkAlgEntry(puzzle, record.id, entry, effect.value, entryProblems);
    if (seen.has(entry.moves)) entryProblems.push({ code: "duplicate-alg", record: record.id, alg: entry.alg });
    seen.add(entry.moves);
  }
  return [...problems, ...entryProblems];
}
