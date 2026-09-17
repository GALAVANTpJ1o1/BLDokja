import { KPattern } from "cubing/kpuzzle";
import { z } from "../core/zod.js";
import { permutationParity } from "../core/arrays.js";
import type { Puzzle } from "../core/puzzle.js";
import { centersRotation, normaliseByCenters } from "../core/frame.js";
import { AlgEntrySchema, entryForAlg, type AlgEntry, type DatasetProblem } from "./alg-dataset.js";

/**
 * CFOP last-layer cases (DECISIONS D-046): every full and 2-look OLL/PLL case, enumerated from first
 * principles instead of a memorised list. CLAUDE.md's "never write an algorithm from memory" rule
 * extends here to the *cases themselves* — a wrong case definition would silently teach the right
 * algorithm for the wrong picture.
 *
 * A last-layer state (first two layers solved) is exactly:
 *   - 4 U-layer corners: a permutation of slots 0-3, plus an orientation in {0,1,2} per slot;
 *   - 4 U-layer edges: a permutation of slots 0-3, plus an orientation in {0,1} per slot.
 * Slots 0-3 of the CORNERS/EDGES orbits are the U-layer ones for both piece types: confirmed by
 * inspecting cubing.js's own default pattern and the effect of a bare "U" move (only slots 0-3 move).
 *
 * Only three kinds of combination are reachable from a solved cube — checked empirically against
 * cubing.js's solver (see D-046: mismatched cases make it fail, matched ones solve and reverify):
 *   - corner-orientation sum = 0 (mod 3);
 *   - edge-orientation sum = 0 (mod 2);
 *   - corner-permutation parity = edge-permutation parity.
 *
 * OLL holds permutation at identity (57 non-trivial orientation combinations, up to 4 whole-cube
 * y-rotations). PLL holds orientation at identity and uses independent pre-/post-AUF equivalence.
 * Both counts are *computed* below, not assumed — they happen to match the
 * community's familiar "57 OLLs / 21 PLLs", which is a welcome check on the method, not a target
 * baked into it.
 *
 * Reference states hold unrelated U-layer data at identity where reachable; corner permutation uses
 * a parity-compatible edge companion. These are case definitions, not stronger algorithm goals:
 * EO may change corners, OLL may permute U, and corner permutation may move oriented edges. The
 * verifier checks the actual stage goal and preserved F2L, as well as notation/counts/provenance.
 * Shipped entries restore the centre frame so the matcher's subsequent physical U turns are valid.
 * Tests generalise OLL over all 216 orientation states with non-identity permutation and verify
 * corner/PLL paths over all 288 legal permutation states.
 *
 * Two different things both go by "rotate the case" here, and they are not the same operation:
 *   - `rotateOrient`: how an *orientation value* moves when you relabel slot i as slot sigma(i). The
 *     value itself (a twist/flip amount) is untouched, only its slot shifts: `after[j] =
 *     before[sigma^-1(j)]`. Checked empirically first (applying cubing.js's own "y" to a pattern with
 *     an identity permutation and distinguishable per-slot orientations): the value at old slot i
 *     lands at slot i-1, confirming the shift and its direction.
 *   - `rotatePerm`: how a *permutation* (which piece-index sits in each slot) moves when you relabel
 *     the same way. Piece indices are themselves slot names in disguise (piece 0 is "whatever belongs
 *     in slot 0"), so relabelling slots must relabel piece indices identically: `rotated[sigma(i)] =
 *     sigma(perm[i])`, i.e. conjugation by sigma. This is *not* the plain shift: applying cubing.js's
 *     actual "y" move to an identity permutation gives a cyclic 4-cycle, not identity, because a real
 *     move physically relocates pieces — but relabelling an already-solved picture must leave it
 *     looking solved. Conjugation does (`rotatePerm(identity) === identity`, checked below and in the
 *     test fixture, along with 4-fold return-to-start and cycle-type preservation).
 * Using the plain shift for permutations was an early, wrong version of this module (D-046): it
 * produced 71 "PLL" classes instead of 21, with the identity leaking through as its own non-trivial
 * case. Fixing that (making `rotatePerm` genuine conjugation) then produced 83 — still not 21, and for
 * a mathematical reason, not a coding one: 288 raw matched-parity (corner, edge) pairs cannot divide
 * into as few as 21 orbits under a group of order 4 (the minimum possible is 288/4 = 72). So the
 * community's well-known "21 PLLs" was never reachable by pure rotation at all, however carefully
 * coded.
 *
 * The actual equivalence PLL recognition uses is bigger: *independent* pre-AUF and post-AUF (rotate
 * the view before the algorithm, and separately rotate the finished cube after — solved is solved at
 * any U-facing, so the second rotation doesn't have to undo the first). Post-AUF relabels piece-index
 * values too (a permutation's values are slot names in disguise), while pre-AUF only changes which
 * slot is read; doing both independently, for independent amounts, is a genuinely larger equivalence
 * than conjugation (which is the special case where the two amounts are opposite). Computed this way,
 * corner+edge permutation pairs fall into exactly 21 non-trivial classes — confirmed in the test
 * fixture, and cross-checked against an independent source's count of corner-only cases (4) before
 * this module trusted it. `canonicalDoubleCosetPerm` implements it; `enumeratePll` is the only
 * enumeration that needs it — orientation values don't relabel under a turn, so pre- and post-AUF
 * collapse to one combined shift for OLL/EO/CO, and the 2-look permutation-only sub-steps
 * differ: corner recognition ignores edge permutation, uses independent AUFs and supplies a
 * parity-compatible edge companion. Edge permutation holds corners at true identity and uses
 * plain conjugation. Tests apply corner algorithms with AUFs to all 288 legal PLL states,
 * checking solved corners, oriented edges and preserved first two layers. The older four even-only
 * corner records also cover these states with AUFs, but duplicate recognition classes; they are not
 * the conventional two corner cases or an AUF-free exhaustive set.
 *
 * This module only builds cases and verifies algs against them; it never calls a solver. Generation
 * (scripts/generate-cfop-datasets.ts) is the only place that calls out to cubing.js's solver, exactly
 * like the existing 3-style/OP/M2 datasets (scripts/generate-datasets.ts).
 */

