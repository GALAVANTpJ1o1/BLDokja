import type { KPattern } from "cubing/kpuzzle";
import { z } from "../core/zod.js";
import { at } from "../core/arrays.js";
import { composePerms, identityPerm, moveTable } from "../core/move-table.js";
import { faceletsOf, VERIFIED_MOVE_FAMILIES, type Puzzle } from "../core/puzzle.js";
import type { Result } from "../core/result.js";
import { cancelMoves, expandNodes, formatMoves } from "../commutator/expand.js";
import type { FoundComm } from "../commutator/conjugate-search.js";
import { moveCounts } from "../commutator/metrics.js";
import { formatAlg, parseAlg } from "../commutator/parse.js";
import { orientationPairPattern, threeCyclePattern, validateComm, validateOrientationAlg, type CommValidation } from "../commutator/validate.js";
import { stickerName } from "../pieces/names.js";
import { pieceType } from "../pieces/piece-types.js";

/**
 * Alg datasets (DECISIONS D-023): what `content/algs/` holds, and how every record is checked.
 *
 * A record names its case in sticker and piece names (never letters, D-009), states the intended
 * effect explicitly as sticker cycles, and lists up to four algs, main first. `verifyRecord`
 * recomputes the intended effect from the case alone and checks every alg against it: the notation,
 * the cancelled moves, the move counts, the whole-puzzle sticker permutation, and that it solves the
 * case state. Nothing here reads files; tests and the generator do.
 */

const NAME = /^[UDRLFB]{1,3}[udrlfb]{0,2}$/;
export const StickerName = z.string().regex(NAME, "not a sticker name");
export const PieceName = z.string().regex(NAME, "not a piece name");

/**
 * - `engine-search`: found by the engine's searches (for OP targets, the setup is searched and the swap is the dataset's).
 * - `cubing-solver`: cubing.js's solver.
 * - `reference`: a single named alg from a cited source, verified like everything else.
 * - `symmetry`: a verified symmetry image of a cited reference alg.
 */
export const ALG_SOURCES = ["engine-search", "cubing-solver", "reference", "symmetry"] as const;

export const AlgEntrySchema = z
  .object({
    /** Canonical notation (`formatAlg`). */
    alg: z.string().min(1),
    /** Expanded and cancelled (D-017). */
    moves: z.string(),
    etm: z.number().int().nonnegative(),
    qtm: z.number().int().nonnegative(),
    htm: z.number().int().nonnegative(),
    stm: z.number().int().nonnegative(),
    source: z.enum(ALG_SOURCES),
    /** Required for `reference` and `symmetry` entries: where the reference alg comes from. */
    citation: z.string().min(1).optional(),
  })
  .refine((entry) => (entry.source === "reference" || entry.source === "symmetry") === (entry.citation !== undefined), {
    message: "reference and symmetry entries need a citation, and only they have one",
    path: ["citation"],
  });

export const IntendedEffectSchema = z.object({
  /** Every sticker the alg moves, as cycles; each starts at its lowest sticker, cycles in that order. */
  stickerCycles: z.array(z.array(StickerName).min(2)),
  /** Pieces the alg may move besides the case's own. Always empty for 3-style. */
  sideEffectPieces: z.array(PieceName),
});

const recordBase = {
  id: z.string().min(1),
  intendedEffect: IntendedEffectSchema,
  algs: z.array(AlgEntrySchema).min(1).max(4),
};

export const AlgRecordSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("cycle"), targets: z.tuple([StickerName, StickerName]), ...recordBase }),
  z.object({ kind: z.literal("twist"), target: PieceName, direction: z.enum(["clockwise", "counterclockwise"]), ...recordBase }),
  z.object({ kind: z.literal("flip"), target: PieceName, ...recordBase }),
]);

export const AlgDatasetSchema = z.object({
  format: z.literal("bld-platform/alg-dataset"),
  version: z.literal(1),
  id: z.string().min(1),
  puzzle: z.literal("3x3x3"),
  method: z.literal("3style"),
  pieceType: z.enum(["corners", "edges"]),
  /** Buffer sticker. */
  buffer: StickerName,
  kind: z.enum(["cycles", "twists", "flips"]),
  generatedBy: z.object({
    engine: z.string().min(1),
    bounds: z.object({ generators: z.array(z.string()), maxInsertion: z.number().int(), maxSetup: z.number().int() }),
  }),
  records: z.array(AlgRecordSchema),
});

