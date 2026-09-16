import { z } from "../core/zod.js";
import { at } from "../core/arrays.js";
import { composePerms, type StickerPerm } from "../core/move-table.js";
import type { Puzzle } from "../core/puzzle.js";
import { err, ok, type Result } from "../core/result.js";
import type { CommCatalogue } from "../commutator/catalogue.js";
import { formatMoves } from "../commutator/expand.js";
import { temptingSetups } from "../methods/illegal-setup.js";
import { SPECIAL_BOUNDS, searchSliceComposites } from "../methods/m2-search.js";
import { DEFAULT_SETUP_POOLS, searchSetups, type SetupTable, type TargetSetup } from "../methods/setup-search.js";
import { analyseSwap, m2Swaps, REFERENCE_SWAPS, sideEffectPerm, swapVariants, targetEffect, type SwapAlg } from "../methods/swap-algs.js";
import { pieceName, stickerName } from "../pieces/names.js";
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
 * Swap-method datasets (DECISIONS D-025, D-038): the setup table for one buffer, its special cases, the
 * odd/even rule, and the M2/OP parity alg. Three methods share this shape:
 *
 * | Method | Puzzle | Pieces | Swap |
 * |---|---|---|---|
 * | `m2` | 3x3x3 | edges | `M2` |
 * | `r2` | 4x4x4 | wings | `2R2` (written `r2` in the sources; D-006) |
 * | `u2` | 4x4x4 | x-centres | `U2` |
 *
 * Every step repeats the swap's side effect X: for M2 the other two M-slice edges and the centres, for r2
 * the other pair of r-slice wings and eight x-centres, for U2 the rest of the U layer. A target on one of
 * X's own pieces can't be set up; its record holds algs for E·X, found as a comm next to the swap
 * (`searchSliceComposites`). On an odd step the cube carries X, so a target t needs X·E_t instead, which
 * is exactly another record's effect: the odd/even rule is read off the records by simulation, never
 * written in.
 */

const Family = z.string().min(1);
const Symmetry = z.number().int().min(0).max(47);
const Bounds = z.object({ generators: z.array(Family).min(1), maxInsertion: z.number().int(), maxSetup: z.number().int() });
const envelope = {
  format: z.literal("bld-platform/alg-dataset"),
  version: z.literal(1),
  id: z.string().min(1),
  puzzle: z.enum(["3x3x3", "4x4x4"]),
  /** The engine, and the comm-search bounds the special algs (and parity algs) were searched with. */
  generatedBy: z.object({ engine: z.string().min(1), bounds: Bounds }),
};

export const SwapRecordSchema = z.discriminatedUnion("kind", [
  z.object({ id: z.string().min(1), kind: z.literal("target"), target: StickerName, setup: z.string(), intendedEffect: IntendedEffectSchema, algs: z.array(AlgEntrySchema).min(1).max(4) }),
  z.object({ id: z.string().min(1), kind: z.literal("special"), target: StickerName, intendedEffect: IntendedEffectSchema, algs: z.array(AlgEntrySchema).min(1).max(4) }),
]);