export type Tuple4<T> = readonly [T, T, T, T];
export type Perm4 = Tuple4<0 | 1 | 2 | 3>;
export type CornerOrient = Tuple4<0 | 1 | 2>;
export type EdgeOrient = Tuple4<0 | 1>;

const IDENTITY_PERM: Perm4 = [0, 1, 2, 3];
const ZERO_CORNER: CornerOrient = [0, 0, 0, 0];
const ZERO_EDGE: EdgeOrient = [0, 0, 0, 0];

/**
 * Relabels an orientation vector's slots: new slot j shows whatever old slot (j+1)%4 showed. Values
 * themselves are untouched (an orientation is rotation-invariant per piece). Direction was read off
 * cubing.js's own "y" move applied to a pattern with an identity permutation and distinguishable
 * per-slot values (module docs); the count fixture below pins the result down either way, since a
 * 4-element cyclic group's orbits don't depend on which direction you walk it.
 */
function rotateOrient<T>(v: Tuple4<T>): Tuple4<T> {
  return [v[1], v[2], v[3], v[0]];
}

/**
 * The permutation analogue of `rotateOrient`, for the same slot relabelling sigma(i) = (i+3) % 4 (so
 * that `rotateOrient`'s `new[j] = old[(j+1) % 4]` is `new[j] = old[sigma^-1(j)]`). A permutation's
 * piece-index values are themselves slot names, so they must be relabelled too — conjugation:
 * `rotatePerm(p)[j] = sigma(p[sigma^-1(j)])`. Confirms `rotatePerm(identity) === identity` and
 * preserves cycle type at every step (checked in the test fixture), unlike applying the plain shift
 * to a permutation, which does neither (D-046).
 */
function rotatePerm(p: Tuple4<number>): Tuple4<number> {
  const sigma = (x: number): number => (x + 3) % 4;
  return [sigma(p[1]), sigma(p[2]), sigma(p[3]), sigma(p[0])];
}

function keyOf(a: readonly number[], b: readonly number[]): string {
  return `${a.join(",")}|${b.join(",")}`;
}