export type AlgEntry = z.infer<typeof AlgEntrySchema>;
export type AlgRecord = z.infer<typeof AlgRecordSchema>;
export type AlgDataset = z.infer<typeof AlgDatasetSchema>;
export type AlgSource = (typeof ALG_SOURCES)[number];

export type DatasetProblem =
  | { readonly code: "invalid-case"; readonly record: string; readonly detail: string }
  | { readonly code: "wrong-id"; readonly record: string; readonly expected: string }
  | { readonly code: "kind-mismatch"; readonly record: string }
  | { readonly code: "wrong-intended-effect"; readonly record: string }
  | { readonly code: "side-effects-not-allowed"; readonly record: string }
  | { readonly code: "invalid-alg"; readonly record: string; readonly alg: string }
  | { readonly code: "alg-not-canonical"; readonly record: string; readonly alg: string; readonly canonical: string }
  | { readonly code: "moves-mismatch"; readonly record: string; readonly alg: string }
  | { readonly code: "counts-mismatch"; readonly record: string; readonly alg: string }
  | { readonly code: "wrong-effect"; readonly record: string; readonly alg: string }
  | { readonly code: "does-not-solve"; readonly record: string; readonly alg: string; readonly reason: string }
  | { readonly code: "duplicate-alg"; readonly record: string; readonly alg: string }
  | { readonly code: "missing-record"; readonly record: string }
  | { readonly code: "unexpected-record"; readonly record: string }
  | { readonly code: "records-out-of-order" }
  | { readonly code: "unknown-buffer"; readonly buffer: string };

const RECORD_KIND = { cycles: "cycle", twists: "twist", flips: "flip" } as const;

/** Record ids in canonical order: every case the dataset must cover. */
export function expectedRecordIds(puzzle: Puzzle, dataset: Pick<AlgDataset, "pieceType" | "buffer" | "kind">): string[] | undefined {
  const type = pieceType(puzzle, dataset.pieceType);
  const buffer = type.stickerByName(dataset.buffer);
  if (buffer === undefined) return undefined;
  const ids: string[] = [];
  if (dataset.kind === "cycles") {
    for (const first of type.stickers) {
      if (first.position === buffer.position) continue;
      for (const second of type.stickers) if (second.position !== buffer.position && second.position !== first.position) ids.push(`${first.name}-${second.name}`);
    }
  } else {
    for (const piece of type.pieces) {
      if (piece.position === buffer.position) continue;
      if (dataset.kind === "twists") ids.push(`${piece.name}-clockwise`, `${piece.name}-counterclockwise`);
      else ids.push(piece.name);
    }
  }
  return ids;
}

function recordId(record: AlgRecord): string {
  switch (record.kind) {
    case "cycle":
      return `${record.targets[0]}-${record.targets[1]}`;
    case "twist":
      return `${record.target}-${record.direction}`;
    case "flip":
      return record.target;
  }
}

function caseState(puzzle: Puzzle, buffer: string, record: AlgRecord): Result<KPattern, unknown> {
  switch (record.kind) {
    case "cycle":
      return threeCyclePattern(puzzle, [buffer, record.targets[0], record.targets[1]]);
    case "twist":
      return orientationPairPattern(puzzle, { buffer, target: record.target, direction: record.direction });
    case "flip":
      return orientationPairPattern(puzzle, { buffer, target: record.target });
  }
}

/** Sticker cycles of a permutation: each starts at its lowest sticker, cycles in that order. */
export function stickerCycles(puzzle: Puzzle, perm: ArrayLike<number>): string[][] {
  const cycles: string[][] = [];
  const seen = new Set<number>();
  for (let s = 0; s < perm.length; s++) {
    if (seen.has(s) || at(perm, s) === s) continue;
    const cycle: string[] = [];
    for (let x = s; !seen.has(x); x = at(perm, x)) {
      seen.add(x);
      cycle.push(stickerName(puzzle.geometry, x));
    }
    cycles.push(cycle);
  }
  return cycles;
}

/** The permutation that solves the case: the sticker now in each slot must travel home. */
function requiredPermutation(puzzle: Puzzle, state: KPattern): Int32Array {
  return faceletsOf(puzzle, state);
}

