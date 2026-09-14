import * as z from "zod";
import { at } from "../core/arrays.js";
import { composePerms, type StickerPerm } from "../core/move-table.js";
import type { Puzzle } from "../core/puzzle.js";
import { err, ok, type Result } from "../core/result.js";
import type { CommCatalogue } from "../commutator/catalogue.js";
import { formatMoves } from "../commutator/expand.js";
import { temptingSetups } from "../methods/illegal-setup.js";
import { M2_SPECIAL_BOUNDS, searchSliceComposites } from "../methods/m2-search.js";
import { DEFAULT_SETUP_POOLS, searchSetups, type SetupTable } from "../methods/setup-search.js";
import { analyseSwap, m2Swaps, REFERENCE_SWAPS, sideEffectPerm, targetEffect, type SwapAlg } from "../methods/swap-algs.js";
import { stickerName } from "../pieces/names.js";
import { pieceType } from "../pieces/piece-types.js";
import { ENGINE_VERSION } from "../version.js";
import {
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
import { datasetSwap, identitySymmetry, movesOf, OpSwapSchema, relabelled, targetAlg, type OpDatasetProblem, type OpSetupsDataset } from "./op-dataset.js";

/**
 * M2 datasets (DECISIONS D-025): the setup table for one M-slice buffer, its special cases, the
 * odd/even rule, and the M2/OP parity alg.
 *
 * Every step of M2 repeats the swap's side effect X (the other two M-slice edges swapped, centres
 * swapped). A target on one of X's edges can't be set up; its record holds algs for E·X, found as a
 * comm next to M2 (`searchSliceComposites`). On an odd step the cube carries X, so a target t needs
 * X·E_t instead, which is exactly another record's effect: the odd/even rule is read off the records
 * by simulation, never written in.
 */

const Family = z.string().min(1);
const Symmetry = z.number().int().min(0).max(47);
const Bounds = z.object({ generators: z.array(Family).min(1), maxInsertion: z.number().int(), maxSetup: z.number().int() });
const envelope = {
  format: z.literal("bld-platform/alg-dataset"),
  version: z.literal(1),
  id: z.string().min(1),
  puzzle: z.literal("3x3x3"),
  /** The engine, and the comm-search bounds the special algs (and parity algs) were searched with. */
  generatedBy: z.object({ engine: z.string().min(1), bounds: Bounds }),
};

export const M2RecordSchema = z.discriminatedUnion("kind", [
  z.object({ id: z.string().min(1), kind: z.literal("target"), target: StickerName, setup: z.string(), intendedEffect: IntendedEffectSchema, algs: z.array(AlgEntrySchema).min(1).max(4) }),
  z.object({ id: z.string().min(1), kind: z.literal("special"), target: StickerName, intendedEffect: IntendedEffectSchema, algs: z.array(AlgEntrySchema).min(1).max(4) }),
]);

export const M2DatasetSchema = z.object({
  ...envelope,
  method: z.literal("m2"),
  pieceType: z.literal("edges"),
  /** Buffer sticker. */
  buffer: StickerName,
  kind: z.literal("setups"),
  swap: OpSwapSchema,
  setupFamilies: z.array(Family).min(1),
  regime: z.literal("net"),
  /** Targets no setup reaches: the stickers of the swap's side-effect edges. */
  specialTargets: z.array(StickerName),
  /** On an odd step (the second target of a pair), shoot `target` with the record of `shootAs`. Targets not listed keep their own record. */
  oddStepRule: z.array(z.object({ target: StickerName, shootAs: StickerName })),
  /** Shorter setups that ignore the protected pieces, and what they break. */
  tempting: z.array(z.object({ target: StickerName, setup: z.string().min(1), damagedPieces: z.array(PieceName).min(1) })),
  records: z.array(M2RecordSchema),
});

export const M2OpParityDatasetSchema = z.object({
  ...envelope,
  method: z.literal("m2-op"),
  kind: z.literal("parity"),
  buffers: z.object({ corners: StickerName, edges: StickerName }),
  swaps: z.object({ corners: z.string().min(1), edges: z.string().min(1) }),
  symmetry: Symmetry,
  records: z.tuple([z.object({ id: z.literal("parity"), kind: z.literal("parity"), intendedEffect: IntendedEffectSchema, algs: z.array(AlgEntrySchema).min(1).max(4) })]),
});

export type M2Dataset = z.infer<typeof M2DatasetSchema>;
export type M2Record = z.infer<typeof M2RecordSchema>;
export type M2OpParityDataset = z.infer<typeof M2OpParityDatasetSchema>;

export type M2DatasetProblem =
  | OpDatasetProblem
  | { readonly code: "special-targets-mismatch" }
  | { readonly code: "bounds-mismatch" }
  | { readonly code: "alg-outside-bounds"; readonly record: string; readonly alg: string }
  | { readonly code: "odd-step-rule-mismatch"; readonly expected: string }
  | { readonly code: "tempting-mismatch" };

/** Algs for a special effect: searched, or given (relabelled from another system, then verified). */
export type SpecialAlgs = { readonly kind: "search"; readonly catalogue: CommCatalogue } | { readonly kind: "given"; readonly algs: ReadonlyMap<string, readonly string[]> };

export interface M2Spec {
  readonly id: string;
  /** An M2 swap (`m2Swaps`). */
  readonly swap: SwapAlg;
  readonly bufferSticker: string;
  readonly symmetry: number;
  readonly specials: SpecialAlgs;
}

export type M2BuildError =
  | { readonly code: "setup-search-failed"; readonly detail: string }
  | { readonly code: "no-special-alg"; readonly target: string; readonly detail: string };

function effectOf(puzzle: Puzzle, swap: SwapAlg, buffer: string, target: string): StickerPerm {
  const effect = targetEffect(puzzle, swap, buffer, target, { onSideEffectPiece: "compose" });
  if (!effect.ok) throw new Error(`${target}: ${JSON.stringify(effect.error)}`);
  return effect.value;
}

const samePerm = (a: ArrayLike<number>, b: ArrayLike<number>) => a.length === b.length && Array.from(a).every((x, i) => x === b[i]);

/**
 * The odd/even rule, by simulation. A step shooting t on an even step must do E_t·X (its record's
 * effect); on an odd step the cube carries X, so it must do X·E_t = X·effect_t·X. The rule names the
 * record whose effect that is, whenever it isn't t's own.
 */
export function deriveOddStepRule(puzzle: Puzzle, swap: SwapAlg, buffer: string, targets: readonly string[]): Result<{ target: string; shootAs: string }[], { readonly target: string }> {
  const x = sideEffectPerm(puzzle, swap);
  const effects = targets.map((t) => ({ target: t, effect: effectOf(puzzle, swap, buffer, t) }));
  const rule: { target: string; shootAs: string }[] = [];
  for (const { target, effect } of effects) {
    const odd = composePerms(composePerms(x, effect), x);
    const matches = effects.filter((e) => samePerm(e.effect, odd));
    const match = matches[0];
    if (matches.length !== 1 || match === undefined) return err({ target });
    if (match.target !== target) rule.push({ target, shootAs: match.target });
  }
  return ok(rule);
}

function tables(puzzle: Puzzle, swap: SwapAlg, bufferSticker: string): Result<SetupTable, M2BuildError> {
  const legal = searchSetups(puzzle, { swap, bufferSticker, ...DEFAULT_SETUP_POOLS.m2 });
  return legal.ok ? legal : err({ code: "setup-search-failed", detail: JSON.stringify(legal.error) });
}

export function buildM2Dataset(puzzle: Puzzle, spec: M2Spec): Result<M2Dataset, M2BuildError> {
  const { swap, bufferSticker } = spec;
  const legal = tables(puzzle, swap, bufferSticker);
  if (!legal.ok) return legal;
  const swapText = formatMoves(swap.moves);
  const reference = REFERENCE_SWAPS.m2;

  const records: M2Record[] = [];
  for (const { target, setup } of legal.value.targets) {
    const effect = effectOf(puzzle, swap, bufferSticker, target);
    const intendedEffect = { stickerCycles: stickerCycles(puzzle, effect), sideEffectPieces: [...swap.sideEffectPieces] };
    if (setup !== undefined) {
      const setupText = formatMoves(setup);
      records.push({ id: target, kind: "target", target, setup: setupText, intendedEffect, algs: [entryForAlg(puzzle, targetAlg(setupText, swapText), "engine-search")] });
      continue;
    }
    let algs: string[];
    if (spec.specials.kind === "search") {
      const found = searchSliceComposites(puzzle, spec.specials.catalogue, { swap, required: effect });
      if (!found.ok) return err({ code: "no-special-alg", target, detail: JSON.stringify(found.error) });
      algs = found.value.map((c) => formatMoves(c.moves));
    } else {
      algs = [...(spec.specials.algs.get(target) ?? [])];
      if (algs.length === 0) return err({ code: "no-special-alg", target, detail: "none given" });
    }
    records.push({ id: target, kind: "special", target, intendedEffect, algs: algs.map((alg) => entryForAlg(puzzle, alg, "engine-search")) });
  }

  const rule = deriveOddStepRule(puzzle, swap, bufferSticker, records.map((r) => r.target));
  if (!rule.ok) return err({ code: "no-special-alg", target: rule.error.target, detail: "no record for its odd-step effect" });
  const swapEntry = entryForAlg(puzzle, swapText, spec.symmetry === identitySymmetry(puzzle) ? "reference" : "symmetry", reference.source);

  return ok({
    format: "bld-platform/alg-dataset",
    version: 1,
    id: spec.id,
    puzzle: "3x3x3",
    generatedBy: { engine: ENGINE_VERSION, bounds: { generators: [...M2_SPECIAL_BOUNDS.generators], maxInsertion: M2_SPECIAL_BOUNDS.maxInsertion, maxSetup: M2_SPECIAL_BOUNDS.maxSetup } },
    method: "m2",
    pieceType: "edges",
    buffer: bufferSticker,
    kind: "setups",
    swap: {
      alg: swapEntry.alg,
      moves: swapEntry.moves,
      etm: swapEntry.etm,
      qtm: swapEntry.qtm,
      htm: swapEntry.htm,
      stm: swapEntry.stm,
      source: swapEntry.source === "reference" ? "reference" : "symmetry",
      citation: reference.source,
      symmetry: spec.symmetry,
      swapSticker: legal.value.swapSticker,
      sideEffectPieces: [...swap.sideEffectPieces],
    },
    setupFamilies: [...DEFAULT_SETUP_POOLS.m2.pool],
    regime: "net",
    specialTargets: [...legal.value.unreachable],
    oddStepRule: rule.value,
    tempting: temptingSetups(puzzle, { swap, bufferSticker, legal: legal.value }).map((t) => ({ target: t.target, setup: formatMoves(t.setup), damagedPieces: [...t.damagedPieces] })),
    records,
  });
}

/** The M2 swap a dataset states: an M2 variant for its buffer, relabelled from the reference by the stated symmetry. */
export function m2DatasetSwap(puzzle: Puzzle, dataset: M2Dataset): Result<SwapAlg, M2DatasetProblem> {
  const type = pieceType(puzzle, "edges");
  const buffer = type.stickerByName(dataset.buffer);
  if (buffer === undefined) return err({ code: "unknown-buffer", buffer: dataset.buffer });
  const bufferPiece = at(type.pieces, buffer.position).name;
  const swaps = m2Swaps(puzzle);
  if (!swaps.ok) return err({ code: "invalid-swap", detail: JSON.stringify(swaps.error) });
  const text = formatMoves(movesOf(puzzle, dataset.swap.alg) ?? []);
  const swap = swaps.value.find((s) => s.bufferPiece === bufferPiece && formatMoves(s.moves) === text);
  if (swap === undefined || relabelled(puzzle, dataset.swap.symmetry, REFERENCE_SWAPS.m2.alg) !== text) return err({ code: "swap-not-symmetry-image" });
  return ok(swap);
}

export function verifyM2Dataset(puzzle: Puzzle, dataset: M2Dataset): M2DatasetProblem[] {
  const problems: M2DatasetProblem[] = [];
  const entryProblems: DatasetProblem[] = [];
  const swapResult = m2DatasetSwap(puzzle, dataset);
  if (!swapResult.ok) return [swapResult.error];
  const swap = swapResult.value;

  // The swap.
  const stated = dataset.swap;
  if ((stated.source === "reference") !== (stated.symmetry === identitySymmetry(puzzle))) problems.push({ code: "swap-not-reference" });
  if (stated.citation !== REFERENCE_SWAPS.m2.source) problems.push({ code: "citation-mismatch", record: "swap" });
  checkAlgEntry(puzzle, "swap", { alg: stated.alg, moves: stated.moves, etm: stated.etm, qtm: stated.qtm, htm: stated.htm, stm: stated.stm, source: "engine-search" }, swap.perm, entryProblems);
  const shape = analyseSwap(puzzle, "m2", swap.perm, swap.bufferPiece);
  if (!shape.ok) problems.push({ code: "invalid-swap", detail: JSON.stringify(shape.error) });
  const bufferIndex = pieceType(puzzle, "edges").stickerByName(dataset.buffer)?.index ?? -1;
  if (stickerName(puzzle.geometry, at(swap.perm, bufferIndex)) !== stated.swapSticker) problems.push({ code: "swap-mismatch", field: "swapSticker" });
  if (JSON.stringify(stated.sideEffectPieces) !== JSON.stringify(swap.sideEffectPieces)) problems.push({ code: "swap-mismatch", field: "sideEffectPieces" });

  // Bounds and tables.
  const bounds = dataset.generatedBy.bounds;
  if (JSON.stringify(bounds) !== JSON.stringify({ generators: M2_SPECIAL_BOUNDS.generators, maxInsertion: M2_SPECIAL_BOUNDS.maxInsertion, maxSetup: M2_SPECIAL_BOUNDS.maxSetup })) {
    problems.push({ code: "bounds-mismatch" });
  }
  if (JSON.stringify(dataset.setupFamilies) !== JSON.stringify(DEFAULT_SETUP_POOLS.m2.pool)) problems.push({ code: "setup-families-invalid", detail: "setupFamilies" });
  const legal = tables(puzzle, swap, dataset.buffer);
  if (!legal.ok) return [...problems, { code: "setup-families-invalid", detail: JSON.stringify(legal.error) }];
  if (JSON.stringify(dataset.specialTargets) !== JSON.stringify(legal.value.unreachable)) problems.push({ code: "special-targets-mismatch" });

  // Records.
  const swapText = formatMoves(swap.moves);
  for (const record of dataset.records) {
    if (record.id !== record.target) problems.push({ code: "wrong-id", record: record.id, expected: record.target });
    const legalSetup = legal.value.targets.find((t) => t.target === record.target);
    if (legalSetup === undefined) continue;
    const effect = targetEffect(puzzle, swap, dataset.buffer, record.target, { onSideEffectPiece: "compose" });
    if (!effect.ok) {
      problems.push({ code: "invalid-case", record: record.id, detail: JSON.stringify(effect.error) });
      continue;
    }
    if (JSON.stringify(record.intendedEffect.stickerCycles) !== JSON.stringify(stickerCycles(puzzle, effect.value))) problems.push({ code: "wrong-intended-effect", record: record.id });
    if (JSON.stringify(record.intendedEffect.sideEffectPieces) !== JSON.stringify(swap.sideEffectPieces)) problems.push({ code: "wrong-intended-effect", record: record.id });

    if (record.kind === "target") {
      if (legalSetup.setup === undefined) {
        problems.push({ code: "kind-mismatch", record: record.id });
      } else {
        const expectedSetup = formatMoves(legalSetup.setup);
        if (record.setup !== expectedSetup) problems.push({ code: "setup-mismatch", record: record.id, expected: expectedSetup });
        const expectedMain = entryForAlg(puzzle, targetAlg(record.setup, swapText), "engine-search").alg;
        if (record.algs[0]?.alg !== expectedMain) problems.push({ code: "main-alg-mismatch", record: record.id, expected: expectedMain });
      }
    } else {
      if (legalSetup.setup !== undefined) problems.push({ code: "kind-mismatch", record: record.id });
      for (const entry of record.algs) {
        if (!(movesOf(puzzle, entry.alg) ?? []).every((m) => bounds.generators.includes(m.family))) problems.push({ code: "alg-outside-bounds", record: record.id, alg: entry.alg });
      }
    }
    const seen = new Set<string>();
    for (const entry of record.algs) {
      checkAlgEntry(puzzle, record.id, entry, effect.value, entryProblems);
      if (seen.has(entry.moves)) entryProblems.push({ code: "duplicate-alg", record: record.id, alg: entry.alg });
      seen.add(entry.moves);
    }
  }
  const expectedIds = legal.value.targets.map((t) => t.target);
  const present = dataset.records.map((r) => r.id);
  for (const id of expectedIds) if (!present.includes(id)) problems.push({ code: "missing-record", record: id });
  for (const id of present) if (!expectedIds.includes(id)) problems.push({ code: "unexpected-record", record: id });
  const inOrder = present.filter((id) => expectedIds.includes(id));
  if (JSON.stringify(inOrder) !== JSON.stringify(expectedIds.filter((id) => present.includes(id)))) problems.push({ code: "records-out-of-order" });

  // The odd/even rule and the tempting setups, derived again.
  const rule = deriveOddStepRule(puzzle, swap, dataset.buffer, expectedIds);
  const expectedRule = rule.ok ? JSON.stringify(rule.value) : `no record for ${rule.error.target}`;
  if (JSON.stringify(dataset.oddStepRule) !== expectedRule) problems.push({ code: "odd-step-rule-mismatch", expected: expectedRule });
  const tempting = temptingSetups(puzzle, { swap, bufferSticker: dataset.buffer, legal: legal.value }).map((t) => ({ target: t.target, setup: formatMoves(t.setup), damagedPieces: [...t.damagedPieces] }));
  if (JSON.stringify(dataset.tempting) !== JSON.stringify(tempting)) problems.push({ code: "tempting-mismatch" });

  return [...problems, ...entryProblems];
}

/** The M2/OP parity effect: the OP corner swap's side effect together with M2's. */
export function m2OpParityEffect(puzzle: Puzzle, corners: OpSetupsDataset, edges: M2Dataset): Result<StickerPerm, M2DatasetProblem> {
  const cornerSwap = datasetSwap(puzzle, corners);
  if (!cornerSwap.ok) return cornerSwap;
  const edgeSwap = m2DatasetSwap(puzzle, edges);
  if (!edgeSwap.ok) return edgeSwap;
  return ok(composePerms(sideEffectPerm(puzzle, cornerSwap.value), sideEffectPerm(puzzle, edgeSwap.value)));
}

export interface M2OpParitySpec {
  readonly id: string;
  readonly corners: OpSetupsDataset;
  readonly edges: M2Dataset;
  readonly symmetry: number;
  readonly algs: SpecialAlgs;
}

export function buildM2OpParityDataset(puzzle: Puzzle, spec: M2OpParitySpec): Result<M2OpParityDataset, M2DatasetProblem | M2BuildError> {
  const effect = m2OpParityEffect(puzzle, spec.corners, spec.edges);
  if (!effect.ok) return effect;
  let algs: string[];
  if (spec.algs.kind === "search") {
    const m2 = m2DatasetSwap(puzzle, spec.edges);
    if (!m2.ok) return m2;
    const found = searchSliceComposites(puzzle, spec.algs.catalogue, { swap: m2.value, required: effect.value });
    if (!found.ok) return err({ code: "no-special-alg", target: "parity", detail: JSON.stringify(found.error) });
    algs = found.value.map((c) => formatMoves(c.moves));
  } else {
    algs = [...(spec.algs.algs.get("parity") ?? [])];
    if (algs.length === 0) return err({ code: "no-special-alg", target: "parity", detail: "none given" });
  }
  const entries: AlgEntry[] = algs.map((alg) => entryForAlg(puzzle, alg, "engine-search"));
  return ok({
    format: "bld-platform/alg-dataset",
    version: 1,
    id: spec.id,
    puzzle: "3x3x3",
    generatedBy: spec.edges.generatedBy,
    method: "m2-op",
    kind: "parity",
    buffers: { corners: spec.corners.buffer, edges: spec.edges.buffer },
    swaps: { corners: spec.corners.swap.alg, edges: spec.edges.swap.alg },
    symmetry: spec.symmetry,
    records: [{ id: "parity", kind: "parity", intendedEffect: { stickerCycles: stickerCycles(puzzle, effect.value), sideEffectPieces: [] }, algs: entries }],
  });
}

export function verifyM2OpParityDataset(puzzle: Puzzle, parity: M2OpParityDataset, corners: OpSetupsDataset, edges: M2Dataset): M2DatasetProblem[] {
  const problems: M2DatasetProblem[] = [];
  if (corners.pieceType !== "corners") problems.push({ code: "parity-mismatch", field: "pieceType" });
  if (parity.buffers.corners !== corners.buffer || parity.buffers.edges !== edges.buffer) problems.push({ code: "parity-mismatch", field: "buffers" });
  if (parity.swaps.corners !== corners.swap.alg || parity.swaps.edges !== edges.swap.alg) problems.push({ code: "parity-mismatch", field: "swaps" });
  if (parity.symmetry !== corners.swap.symmetry || parity.symmetry !== edges.swap.symmetry) problems.push({ code: "parity-mismatch", field: "symmetry" });
  if (JSON.stringify(parity.generatedBy.bounds) !== JSON.stringify(edges.generatedBy.bounds)) problems.push({ code: "bounds-mismatch" });
  const effect = m2OpParityEffect(puzzle, corners, edges);
  if (!effect.ok) return [...problems, effect.error];

  const [record] = parity.records;
  if (JSON.stringify(record.intendedEffect.stickerCycles) !== JSON.stringify(stickerCycles(puzzle, effect.value))) problems.push({ code: "wrong-intended-effect", record: record.id });
  if (record.intendedEffect.sideEffectPieces.length > 0) problems.push({ code: "side-effects-not-allowed", record: record.id });
  const entryProblems: DatasetProblem[] = [];
  const seen = new Set<string>();
  for (const entry of record.algs) {
    if (!(movesOf(puzzle, entry.alg) ?? []).every((m) => parity.generatedBy.bounds.generators.includes(m.family))) problems.push({ code: "alg-outside-bounds", record: record.id, alg: entry.alg });
    checkAlgEntry(puzzle, record.id, entry, effect.value, entryProblems);
    if (seen.has(entry.moves)) entryProblems.push({ code: "duplicate-alg", record: record.id, alg: entry.alg });
    seen.add(entry.moves);
  }
  return [...problems, ...entryProblems];
}