/**
 * Canonical representatives of every non-identity rotation-orbit among `raw` pairs, in a deterministic
 * order (sorted by canonical key: lowest tuple values first digit-by-digit). `identity` is the solved
 * pair; its orbit is excluded, since a drill starts once something needs fixing. `rotate` must be
 * `rotateOrient` for orientation tuples or `rotatePerm` for permutation tuples (never mixed: every case
 * kind here pairs two tuples of the same kind, one possibly held constant).
 */
function canonicalPairs<A extends Tuple4<number>, B extends Tuple4<number>>(
  raw: readonly (readonly [A, B])[],
  identity: readonly [A, B],
  rotate: (v: Tuple4<number>) => Tuple4<number>,
): (readonly [A, B])[] {
  const identityKey = keyOf(identity[0], identity[1]);
  const canonOf = new Map<string, readonly [A, B]>();
  for (const pair of raw) {
    let canon: readonly [A, B] = pair;
    let canonKey = keyOf(pair[0], pair[1]);
    let cur: readonly [A, B] = pair;
    for (let i = 0; i < 3; i++) {
      cur = [rotate(cur[0]) as A, rotate(cur[1]) as B];
      const key = keyOf(cur[0], cur[1]);
      if (key < canonKey) {
        canon = cur;
        canonKey = key;
      }
    }
    if (canonKey === identityKey) continue;
    if (!canonOf.has(canonKey)) canonOf.set(canonKey, canon);
  }
  return [...canonOf.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, pair]) => pair);
}

/**
 * Canonical representatives under the double coset of independent pre-/post-AUF (see module docs):
 * `result[i] = (perm[(i + b) % 4] + a) % 4` for every a, b in 0..3, applied to corners and edges
 * together (one physical U-turn moves both piece types at once). `raw`'s own identity orbit is
 * excluded.
 */
function canonicalDoubleCosetPerm(raw: readonly (readonly [Perm4, Perm4])[]): (readonly [Perm4, Perm4])[] {
  const shifted = (p: Perm4, a: number, b: number): Perm4 => {
    const out: (0 | 1 | 2 | 3)[] = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) out[i] = (((p[(i + b) % 4] as number) + a) % 4) as 0 | 1 | 2 | 3;
    return out as unknown as Perm4;
  };
  const identityKey = keyOf(IDENTITY_PERM, IDENTITY_PERM);
  const canonOf = new Map<string, readonly [Perm4, Perm4]>();
  for (const [c, e] of raw) {
    let canon: readonly [Perm4, Perm4] = [c, e];
    let canonKey = keyOf(c, e);
    for (let a = 0; a < 4; a++) {
      for (let b = 0; b < 4; b++) {
        const cc = shifted(c, a, b);
        const ee = shifted(e, a, b);
        const key = keyOf(cc, ee);
        if (key < canonKey) {
          canonKey = key;
          canon = [cc, ee];
        }
      }
    }
    if (canonKey === identityKey) continue;
    if (!canonOf.has(canonKey)) canonOf.set(canonKey, canon);
  }
  return [...canonOf.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, pair]) => pair);
}

function permutations4(): Perm4[] {
  const values = [0, 1, 2, 3] as const;
  const result: Perm4[] = [];
  for (const a of values)
    for (const b of values)
      for (const c of values)
        for (const d of values) {
          if (a === b || a === c || a === d || b === c || b === d || c === d) continue;
          result.push([a, b, c, d]);
        }
  return result;
}

function cornerOrientations(): CornerOrient[] {
  const values = [0, 1, 2] as const;
  const result: CornerOrient[] = [];
  for (const a of values) for (const b of values) for (const c of values) for (const d of values) if ((a + b + c + d) % 3 === 0) result.push([a, b, c, d]);
  return result;
}

function edgeOrientations(): EdgeOrient[] {
  const values = [0, 1] as const;
  const result: EdgeOrient[] = [];
  for (const a of values) for (const b of values) for (const c of values) for (const d of values) if ((a + b + c + d) % 2 === 0) result.push([a, b, c, d]);
  return result;
}

function idOf(prefix: string, index: number, total: number): string {
  return `${prefix}-${String(index + 1).padStart(String(total).length, "0")}`;
}