function judgeRecord(puzzle: Puzzle, buffer: string, record: AlgRecord, alg: string): Result<CommValidation, unknown> {
  switch (record.kind) {
    case "cycle":
      return validateComm(puzzle, alg, [buffer, record.targets[0], record.targets[1]]);
    case "twist":
      return validateOrientationAlg(puzzle, alg, { buffer, target: record.target, direction: record.direction });
    case "flip":
      return validateOrientationAlg(puzzle, alg, { buffer, target: record.target });
  }
}

export function verifyRecord(puzzle: Puzzle, dataset: Pick<AlgDataset, "buffer" | "kind">, record: AlgRecord): DatasetProblem[] {
  const id = recordId(record);
  const problems: DatasetProblem[] = [];
  if (record.id !== id) problems.push({ code: "wrong-id", record: record.id, expected: id });
  if (RECORD_KIND[dataset.kind] !== record.kind) problems.push({ code: "kind-mismatch", record: record.id });
  if (record.intendedEffect.sideEffectPieces.length > 0) problems.push({ code: "side-effects-not-allowed", record: record.id });

  const state = caseState(puzzle, dataset.buffer, record);
  if (!state.ok) return [...problems, { code: "invalid-case", record: record.id, detail: JSON.stringify(state.error) }];
  const required = requiredPermutation(puzzle, state.value);
  if (JSON.stringify(record.intendedEffect.stickerCycles) !== JSON.stringify(stickerCycles(puzzle, required))) {
    problems.push({ code: "wrong-intended-effect", record: record.id });
  }

  const seen = new Set<string>();
  for (const entry of record.algs) {
    if (!checkAlgEntry(puzzle, record.id, entry, required, problems)) continue;
    if (seen.has(entry.moves)) problems.push({ code: "duplicate-alg", record: record.id, alg: entry.alg });
    seen.add(entry.moves);
    const judged = judgeRecord(puzzle, dataset.buffer, record, entry.alg);
    if (!judged.ok) problems.push({ code: "does-not-solve", record: record.id, alg: entry.alg, reason: JSON.stringify(judged.error) });
    else if (!judged.value.valid) problems.push({ code: "does-not-solve", record: record.id, alg: entry.alg, reason: judged.value.reason });
  }
  return problems;
}

/**
 * The checks every alg entry gets, whatever its dataset: the notation parses and is canonical, the
 * stored moves are its cancelled expansion, the counts match D-017, and its whole-puzzle sticker
 * permutation (centres included) equals `required`. Problems are appended; returns false only if the
 * notation doesn't parse.
 */
/**
 * Whether two effects look the same on the cube. Identical pieces have no identity of their own: four
 * x-centres share a colour, so an alg that leaves every slot showing the right colour has done its job,
 * even if it put a different one of the four there. Everything else is compared sticker by sticker.
 */
export function sameVisibleEffect(puzzle: Puzzle, actual: ArrayLike<number>, required: ArrayLike<number>): boolean {
  const { geometry, stickerMap } = puzzle;
  if (actual.length !== required.length) return false;
  for (let slot = 0; slot < actual.length; slot++) {
    const a = at(actual, slot);
    const b = at(required, slot);
    if (a === b) continue;
    const orbit = at(stickerMap.orbits, at(stickerMap.slotOfSticker, slot).orbitIndex);
    if (!orbit.interchangeable || geometry.sticker(a).face !== geometry.sticker(b).face) return false;
  }
  return true;
}

export function checkAlgEntry(puzzle: Puzzle, record: string, entry: AlgEntry, required: ArrayLike<number>, problems: DatasetProblem[], compare: "stickers" | "colours" = "stickers"): boolean {
  const parsed = parseAlg(puzzle.id, entry.alg);
  if (!parsed.ok) {
    problems.push({ code: "invalid-alg", record, alg: entry.alg });
    return false;
  }
  const canonical = formatAlg(parsed.value);
  if (canonical !== entry.alg) problems.push({ code: "alg-not-canonical", record, alg: entry.alg, canonical });
  const moves = cancelMoves(puzzle.id, expandNodes(parsed.value.nodes));
  if (formatMoves(moves) !== entry.moves) problems.push({ code: "moves-mismatch", record, alg: entry.alg });
  const counts = moveCounts(puzzle.id, moves);
  if (counts.etm !== entry.etm || counts.qtm !== entry.qtm || counts.htm !== entry.htm || counts.stm !== entry.stm) {
    problems.push({ code: "counts-mismatch", record, alg: entry.alg });
  }
  const table = moveTable(puzzle, VERIFIED_MOVE_FAMILIES[puzzle.id]);
  const perm = moves.reduce((p, m) => composePerms(p, table.move(m.family, m.amount).perm), identityPerm(table.stickerCount));
  const right = compare === "colours" ? sameVisibleEffect(puzzle, perm, required) : perm.every((to, from) => to === required[from]);
  if (!right) problems.push({ code: "wrong-effect", record, alg: entry.alg });
  return true;
}