export const SwapDatasetSchema = z.object({
  ...envelope,
  method: z.enum(["m2", "r2", "u2"]),
  pieceType: z.enum(["edges", "wings", "xcenters"]),
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
  records: z.array(SwapRecordSchema),
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

export type SwapDataset = z.infer<typeof SwapDatasetSchema>;

/**
 * The parity alg for one swap method, for an odd number of targets (D-039). Every step repeats the swap's
 * side effect X; after an odd number of them the cube still carries it, and this alg takes it off.
 *
 * On 4x4 the alg only has to leave every slot showing the right colour: four x-centres of a face are the
 * same piece as far as a solver is concerned, so an alg that swaps two of them has done nothing visible.
 */
export const SwapParityDatasetSchema = z.object({
  ...envelope,
  method: z.enum(["r2", "u2"]),
  kind: z.literal("swap-parity"),
  /** The buffer sticker of the setups dataset this belongs with, and its swap. */
  buffer: StickerName,
  swap: z.string().min(1),
  records: z.tuple([z.object({ id: z.literal("parity"), kind: z.literal("parity"), intendedEffect: IntendedEffectSchema, algs: z.array(AlgEntrySchema).min(1).max(4) })]),
});

export type SwapParityDataset = z.infer<typeof SwapParityDatasetSchema>;

export interface SwapParitySpec {
  readonly id: string;
  readonly dataset: SwapDataset;
  /** Algs for the leftover, with the source they come from. */
  readonly algs: readonly string[];
  readonly citation: string;
}

/** What a swap method's parity alg has to undo: the swap's side effect, left over after an odd count. */
export function swapParityEffect(puzzle: Puzzle, dataset: SwapDataset): Result<StickerPerm, SwapDatasetProblem> {
  const swap = datasetSwapAlg(puzzle, dataset);
  if (!swap.ok) return swap;
  return ok(sideEffectPerm(puzzle, swap.value));
}

export function buildSwapParityDataset(puzzle: Puzzle, spec: SwapParitySpec): Result<SwapParityDataset, SwapDatasetProblem> {
  const effect = swapParityEffect(puzzle, spec.dataset);
  if (!effect.ok) return effect;
  if (spec.dataset.method === "m2") return err({ code: "parity-mismatch", field: "method" });
  return ok({
    format: "bld-platform/alg-dataset",
    version: 1,
    id: spec.id,
    puzzle: spec.dataset.puzzle,
    method: spec.dataset.method,
    kind: "swap-parity",
    generatedBy: spec.dataset.generatedBy,
    buffer: spec.dataset.buffer,
    swap: spec.dataset.swap.alg,
    records: [
      {
        id: "parity",
        kind: "parity",
        intendedEffect: { stickerCycles: stickerCycles(puzzle, effect.value), sideEffectPieces: [] },
        algs: spec.algs.map((alg) => entryForAlg(puzzle, alg, "reference", spec.citation)),
      },
    ],
  });
}

export function verifySwapParityDataset(puzzle: Puzzle, parity: SwapParityDataset, dataset: SwapDataset): SwapDatasetProblem[] {
  const problems: SwapDatasetProblem[] = [];
  if (parity.method !== dataset.method) problems.push({ code: "parity-mismatch", field: "method" });
  if (parity.buffer !== dataset.buffer) problems.push({ code: "parity-mismatch", field: "buffer" });
  if (parity.swap !== dataset.swap.alg) problems.push({ code: "parity-mismatch", field: "swap" });
  const effect = swapParityEffect(puzzle, dataset);
  if (!effect.ok) return [...problems, effect.error];

  const [record] = parity.records;
  if (JSON.stringify(record.intendedEffect.stickerCycles) !== JSON.stringify(stickerCycles(puzzle, effect.value))) problems.push({ code: "wrong-intended-effect", record: record.id });
  if (record.intendedEffect.sideEffectPieces.length > 0) problems.push({ code: "side-effects-not-allowed", record: record.id });
  const entryProblems: DatasetProblem[] = [];
  const seen = new Set<string>();
  for (const entry of record.algs) {
    // By colour: a parity alg may leave the x-centres of a face rearranged among themselves.
    checkAlgEntry(puzzle, record.id, entry, effect.value, entryProblems, "colours");
    if (seen.has(entry.moves)) entryProblems.push({ code: "duplicate-alg", record: record.id, alg: entry.alg });
    seen.add(entry.moves);
  }
  return [...problems, ...entryProblems];
}

export type SwapRecord = z.infer<typeof SwapRecordSchema>;
export type M2OpParityDataset = z.infer<typeof M2OpParityDatasetSchema>;

export type SwapDatasetProblem =
  | OpDatasetProblem
  | { readonly code: "special-targets-mismatch" }
  | { readonly code: "bounds-mismatch" }
  | { readonly code: "alg-outside-bounds"; readonly record: string; readonly alg: string }
  | { readonly code: "odd-step-rule-mismatch"; readonly expected: string }
  | { readonly code: "tempting-mismatch" };

/**
 * Algs for a special effect: searched, or given. Given algs come from a source (or another system) and
 * are verified here like everything else; with a `citation` they are recorded as reference algs.
 */
export type SpecialAlgs =
  | { readonly kind: "search"; readonly catalogue: CommCatalogue }
  | { readonly kind: "given"; readonly algs: ReadonlyMap<string, readonly string[]>; readonly citation?: string };

export interface SwapSpec {
  readonly id: string;
  /** The method's swap: `m2Swaps` for M2, the reference swap (or a symmetry image) for r2 and U2. */
  readonly swap: SwapAlg;
  /**
   * The buffer's own sticker: the one the swap sends to the helper slot. For wings that has to be the
   * lettered sticker of the buffer wing, because only the stickers of its handedness can reach the slot.
   */
  readonly bufferSticker: string;
  readonly symmetry: number;
  readonly specials: SpecialAlgs;
}

export type SwapBuildError =
  | { readonly code: "setup-search-failed"; readonly detail: string }
  | { readonly code: "no-special-alg"; readonly target: string; readonly detail: string };

function effectOf(puzzle: Puzzle, swap: SwapAlg, buffer: string, target: string): StickerPerm {
  const effect = targetEffect(puzzle, swap, buffer, target, { onSideEffectPiece: "compose" });
  if (!effect.ok) throw new Error(`${target}: ${JSON.stringify(effect.error)}`);
  return effect.value;
}

/**
 * The stickers a method can actually shoot to.
 *
 * A wing can't be flipped in its slot, so of a wing's two stickers only one can stand for "this piece
 * swaps with the buffer": naming the other one describes a state the cube can't reach, and the exchange
 * then drags other pieces with it. Those stickers are dropped here, which leaves exactly one target per
 * wing. Edges and corners keep every sticker (shooting UF and FU are different cases), and x-centres have
 * one sticker each anyway.
 *
 * Which sticker survives isn't a convention: it's the one whose exchange moves only the buffer's piece,
 * the target's piece, and the pieces the swap already carries.
 */
function shootableTargets(puzzle: Puzzle, swap: SwapAlg, bufferSticker: string, targets: readonly TargetSetup[]): TargetSetup[] {
  const { geometry } = puzzle;
  const pieceOf = (name: string) => {
    const index = geometry.stickers.findIndex((s) => stickerName(geometry, s.index) === name);
    return pieceName(geometry.size, geometry.sticker(index).cubie);
  };
  const bufferPiece = pieceOf(bufferSticker);
  return targets.filter(({ target }) => {
    const effect = targetEffect(puzzle, swap, bufferSticker, target, { onSideEffectPiece: "compose" });
    if (!effect.ok) return false;
    const allowed = new Set([bufferPiece, pieceOf(target), ...swap.sideEffectPieces]);
    return stickerCycles(puzzle, effect.value).every((cycle) => cycle.every((name) => allowed.has(pieceOf(name))));
  });
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

/** The method a dataset is for, as the swap method name. */
type SwapDatasetMethod = SwapDataset["method"];

function tables(puzzle: Puzzle, swap: SwapAlg, bufferSticker: string): Result<SetupTable, SwapBuildError> {
  const legal = searchSetups(puzzle, { swap, bufferSticker, ...DEFAULT_SETUP_POOLS[swap.method as SwapDatasetMethod] });
  return legal.ok ? legal : err({ code: "setup-search-failed", detail: JSON.stringify(legal.error) });
}

export function buildSwapDataset(puzzle: Puzzle, spec: SwapSpec): Result<SwapDataset, SwapBuildError> {
  const { swap, bufferSticker } = spec;
  const method = swap.method as SwapDatasetMethod;
  const legal = tables(puzzle, swap, bufferSticker);
  if (!legal.ok) return legal;
  const swapText = formatMoves(swap.moves);
  const reference = REFERENCE_SWAPS[method];
  const bounds = SPECIAL_BOUNDS[method];

  const records: SwapRecord[] = [];
  const shootable = shootableTargets(puzzle, swap, bufferSticker, legal.value.targets);
  for (const { target, setup } of shootable) {
    const effect = effectOf(puzzle, swap, bufferSticker, target);
    const intendedEffect = { stickerCycles: stickerCycles(puzzle, effect), sideEffectPieces: [...swap.sideEffectPieces] };
    if (setup !== undefined) {
      const setupText = formatMoves(setup);
      records.push({ id: target, kind: "target", target, setup: setupText, intendedEffect, algs: [entryForAlg(puzzle, targetAlg(setupText, swapText), "engine-search")] });
      continue;
    }
    let entries: AlgEntry[];
    if (spec.specials.kind === "search") {
      const found = searchSliceComposites(puzzle, spec.specials.catalogue, { swap, required: effect });
      if (!found.ok) return err({ code: "no-special-alg", target, detail: JSON.stringify(found.error) });
      entries = found.value.map((c) => entryForAlg(puzzle, formatMoves(c.moves), "engine-search"));
    } else {
      const given = [...(spec.specials.algs.get(target) ?? [])];
      if (given.length === 0) return err({ code: "no-special-alg", target, detail: "none given" });
      const { citation } = spec.specials;
      entries = given.map((alg) => (citation === undefined ? entryForAlg(puzzle, alg, "engine-search") : entryForAlg(puzzle, alg, "reference", citation)));
    }
    records.push({ id: target, kind: "special", target, intendedEffect, algs: entries });
  }

  const rule = deriveOddStepRule(puzzle, swap, bufferSticker, records.map((r) => r.target));
  if (!rule.ok) return err({ code: "no-special-alg", target: rule.error.target, detail: "no record for its odd-step effect" });
  const swapEntry = entryForAlg(puzzle, swapText, spec.symmetry === identitySymmetry(puzzle) ? "reference" : "symmetry", reference.source);

  return ok({
    format: "bld-platform/alg-dataset",
    version: 1,
    id: spec.id,
    puzzle: reference.puzzle,
    method,
    pieceType: reference.pieceType === "corners" ? "edges" : reference.pieceType,
    buffer: bufferSticker,
    kind: "setups",
    generatedBy: { engine: ENGINE_VERSION, bounds: { generators: [...bounds.generators], maxInsertion: bounds.maxInsertion, maxSetup: bounds.maxSetup } },
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
    setupFamilies: [...DEFAULT_SETUP_POOLS[method].pool],
    regime: "net",
    specialTargets: shootable.filter((t) => t.setup === undefined).map((t) => t.target),
    oddStepRule: rule.value,
    tempting: temptingSetups(puzzle, { swap, bufferSticker, legal: legal.value }).map((t) => ({ target: t.target, setup: formatMoves(t.setup), damagedPieces: [...t.damagedPieces] })),
    records,
  });
}

/**
 * The swap a dataset states: a variant of its method's reference swap for its buffer, relabelled by the
 * stated symmetry. M2 only counts variants that are still M-slice turns (`m2Swaps`); r2 and U2 take any
 * symmetry image of their reference.
 */
export function datasetSwapAlg(puzzle: Puzzle, dataset: SwapDataset): Result<SwapAlg, SwapDatasetProblem> {
  const type = pieceType(puzzle, dataset.pieceType);
  const buffer = type.stickerByName(dataset.buffer);
  if (buffer === undefined) return err({ code: "unknown-buffer", buffer: dataset.buffer });
  const bufferPiece = at(type.pieces, buffer.position).name;
  const swaps = dataset.method === "m2" ? m2Swaps(puzzle) : swapVariants(puzzle, dataset.method);
  if (!swaps.ok) return err({ code: "invalid-swap", detail: JSON.stringify(swaps.error) });
  const text = formatMoves(movesOf(puzzle, dataset.swap.alg) ?? []);
  const swap = swaps.value.find((s) => s.bufferPiece === bufferPiece && formatMoves(s.moves) === text);
  if (swap === undefined || relabelled(puzzle, dataset.swap.symmetry, REFERENCE_SWAPS[dataset.method].alg) !== text) return err({ code: "swap-not-symmetry-image" });
  return ok(swap);
}

export function verifySwapDataset(puzzle: Puzzle, dataset: SwapDataset): SwapDatasetProblem[] {
  const problems: SwapDatasetProblem[] = [];
  const entryProblems: DatasetProblem[] = [];
  const swapResult = datasetSwapAlg(puzzle, dataset);
  if (!swapResult.ok) return [swapResult.error];
  const swap = swapResult.value;

  // The swap.
  const method = dataset.method;
  const stated = dataset.swap;
  if ((stated.source === "reference") !== (stated.symmetry === identitySymmetry(puzzle))) problems.push({ code: "swap-not-reference" });
  if (stated.citation !== REFERENCE_SWAPS[method].source) problems.push({ code: "citation-mismatch", record: "swap" });
  checkAlgEntry(puzzle, "swap", { alg: stated.alg, moves: stated.moves, etm: stated.etm, qtm: stated.qtm, htm: stated.htm, stm: stated.stm, source: "engine-search" }, swap.perm, entryProblems);
  const shape = analyseSwap(puzzle, method, swap.perm, swap.bufferPiece);
  if (!shape.ok) problems.push({ code: "invalid-swap", detail: JSON.stringify(shape.error) });
  const bufferIndex = pieceType(puzzle, dataset.pieceType).stickerByName(dataset.buffer)?.index ?? -1;
  if (stickerName(puzzle.geometry, at(swap.perm, bufferIndex)) !== stated.swapSticker) problems.push({ code: "swap-mismatch", field: "swapSticker" });
  if (JSON.stringify(stated.sideEffectPieces) !== JSON.stringify(swap.sideEffectPieces)) problems.push({ code: "swap-mismatch", field: "sideEffectPieces" });

  // Bounds and tables.
  const bounds = dataset.generatedBy.bounds;
  const expectedBounds = SPECIAL_BOUNDS[method];
  if (JSON.stringify(bounds) !== JSON.stringify({ generators: expectedBounds.generators, maxInsertion: expectedBounds.maxInsertion, maxSetup: expectedBounds.maxSetup })) {
    problems.push({ code: "bounds-mismatch" });
  }
  if (JSON.stringify(dataset.setupFamilies) !== JSON.stringify(DEFAULT_SETUP_POOLS[method].pool)) problems.push({ code: "setup-families-invalid", detail: "setupFamilies" });
  const legal = tables(puzzle, swap, dataset.buffer);
  if (!legal.ok) return [...problems, { code: "setup-families-invalid", detail: JSON.stringify(legal.error) }];
  const expectedSpecials = shootableTargets(puzzle, swap, dataset.buffer, legal.value.targets).filter((t) => t.setup === undefined).map((t) => t.target);
  if (JSON.stringify(dataset.specialTargets) !== JSON.stringify(expectedSpecials)) problems.push({ code: "special-targets-mismatch" });

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
        // The bounds say what the search was allowed to use. An alg from a source is judged by its effect
        // and carries its citation; it may be written with moves the search never tried.
        if (entry.source !== "engine-search") continue;
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
  const shootable = shootableTargets(puzzle, swap, dataset.buffer, legal.value.targets);
  const expectedIds = shootable.map((t) => t.target);
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
export function m2OpParityEffect(puzzle: Puzzle, corners: OpSetupsDataset, edges: SwapDataset): Result<StickerPerm, SwapDatasetProblem> {
  const cornerSwap = datasetSwap(puzzle, corners);
  if (!cornerSwap.ok) return cornerSwap;
  const edgeSwap = datasetSwapAlg(puzzle, edges);
  if (!edgeSwap.ok) return edgeSwap;
  return ok(composePerms(sideEffectPerm(puzzle, cornerSwap.value), sideEffectPerm(puzzle, edgeSwap.value)));
}

export interface M2OpParitySpec {
  readonly id: string;
  readonly corners: OpSetupsDataset;
  readonly edges: SwapDataset;
  readonly symmetry: number;
  readonly algs: SpecialAlgs;
}

export function buildM2OpParityDataset(puzzle: Puzzle, spec: M2OpParitySpec): Result<M2OpParityDataset, SwapDatasetProblem | SwapBuildError> {
  const effect = m2OpParityEffect(puzzle, spec.corners, spec.edges);
  if (!effect.ok) return effect;
  let algs: string[];
  if (spec.algs.kind === "search") {
    const m2 = datasetSwapAlg(puzzle, spec.edges);
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
    method: "m2-op",
    kind: "parity",
    generatedBy: spec.edges.generatedBy,
    buffers: { corners: spec.corners.buffer, edges: spec.edges.buffer },
    swaps: { corners: spec.corners.swap.alg, edges: spec.edges.swap.alg },
    symmetry: spec.symmetry,
    records: [{ id: "parity", kind: "parity", intendedEffect: { stickerCycles: stickerCycles(puzzle, effect.value), sideEffectPieces: [] }, algs: entries }],
  });
}

export function verifyM2OpParityDataset(puzzle: Puzzle, parity: M2OpParityDataset, corners: OpSetupsDataset, edges: SwapDataset): SwapDatasetProblem[] {
  const problems: SwapDatasetProblem[] = [];
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