export interface OllCase {
  readonly id: string;
  readonly corners: CornerOrient;
  readonly edges: EdgeOrient;
}

/** Every full-OLL case: orient both piece types, permutation untouched. Computed count: see test fixture. */
export function enumerateOll(): OllCase[] {
  const raw: (readonly [CornerOrient, EdgeOrient])[] = [];
  for (const c of cornerOrientations()) for (const e of edgeOrientations()) raw.push([c, e]);
  const classes = canonicalPairs(raw, [ZERO_CORNER, ZERO_EDGE], rotateOrient);
  return classes.map(([corners, edges], i) => ({ id: idOf("oll", i, classes.length), corners, edges }));
}

export interface PllCase {
  readonly id: string;
  readonly corners: Perm4;
  readonly edges: Perm4;
}

/** Every full-PLL case: permute both piece types, orientation untouched. Computed count: see test fixture. */
export function enumeratePll(): PllCase[] {
  const perms = permutations4();
  const raw: (readonly [Perm4, Perm4])[] = [];
  for (const c of perms) for (const e of perms) if (permutationParity(c) === permutationParity(e)) raw.push([c, e]);
  const classes = canonicalDoubleCosetPerm(raw);
  return classes.map(([corners, edges], i) => ({ id: idOf("pll", i, classes.length), corners, edges }));
}

export interface EoCase {
  readonly id: string;
  readonly edges: EdgeOrient;
}

/** 2-look OLL step 1: orient edges, corners already solved (so any valid alg generalises — see module docs). */
export function enumerateEo(): EoCase[] {
  const raw = edgeOrientations().map((edges): readonly [CornerOrient, EdgeOrient] => [ZERO_CORNER, edges]);
  const classes = canonicalPairs(raw, [ZERO_CORNER, ZERO_EDGE], rotateOrient);
  return classes.map(([, edges], i) => ({ id: idOf("eo", i, classes.length), edges }));
}

export interface CoCase {
  readonly id: string;
  readonly corners: CornerOrient;
}

/** 2-look OLL step 2: orient corners, edges already solved. */
export function enumerateCo(): CoCase[] {
  const raw = cornerOrientations().map((corners): readonly [CornerOrient, EdgeOrient] => [corners, ZERO_EDGE]);
  const classes = canonicalPairs(raw, [ZERO_CORNER, ZERO_EDGE], rotateOrient);
  return classes.map(([corners], i) => ({ id: idOf("co", i, classes.length), corners }));
}

export interface CornerPermCase {
  readonly id: string;
  readonly corners: Perm4;
}

/**
 * 2-look PLL step 1: recognise corners up to independent pre-/post-AUF, ignoring edge permutation.
 * Both permutation parities are included; the pattern supplies a parity-compatible edge companion.
 */
export function enumerateCornerPermOnly(): CornerPermCase[] {
  const raw = permutations4().map((corners): readonly [Perm4, Perm4] => [corners, corners]);
  const classes = canonicalDoubleCosetPerm(raw);
  return classes.map(([corners], i) => ({ id: idOf("corner-perm", i, classes.length), corners }));
}

export interface EdgePermCase {
  readonly id: string;
  readonly edges: Perm4;
}

/** 2-look PLL step 2: permute edges, corners already solved. Only even edge permutations are reachable. */
export function enumerateEdgePermOnly(): EdgePermCase[] {
  const raw = permutations4()
    .filter((edges) => permutationParity(edges) === 0)
    .map((edges): readonly [Perm4, Perm4] => [IDENTITY_PERM, edges]);
  const classes = canonicalPairs(raw, [IDENTITY_PERM, IDENTITY_PERM], rotatePerm);
  return classes.map(([, edges], i) => ({ id: idOf("edge-perm", i, classes.length), edges }));
}

interface LastLayerSpec {
  readonly cornersPerm: Perm4;
  readonly cornersOrient: CornerOrient;
  readonly edgesPerm: Perm4;
  readonly edgesOrient: EdgeOrient;
}