/** A dataset entry for any notation: canonical form, cancelled moves and counts computed here. */
export function entryForAlg(puzzle: Puzzle, alg: string, source: AlgSource, citation?: string): AlgEntry {
  const parsed = parseAlg(puzzle.id, alg);
  if (!parsed.ok) throw new Error(`"${alg}" doesn't parse: ${JSON.stringify(parsed.error)}`);
  const moves = cancelMoves(puzzle.id, expandNodes(parsed.value.nodes));
  const { etm, qtm, htm, stm } = moveCounts(puzzle.id, moves);
  return { alg: formatAlg(parsed.value), moves: formatMoves(moves), etm, qtm, htm, stm, source, ...(citation === undefined ? {} : { citation }) };
}

/** Every record verified, and exactly the expected cases present, in canonical order. */
export function verifyDataset(puzzle: Puzzle, dataset: AlgDataset): DatasetProblem[] {
  const expected = expectedRecordIds(puzzle, dataset);
  if (expected === undefined) return [{ code: "unknown-buffer", buffer: dataset.buffer }];
  const problems = dataset.records.flatMap((record) => verifyRecord(puzzle, dataset, record));
  const present = dataset.records.map((r) => r.id);
  const presentSet = new Set(present);
  const expectedSet = new Set(expected);
  for (const id of expected) if (!presentSet.has(id)) problems.push({ code: "missing-record", record: id });
  for (const id of present) if (!expectedSet.has(id)) problems.push({ code: "unexpected-record", record: id });
  const inOrder = present.filter((id) => expectedSet.has(id));
  if (JSON.stringify(inOrder) !== JSON.stringify(expected.filter((id) => presentSet.has(id)))) problems.push({ code: "records-out-of-order" });
  return problems;
}

/** A dataset entry for a found comm. */
export function algEntry(_puzzle: Puzzle, found: FoundComm, source: AlgSource): AlgEntry {
  const { etm, qtm, htm, stm } = found.counts;
  return { alg: formatAlg(found.alg), moves: formatMoves(found.moves), etm, qtm, htm, stm, source };
}

export type RecordCase =
  | { readonly kind: "cycle"; readonly targets: readonly [string, string] }
  | { readonly kind: "twist"; readonly target: string; readonly direction: "clockwise" | "counterclockwise" }
  | { readonly kind: "flip"; readonly target: string };

/** A record with its id and intended effect computed from the case, never from the algs. */
export function buildRecord(puzzle: Puzzle, buffer: string, recordCase: RecordCase, algs: readonly AlgEntry[]): AlgRecord {
  // Key order is the order a person reads the JSON in: id, the case, its effect, then the algs.
  const effect = { stickerCycles: [] as string[][], sideEffectPieces: [] as string[] };
  let record: AlgRecord;
  switch (recordCase.kind) {
    case "cycle":
      record = { id: "", kind: "cycle", targets: [recordCase.targets[0], recordCase.targets[1]], intendedEffect: effect, algs: [...algs] };
      break;
    case "twist":
      record = { id: "", kind: "twist", target: recordCase.target, direction: recordCase.direction, intendedEffect: effect, algs: [...algs] };
      break;
    case "flip":
      record = { id: "", kind: "flip", target: recordCase.target, intendedEffect: effect, algs: [...algs] };
      break;
  }
  const state = caseState(puzzle, buffer, record);
  if (!state.ok) throw new Error(`invalid case ${JSON.stringify(recordCase)}: ${JSON.stringify(state.error)}`);
  record.id = recordId(record);
  effect.stickerCycles = stickerCycles(puzzle, requiredPermutation(puzzle, state.value));
  return record;
}