function lastLayerPattern(puzzle: Puzzle, spec: LastLayerSpec): KPattern {
  if (puzzle.id !== "3x3x3") throw new Error(`last-layer cases are 3x3x3-only, got ${puzzle.id}`);
  const defaults = puzzle.kpuzzle.defaultPattern().patternData;
  const corners = defaults.CORNERS;
  const edges = defaults.EDGES;
  if (corners === undefined || edges === undefined) throw new Error("3x3x3 kpuzzle has no CORNERS/EDGES orbit");
  const data = {
    ...defaults,
    CORNERS: { ...corners, pieces: [...spec.cornersPerm, 4, 5, 6, 7], orientation: [...spec.cornersOrient, 0, 0, 0, 0] },
    EDGES: { ...edges, pieces: [...spec.edgesPerm, 4, 5, 6, 7, 8, 9, 10, 11], orientation: [...spec.edgesOrient, 0, 0, 0, 0, 0, 0, 0, 0] },
  };
  return new KPattern(puzzle.kpuzzle, data);
}

export const ollPattern = (puzzle: Puzzle, kase: Pick<OllCase, "corners" | "edges">): KPattern =>
  lastLayerPattern(puzzle, { cornersPerm: IDENTITY_PERM, cornersOrient: kase.corners, edgesPerm: IDENTITY_PERM, edgesOrient: kase.edges });

export const pllPattern = (puzzle: Puzzle, kase: Pick<PllCase, "corners" | "edges">): KPattern =>
  lastLayerPattern(puzzle, { cornersPerm: kase.corners, cornersOrient: ZERO_CORNER, edgesPerm: kase.edges, edgesOrient: ZERO_EDGE });

export const eoPattern = (puzzle: Puzzle, kase: Pick<EoCase, "edges">): KPattern =>
  lastLayerPattern(puzzle, { cornersPerm: IDENTITY_PERM, cornersOrient: ZERO_CORNER, edgesPerm: IDENTITY_PERM, edgesOrient: kase.edges });

export const coPattern = (puzzle: Puzzle, kase: Pick<CoCase, "corners">): KPattern =>
  lastLayerPattern(puzzle, { cornersPerm: IDENTITY_PERM, cornersOrient: kase.corners, edgesPerm: IDENTITY_PERM, edgesOrient: ZERO_EDGE });

export const cornerPermPattern = (puzzle: Puzzle, kase: Pick<CornerPermCase, "corners">): KPattern =>
  lastLayerPattern(puzzle, { cornersPerm: kase.corners, cornersOrient: ZERO_CORNER, edgesPerm: permutationParity(kase.corners) === 0 ? IDENTITY_PERM : [1, 0, 2, 3], edgesOrient: ZERO_EDGE });

export const edgePermPattern = (puzzle: Puzzle, kase: Pick<EdgePermCase, "edges">): KPattern =>
  lastLayerPattern(puzzle, { cornersPerm: IDENTITY_PERM, cornersOrient: ZERO_CORNER, edgesPerm: kase.edges, edgesOrient: ZERO_EDGE });

export const LAST_LAYER_KINDS = ["oll", "pll", "eo", "co", "corner-perm", "edge-perm"] as const;
export type LastLayerKind = (typeof LAST_LAYER_KINDS)[number];

const Digit012 = z.union([z.literal(0), z.literal(1), z.literal(2)]);
const Digit01 = z.union([z.literal(0), z.literal(1)]);
const Digit0123 = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
const CornerOrientSchema = z.tuple([Digit012, Digit012, Digit012, Digit012]).refine(values => values.reduce<number>((sum, value) => sum + value, 0) % 3 === 0, "corner twist sum must be zero modulo three");
const EdgeOrientSchema = z.tuple([Digit01, Digit01, Digit01, Digit01]).refine(values => values.reduce<number>((sum, value) => sum + value, 0) % 2 === 0, "edge flip sum must be even");
const Perm4Schema = z.tuple([Digit0123, Digit0123, Digit0123, Digit0123]).refine(values => new Set(values).size === 4, "permutation must contain each slot exactly once");

const envelope = {
  format: z.literal("bld-platform/last-layer-dataset"),
  version: z.literal(1),
  id: z.string().min(1),
  puzzle: z.literal("3x3x3"),
  generatedBy: z.object({ engine: z.string().min(1) }),
};
const algsField = z.array(AlgEntrySchema).min(1).max(4);

export const OllDatasetSchema = z.object({ ...envelope, kind: z.literal("oll"), records: z.array(z.object({ id: z.string().min(1), corners: CornerOrientSchema, edges: EdgeOrientSchema, algs: algsField })) });
export const PllDatasetSchema = z.object({ ...envelope, kind: z.literal("pll"), records: z.array(z.object({ id: z.string().min(1), corners: Perm4Schema, edges: Perm4Schema, algs: algsField }).refine(record => permutationParity(record.corners) === permutationParity(record.edges), "corner and edge permutation parity must match")) });
export const EoDatasetSchema = z.object({ ...envelope, kind: z.literal("eo"), records: z.array(z.object({ id: z.string().min(1), edges: EdgeOrientSchema, algs: algsField })) });
export const CoDatasetSchema = z.object({ ...envelope, kind: z.literal("co"), records: z.array(z.object({ id: z.string().min(1), corners: CornerOrientSchema, algs: algsField })) });
export const CornerPermDatasetSchema = z.object({ ...envelope, kind: z.literal("corner-perm"), records: z.array(z.object({ id: z.string().min(1), corners: Perm4Schema, algs: algsField })) });
export const EdgePermDatasetSchema = z.object({ ...envelope, kind: z.literal("edge-perm"), records: z.array(z.object({ id: z.string().min(1), edges: Perm4Schema.refine(values => permutationParity(values) === 0, "solved corners require even edge permutation"), algs: algsField })) });

export const LastLayerDatasetSchema = z.discriminatedUnion("kind", [OllDatasetSchema, PllDatasetSchema, EoDatasetSchema, CoDatasetSchema, CornerPermDatasetSchema, EdgePermDatasetSchema]);
export type LastLayerDataset = z.infer<typeof LastLayerDatasetSchema>;
export type OllDataset = z.infer<typeof OllDatasetSchema>;
export type PllDataset = z.infer<typeof PllDatasetSchema>;
export type EoDataset = z.infer<typeof EoDatasetSchema>;
export type CoDataset = z.infer<typeof CoDatasetSchema>;
export type CornerPermDataset = z.infer<typeof CornerPermDatasetSchema>;
export type EdgePermDataset = z.infer<typeof EdgePermDatasetSchema>;

/**
 * Verifies notation/counts and the actual stage goal on the independently rebuilt case. OLL may
 * permute the U layer; corner permutation may move oriented edges. Neither should be rejected for
 * not solving more than its stage. All stages must preserve the first two layers.
 */
function verifyAgainst(puzzle: Puzzle, state: KPattern, kind: LastLayerKind, recordId: string, algs: readonly AlgEntry[]): DatasetProblem[] {
  const problems: DatasetProblem[] = [];
  const seen = new Set<string>();
  for (const entry of algs) {
    let computed: AlgEntry;
    try { computed = entryForAlg(puzzle, entry.alg, entry.source, entry.citation); }
    catch { problems.push({ code: "invalid-alg", record: recordId, alg: entry.alg }); continue; }
    if (computed.alg !== entry.alg) problems.push({ code: "alg-not-canonical", record: recordId, alg: entry.alg, canonical: computed.alg });
    if (computed.moves !== entry.moves) problems.push({ code: "moves-mismatch", record: recordId, alg: entry.alg });
    if (["etm", "qtm", "htm", "stm"].some(key => computed[key as "etm" | "qtm" | "htm" | "stm"] !== entry[key as "etm" | "qtm" | "htm" | "stm"])) problems.push({ code: "counts-mismatch", record: recordId, alg: entry.alg });
    const result = state.applyAlg(computed.moves);
    if (centersRotation(puzzle, result)?.alg !== "" || !lastLayerStageSatisfied(puzzle, result, kind)) problems.push({ code: "does-not-solve", record: recordId, alg: entry.alg, reason: "stage goal, first-two-layer preservation or restored centre frame failed" });
    if (seen.has(entry.moves)) problems.push({ code: "duplicate-alg", record: recordId, alg: entry.alg });
    seen.add(entry.moves);
  }
  return problems;
}

/** Stage-specific goal, in the fixed-centre frame. Does not confuse OLL with solving all of PLL. */
export function lastLayerStageSatisfied(puzzle: Puzzle, pattern: KPattern, kind: LastLayerKind): boolean {
  if (puzzle.id !== "3x3x3") return false;
  const state = normaliseByCenters(puzzle, pattern);
  const corners = state?.patternData.CORNERS; const edges = state?.patternData.EDGES;
  if (corners === undefined || edges === undefined) return false;
  for (const orbit of [corners, edges]) {
    if (!orbit.pieces.slice(4).every((piece, index) => piece === index + 4) || !orbit.orientation.slice(4).every(value => value === 0)) return false;
  }
  const cornersOriented = corners.orientation.every(value => value === 0);
  const edgesOriented = edges.orientation.every(value => value === 0);
  const cornersSolved = cornersOriented && corners.pieces.every((piece, index) => piece === index);
  const edgesSolved = edgesOriented && edges.pieces.every((piece, index) => piece === index);
  switch (kind) {
    case "eo": return edgesOriented;
    case "oll": case "co": return cornersOriented && edgesOriented;
    case "corner-perm": return cornersSolved && edgesOriented;
    case "pll": case "edge-perm": return cornersSolved && edgesSolved;
  }
}

/** Every expected id, in the dataset's own canonical order, for the completeness check below. */
export function lastLayerCases(kind: LastLayerKind): readonly { readonly id: string; readonly corners?: readonly number[]; readonly edges?: readonly number[] }[] {
  switch (kind) {
    case "oll":
      return enumerateOll();
    case "pll":
      return enumeratePll();
    case "eo":
      return enumerateEo();
    case "co":
      return enumerateCo();
    case "corner-perm":
      return enumerateCornerPermOnly();
    case "edge-perm":
      return enumerateEdgePermOnly();
  }
}

export function lastLayerRecordPattern(puzzle: Puzzle, dataset: LastLayerDataset, record: LastLayerDataset["records"][number]): KPattern {
  switch (dataset.kind) {
    case "oll":
      return ollPattern(puzzle, record as OllCase);
    case "pll":
      return pllPattern(puzzle, record as PllCase);
    case "eo":
      return eoPattern(puzzle, record as EoCase);
    case "co":
      return coPattern(puzzle, record as CoCase);
    case "corner-perm":
      return cornerPermPattern(puzzle, record as CornerPermCase);
    case "edge-perm":
      return edgePermPattern(puzzle, record as EdgePermCase);
  }
}

/** Every record verified against its own case fields, and exactly the expected ids present, in order. */
export function verifyLastLayerDataset(puzzle: Puzzle, dataset: LastLayerDataset): DatasetProblem[] {
  const problems: DatasetProblem[] = [];
  const expectedCasesForKind = lastLayerCases(dataset.kind);
  const signature = (record: { readonly corners?: readonly number[]; readonly edges?: readonly number[] }) => JSON.stringify([record.corners ?? null, record.edges ?? null]);
  const signatures = new Map(expectedCasesForKind.map(record => [record.id, signature(record)]));
  if (dataset.id !== dataset.kind) problems.push({ code: "invalid-case", record: dataset.id, detail: "dataset id must match its kind" });
  for (const record of dataset.records) {
    if (signatures.has(record.id) && signatures.get(record.id) !== signature(record)) {
      problems.push({ code: "invalid-case", record: record.id, detail: "case fields do not match the independently enumerated canonical id" });
      continue;
    }
    const state = lastLayerRecordPattern(puzzle, dataset, record);
    problems.push(...verifyAgainst(puzzle, state, dataset.kind, record.id, record.algs));
  }
  const expected = expectedCasesForKind.map(record => record.id);
  const present = dataset.records.map((r) => r.id);
  const presentSet = new Set(present);
  const expectedSet = new Set(expected);
  for (const id of expected) if (!presentSet.has(id)) problems.push({ code: "missing-record", record: id });
  for (const id of present) if (!expectedSet.has(id)) problems.push({ code: "unexpected-record", record: id });
  const inOrder = present.filter((id) => expectedSet.has(id));
  if (JSON.stringify(inOrder) !== JSON.stringify(expected.filter((id) => presentSet.has(id)))) problems.push({ code: "records-out-of-order" });
  return problems;
}
